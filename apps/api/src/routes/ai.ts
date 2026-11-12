import type { Difficulty, Section } from '@prisma/client';
import { AI_MODELS, freshFirst } from '@sat/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { hasRole, me, requireActive, requireAuth, requireRole } from '../lib/auth';
import { aiConfigured } from '../lib/aiClient';
import { createJob, jobView, studentJobsToday, tashkentDayStart } from '../lib/aiJobs';
import { skillById, type SampleFile, type Slot } from '../lib/aiQuestions';
import { chatState, clearChat, listMessages, recentMistakes, sendChat, teachSkill } from '../lib/aiTutor';
import { filterCatalog, getCatalog, type CatalogItem } from '../lib/catalog';
import { reportShortages, seenTemplates } from '../lib/fresh';
import { ah, forbidden, HttpError, notFound, parse } from '../lib/http';
import { createSession } from '../lib/sessions';
import { getSettings } from '../lib/settings';
import { ensureRatings } from '../lib/users';

export const aiRouter = Router();
aiRouter.use(requireAuth);

const imageSchema = z.object({
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  data: z.string().min(100).max(7_000_000),
});
const stripDataUrl = (s: string) => s.replace(/^data:[^;]+;base64,/, '');

/** AI holati: kalit bormi, chat limiti, o'quvchining bugungi «yangi savollar» soni. */
aiRouter.get(
  '/status',
  ah(async (req, res) => {
    const u = me(req);
    const s = (await getSettings()).ai;
    const staff = hasRole(u, 'OPERATOR', 'TEACHER');
    res.json({
      ...(await chatState(u)),
      practice: { limit: staff ? null : s.studentDailyJobs, used: await studentJobsToday(u.id) },
      models: hasRole(u, 'OPERATOR') ? { chat: s.chatModel, gen: s.genModel, verify: s.verifyModel, list: AI_MODELS } : undefined,
    });
  }),
);

// ───────────────────────── AI ustoz (chat) ─────────────────────────

aiRouter.get(
  '/chat',
  ah(async (req, res) => {
    res.json({ messages: await listMessages(me(req).id) });
  }),
);

aiRouter.post(
  '/chat',
  ah(async (req, res) => {
    const body = parse(
      z.object({ text: z.string().max(4000).default(''), image: imageSchema.nullish(), answerId: z.string().max(40).nullish() }),
      req.body,
    );
    const image = body.image ? { mime: body.image.mime, data: stripDataUrl(body.image.data) } : null;
    const out = await sendChat(me(req), { text: body.text, image, answerId: body.answerId, channel: 'app' });
    res.json({ ...out, state: await chatState(me(req)) });
  }),
);

aiRouter.delete(
  '/chat',
  ah(async (req, res) => {
    await clearChat(me(req).id);
    res.json({ ok: true });
  }),
);

/** Zaif mavzuni tushuntirish (o'quvchining xatolari asosida). */
aiRouter.post(
  '/lesson',
  ah(async (req, res) => {
    const { skillId } = parse(z.object({ skillId: z.string().min(1).max(40) }), req.body);
    const out = await teachSkill(me(req), skillId, 'app');
    res.json({ ...out, state: await chatState(me(req)) });
  }),
);

// ───────────────────────── Zaif mavzu: yangi savollar ─────────────────────────

/** O'quvchi reytingiga qarab qiyinlik rejasi (6 ta savol). */
function studentDifficulties(internal: number): Difficulty[] {
  if (internal < 1000) return ['EASY', 'EASY', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HARD'];
  if (internal < 1300) return ['EASY', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HARD', 'HARD'];
  return ['MEDIUM', 'MEDIUM', 'HARD', 'HARD', 'HARD', 'HARD'];
}

/**
 * «✨ Yangi savollar»: shu mavzuda o'quvchi ko'rmagan savollar bilan mashq.
 * Bankda yetarli bo'lmasa (va AI sozlangan bo'lsa) — avval AI yangi savollar yaratadi ({ jobId }),
 * tayyor bo'lgach frontend shu so'rovni jobId bilan qayta yuboradi va sessiya ochiladi.
 */
aiRouter.post(
  '/practice',
  requireActive,
  ah(async (req, res) => {
    const body = parse(
      z.object({ skillId: z.string().min(1).max(40), jobId: z.string().max(40).nullish(), count: z.number().int().min(3).max(20).default(10) }),
      req.body,
    );
    const u = me(req);
    const sk = skillById(body.skillId);
    if (!sk) throw notFound("Ko'nikma");
    const s = (await getSettings()).ai;
    const [catalog, seen] = await Promise.all([getCatalog(), seenTemplates(u.id)]);
    const base = filterCatalog(catalog, { skillId: sk.id });
    const fresh = base.filter((c) => !seen.has(c.id));

    let jobRefs: CatalogItem[] = [];
    if (body.jobId) {
      const job = await prisma.aiJob.findUnique({ where: { id: body.jobId } });
      if (!job || job.forUserId !== u.id) throw notFound('AI vazifa');
      if (job.status === 'QUEUED' || job.status === 'RUNNING') throw new HttpError(409, 'AI hali savollarni tayyorlayapti', 'AI_JOB_RUNNING');
      // avto-nashr o'chiq bo'lsa ham o'quvchi o'zi uchun yaratilganlarini ishlaydi
      const rows = await prisma.questionTemplate.findMany({ where: { id: { in: job.templateIds }, status: { not: 'ARCHIVED' } } });
      jobRefs = rows.filter((t) => !seen.has(t.id));
    } else if (fresh.length < 5 && aiConfigured()) {
      const staff = hasRole(u, 'OPERATOR', 'TEACHER');
      const used = await studentJobsToday(u.id);
      if (staff || used < s.studentDailyJobs) {
        const ratings = await ensureRatings(u.id);
        const slots: Slot[] = studentDifficulties(ratings[sk.section].rating).map((d) => ({ skillId: sk.id, difficulty: d }));
        const mistakes = await recentMistakes(u.id, sk.id, 3);
        const job = await createJob({
          section: sk.section,
          reason: 'student',
          forUserId: u.id,
          input: {
            mode: 'topic',
            skillIds: [sk.id],
            slots,
            count: slots.length,
            studentContext: mistakes.length ? mistakes.map((m, i) => `--- Mistake ${i + 1} ---\n${m}`).join('\n') : undefined,
          },
        });
        return res.status(202).json({ jobId: job.id });
      }
    }

    const jobIds = new Set(jobRefs.map((r) => r.id));
    const refs = [...jobRefs, ...freshFirst(base.filter((c) => !jobIds.has(c.id)), seen, { float: Math.random })].slice(0, body.count);
    if (!refs.length) throw new HttpError(409, "Bu mavzuda hali savollar yo'q", 'NO_QUESTIONS');
    // AI hozirgina yaratgan bo'lsa (jobId) — avto-to'ldirish shart emas
    if (!body.jobId) reportShortages(refs, seen);
    const attempt = await createSession(u.id, 'PRACTICE', refs, {
      title: `✨ ${sk.name}`,
      meta: { section: sk.section, domainId: sk.domainId, skillId: sk.id, difficulty: 'ANY', ai: true },
    });
    res.status(201).json({ attemptId: attempt.id, fresh: refs.filter((r) => !seen.has(r.id)).length, total: refs.length });
  }),
);

aiRouter.get(
  '/jobs/:id',
  ah(async (req, res) => {
    const u = me(req);
    const job = await prisma.aiJob.findUnique({ where: { id: req.params.id } });
    if (!job) throw notFound('AI vazifa');
    if (job.forUserId !== u.id && job.createdById !== u.id && !hasRole(u, 'OPERATOR')) throw forbidden();
    res.json(jobView(job));
  }),
);

// ───────────────────────── Admin: AI savol generatori ─────────────────────────

const fileSchema = z.object({
  name: z.string().max(200).optional(),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']),
  data: z.string().min(100).max(30_000_000),
});

aiRouter.post(
  '/generate',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const body = parse(
      z
        .object({
          section: z.enum(['MATH', 'RW']),
          mode: z.enum(['topic', 'sample']),
          domainId: z.string().max(40).nullish(),
          skillIds: z.array(z.string().max(40)).max(20).default([]),
          difficulty: z.enum(['MIXED', 'EASY', 'MEDIUM', 'HARD']).default('MIXED'),
          count: z.number().int().min(1).max(30).default(10),
          text: z.string().max(60_000).optional(),
          files: z.array(fileSchema).max(8).default([]),
          note: z.string().max(2000).optional(),
        })
        .refine((b) => b.mode === 'topic' || b.files.length > 0 || (b.text?.trim().length ?? 0) >= 30, {
          message: "Namuna rejimi uchun eski test matnini qo'ying yoki rasm/PDF yuklang",
        }),
      req.body,
    );
    const section = body.section as Section;
    for (const id of body.skillIds) {
      const sk = skillById(id);
      if (!sk || sk.section !== section) throw new HttpError(400, `Ko'nikma bu bo'limga tegishli emas: ${id}`);
    }
    const files: SampleFile[] = body.files.map((f) => ({ name: f.name, mime: f.mime, data: stripDataUrl(f.data) }));
    const bytes = files.reduce((n, f) => n + Buffer.byteLength(f.data, 'base64'), 0);
    if (bytes > 20 * 1024 * 1024) throw new HttpError(413, 'Fayllar jami 20 MB dan oshmasin');
    const job = await createJob({
      section,
      reason: 'admin',
      createdById: me(req).id,
      files,
      input: {
        mode: body.mode,
        skillIds: body.skillIds,
        domainId: body.domainId ?? null,
        difficulty: body.difficulty as Difficulty | 'MIXED',
        count: body.count,
        text: body.text?.trim() || undefined,
        files: files.map((f) => ({ name: f.name, mime: f.mime })),
        note: body.note?.trim() || undefined,
      },
    });
    res.status(202).json({ jobId: job.id });
  }),
);

aiRouter.get(
  '/jobs',
  requireRole('OPERATOR'),
  ah(async (_req, res) => {
    const jobs = await prisma.aiJob.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
    res.json({ jobs: jobs.map(jobView) });
  }),
);

/** Xarajat: bugun va 30 kun (chat va savol yaratish alohida), taxminiy USD. */
aiRouter.get(
  '/usage',
  requireRole('OPERATOR'),
  ah(async (_req, res) => {
    const today = tashkentDayStart();
    const month = new Date(Date.now() - 30 * 86400_000);
    const sum = async (since: Date) => {
      const [chat, jobs, msgs] = await Promise.all([
        prisma.aiMessage.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true } }),
        prisma.aiJob.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true, created: true } }),
        prisma.aiMessage.count({ where: { createdAt: { gte: since }, role: 'USER' } }),
      ]);
      const r = (x: number | null | undefined) => Math.round((x ?? 0) * 100) / 100;
      return {
        chatUsd: r(chat._sum.costUsd),
        generateUsd: r(jobs._sum.costUsd),
        totalUsd: r((chat._sum.costUsd ?? 0) + (jobs._sum.costUsd ?? 0)),
        messages: msgs,
        questions: jobs._sum.created ?? 0,
      };
    };
    const [t, m, aiQuestions] = await Promise.all([
      sum(today),
      sum(month),
      prisma.questionTemplate.groupBy({ by: ['status'], where: { tags: { has: 'ai' } }, _count: true }),
    ]);
    res.json({ configured: aiConfigured(), today: t, month: m, bank: Object.fromEntries(aiQuestions.map((g) => [g.status, g._count])) });
  }),
);
