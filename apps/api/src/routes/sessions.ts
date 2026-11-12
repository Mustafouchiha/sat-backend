import type { Section } from '@prisma/client';
import { assembleAdaptiveSet, freshFirst, pickForMe } from '@sat/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { me, requireActive, requireAuth } from '../lib/auth';
import { filterCatalog, getCatalog, type CatalogItem } from '../lib/catalog';
import { reportExhausted, reportShortages, seenTemplates } from '../lib/fresh';
import { ah, HttpError, notFound, parse } from '../lib/http';
import { answerSession, appendRushItem, createSession, finishSession, getSessionState, sessionReview, type RushMeta } from '../lib/sessions';
import { getSettings } from '../lib/settings';
import { ensureRatings } from '../lib/users';

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);

const rnd = { float: () => Math.random() };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function masteryMap(userId: string): Promise<Record<string, number>> {
  const rows = await prisma.skillMastery.findMany({ where: { userId }, select: { skillId: true, mastery: true } });
  return Object.fromEntries(rows.map((r) => [r.skillId, r.mastery]));
}

export async function dueReviewIds(userId: string): Promise<string[]> {
  const rows = await prisma.reviewItem.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: 'asc' },
    take: 50,
    select: { templateId: true },
  });
  return rows.map((r) => r.templateId);
}

/**
 * Erkin mashq: domen/ko'nikma/qiyinlik tanlanadi.
 * FOR_ME — reyting ±150 atrofida; ADAPTIVE — zaif ko'nikmalar + takrorlash navbati (60/25/15).
 */
sessionsRouter.post(
  '/practice',
  requireActive,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        section: z.enum(['RW', 'MATH']).nullish(),
        domainId: z.string().nullish(),
        skillId: z.string().nullish(),
        difficulty: z.enum(['ANY', 'EASY', 'MEDIUM', 'HARD', 'FOR_ME', 'ADAPTIVE']).default('ANY'),
        count: z.number().int().min(1).max(40).default(10),
        templateIds: z.array(z.string()).max(40).optional(),
      }),
      req.body,
    );
    const u = me(req);
    const s = await getSettings();
    const catalog = await getCatalog();
    let refs: CatalogItem[] = [];
    let title = 'Mashq';

    if (body.templateIds?.length) {
      // Xatolar daftaridan qayta ishlash — bu yerda takror ataylab (yangi sonlar bilan)
      refs = body.templateIds.map((id) => catalog.find((c) => c.id === id)).filter((c): c is CatalogItem => !!c);
      title = 'Xatolar ustida ishlash (yangi sonlar)';
    } else {
      const base = filterCatalog(catalog, { section: body.section, domainId: body.domainId, skillId: body.skillId });
      if (!base.length) throw new HttpError(409, "Bu filtr bo'yicha savollar yo'q", 'NO_QUESTIONS');
      const byId = new Map(base.map((c) => [c.id, c]));
      // Bitta savol qaytib tushmasin: avval o'quvchi ko'rmaganlari, tugasa — eng uzoq vaqt oldin ko'rilganlari
      const seen = await seenTemplates(u.id);
      if (body.difficulty === 'FOR_ME') {
        const ratings = await ensureRatings(u.id);
        const r = body.section ? ratings[body.section].rating : ratings.OVERALL.rating;
        refs = pickForMe(base, r, body.count, rnd, s.forMe, seen).map((id) => byId.get(id)!);
        title = 'Mashq · Men uchun';
      } else if (body.difficulty === 'ADAPTIVE') {
        // Takrorlash navbati bu yerga aralashtirilmaydi — xatolar faqat «Xatolar daftari»da qaytadi
        const exhausted = new Set<string>();
        const ids = assembleAdaptiveSet({
          count: body.count,
          templates: base,
          mastery: await masteryMap(u.id),
          dueReviewTemplateIds: [],
          ratios: s.autoTest,
          masteryCfg: s.mastery,
          rng: rnd,
          avoid: new Set(seen.keys()),
          onExhausted: (sk) => exhausted.add(sk),
        });
        reportExhausted(exhausted);
        refs = ids.map((id) => byId.get(id)!).filter(Boolean);
        title = 'Shaxsiy mashq';
      } else if (body.difficulty !== 'ANY') {
        refs = freshFirst(filterCatalog(base, { difficulty: body.difficulty }, s), seen, rnd).slice(0, body.count);
        if (!refs.length) throw new HttpError(409, "Bu qiyinlikda savollar yo'q", 'NO_QUESTIONS');
      } else {
        refs = freshFirst(base, seen, rnd).slice(0, body.count);
      }
      // Math shablonlari yangi sonlar bilan takrorlanishi mumkin
      const math = refs.filter((r) => r.section === 'MATH');
      while (refs.length < body.count && math.length) refs.push(math[Math.floor(Math.random() * math.length)]);
      reportShortages(refs, seen);
    }
    const attempt = await createSession(u.id, 'PRACTICE', refs, {
      title,
      meta: { section: body.section ?? null, domainId: body.domainId ?? null, skillId: body.skillId ?? null, difficulty: body.difficulty },
    });
    res.status(201).json({ attemptId: attempt.id });
  }),
);

/** "Xatolar ustida ishlash": vaqti kelgan takrorlashlar, keyin yaqin orada xato qilinganlar. */
sessionsRouter.post(
  '/review',
  requireActive,
  ah(async (req, res) => {
    const u = me(req);
    const catalog = await getCatalog();
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const ids: string[] = [];
    const add = (id: string) => {
      if (ids.length < 10 && !ids.includes(id) && byId.has(id)) ids.push(id);
    };
    (await prisma.reviewItem.findMany({ where: { userId: u.id }, orderBy: { dueAt: 'asc' }, take: 30 })).forEach((r) => add(r.templateId));
    if (ids.length < 10) {
      const wrong = await prisma.attemptAnswer.findMany({
        where: { attempt: { userId: u.id }, isCorrect: false, answeredAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
        orderBy: { answeredAt: 'desc' },
        take: 60,
        select: { templateId: true },
      });
      wrong.forEach((w) => add(w.templateId));
    }
    if (!ids.length) throw new HttpError(409, "Takrorlash uchun xatolar yo'q 🎉", 'NO_MISTAKES');
    const attempt = await createSession(u.id, 'REVIEW', ids.map((id) => byId.get(id)!), { title: 'Xatolar ustida ishlash' });
    res.status(201).json({ attemptId: attempt.id });
  }),
);

/** Puzzle Rush: 3 yoki 5 daqiqa, 3 ta xatoda tugaydi, savollar asta-sekin qiyinlashadi. */
sessionsRouter.post(
  '/rush',
  requireActive,
  ah(async (req, res) => {
    const body = parse(
      z.object({ durationSec: z.union([z.literal(180), z.literal(300)]).default(180), section: z.enum(['RW', 'MATH']).nullish() }),
      req.body,
    );
    const u = me(req);
    const s = await getSettings();
    const meta: RushMeta = { lives: s.rush.lives, durationSec: body.durationSec, section: (body.section ?? null) as Section | null };
    const attempt = await prisma.attempt.create({
      data: {
        userId: u.id,
        mode: 'RUSH',
        title: `⚡ Puzzle Rush ${body.durationSec / 60} daq`,
        deadlineAt: new Date(Date.now() + body.durationSec * 1000 + 3000),
        meta: meta as unknown as object,
      },
    });
    try {
      await appendRushItem(attempt.id, u.id);
    } catch (e) {
      await prisma.attempt.delete({ where: { id: attempt.id } });
      throw e;
    }
    res.status(201).json({ attemptId: attempt.id });
  }),
);

sessionsRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await getSessionState(req.params.id, me(req)));
  }),
);

sessionsRouter.post(
  '/:id/answer',
  ah(async (req, res) => {
    const body = parse(
      z.object({ order: z.number().int().min(0), answer: z.string().max(20), timeSpentMs: z.number().min(0).default(0) }),
      req.body,
    );
    res.json(await answerSession(req.params.id, me(req), body.order, body.answer, body.timeSpentMs));
  }),
);

sessionsRouter.post(
  '/:id/finish',
  ah(async (req, res) => {
    const attempt = await prisma.attempt.findUnique({ where: { id: req.params.id } });
    if (!attempt || attempt.userId !== me(req).id) throw notFound('Sessiya');
    await finishSession(attempt.id);
    res.json(await getSessionState(attempt.id, me(req)));
  }),
);

sessionsRouter.get(
  '/:id/review',
  ah(async (req, res) => {
    res.json(await sessionReview(req.params.id, me(req)));
  }),
);
