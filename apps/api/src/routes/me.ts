import { Prisma } from '@prisma/client';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { bucketOf, displayChange, displayRating, tashkentDate, tashkentDayStart, TAXONOMY } from '@sat/shared';
import { prisma } from '../db';
import { env } from '../env';
import { me, requireAuth } from '../lib/auth';
import { ah, HttpError, notFound, parse, randomCode } from '../lib/http';
import { getBotTitle, getBotUsername } from '../lib/notify';
import { getSettings } from '../lib/settings';
import { publicUser, userStats } from '../lib/users';
import { getVariant, reviewQuestion } from '../lib/variants';
import { maskPhone } from '../lib/webLogin';

export const meRouter = Router();
meRouter.use(requireAuth);

/** Foydalanuvchining o'ziga: telefon raqam yashirilgan holda (kompyuterda kirish uchun ulanganini ko'rsatish) va ko'rinish sozlamalari. */
const selfUser = (user: Parameters<typeof publicUser>[0]) => ({ ...publicUser(user), phone: maskPhone(user.phone), theme: user.theme ?? null });

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Rang #rrggbb ko\'rinishida bo\'lishi kerak');
const themeSchema = z
  .object({
    mode: z.enum(['auto', 'light', 'dark']),
    bg: hexColor.optional(),
    card: hexColor.optional(),
    text: hexColor.optional(),
    line: hexColor.optional(),
    accent: hexColor.optional(),
  })
  .strict();

// Noto'g'ri kodlarni ketma-ket tanlab ko'rishning oldini olish (to'g'ri urinishlar hisoblanmaydi)
const joinLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: "Juda ko'p noto'g'ri urinish — 10 daqiqadan keyin qayta urinib ko'ring", code: 'RATE_LIMIT' },
});

meRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const [user, stats, groups] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
      userStats(u.id),
      prisma.groupMember.findMany({ where: { userId: u.id }, include: { group: { select: { id: true, name: true } } } }),
    ]);
    res.json({
      user: selfUser(user),
      stats,
      groups: groups.map((g) => ({ id: g.group.id, name: g.group.name, role: g.role })),
      config: { botUsername: getBotUsername(), botTitle: getBotTitle(), desmosKey: env.DESMOS_API_KEY ?? null },
    });
  }),
);

meRouter.patch(
  '/',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        lang: z.enum(['uz', 'ru', 'en']).optional(),
        targetScore: z.number().int().min(400).max(1600).nullable().optional(),
        examDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
        notifyDaily: z.boolean().optional(),
        theme: themeSchema.nullable().optional(),
      }),
      req.body,
    );
    const user = await prisma.user.update({
      where: { id: me(req).id },
      data: {
        ...(body.lang ? { lang: body.lang } : {}),
        ...(body.targetScore !== undefined ? { targetScore: body.targetScore } : {}),
        ...(body.examDate !== undefined ? { examDate: body.examDate ? new Date(body.examDate) : null } : {}),
        ...(body.notifyDaily !== undefined ? { notifyDaily: body.notifyDaily } : {}),
        ...(body.theme !== undefined ? { theme: body.theme === null ? Prisma.DbNull : body.theme } : {}),
      },
    });
    res.json({ user: selfUser(user) });
  }),
);

/**
 * Guruhga qo'shilish: guruhning umumiy kodi (o'qituvchi o'chirib qo'yishi mumkin)
 * yoki o'quvchining shaxsiy, bir martalik kodi. O'quvchi ACTIVE bo'ladi.
 */
meRouter.post(
  '/join',
  joinLimiter,
  ah(async (req, res) => {
    const { code: raw } = parse(z.object({ code: z.string().min(4).max(24) }), req.body);
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const u = me(req);
    let group = await prisma.group.findUnique({ where: { inviteCode: code } });
    if (group && !group.openJoin) {
      throw new HttpError(403, "Bu guruhga faqat shaxsiy kod bilan qo'shiladi — o'qituvchingizdan o'zingizning kodingizni so'rang", 'PERSONAL_ONLY');
    }
    if (!group) {
      const invite = await prisma.groupInvite.findUnique({ where: { code }, include: { group: true } });
      if (!invite) throw new HttpError(404, 'Bunday taklif kodi topilmadi', 'BAD_CODE');
      const already = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: invite.groupId, userId: u.id } } });
      // Allaqachon a'zo bo'lsa, kod sarflanmaydi
      if (!already && invite.usedById !== u.id) {
        const usedMsg = "Bu shaxsiy kod allaqachon ishlatilgan. O'qituvchingizdan yangi kod so'rang";
        if (invite.usedById) throw new HttpError(409, usedMsg, 'CODE_USED');
        const claimed = await prisma.groupInvite.updateMany({ where: { id: invite.id, usedById: null }, data: { usedById: u.id, usedAt: new Date() } });
        if (!claimed.count) throw new HttpError(409, usedMsg, 'CODE_USED');
      }
      group = invite.group;
    }
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: u.id } },
      create: { groupId: group.id, userId: u.id, role: 'STUDENT' },
      update: {},
    });
    const user = await prisma.user.update({
      where: { id: u.id },
      data: { status: u.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE' },
    });
    res.json({ user: selfUser(user), group: { id: group.id, name: group.name } });
  }),
);

/** Bosh sahifa: reyting, streak, bugungi vazifalar, takrorlash navbati. */
meRouter.get(
  '/dashboard',
  ah(async (req, res) => {
    const u = me(req);
    const today = tashkentDate();
    const now = new Date();
    const memberships = await prisma.groupMember.findMany({ where: { userId: u.id, role: 'STUDENT' }, select: { groupId: true } });
    const groupIds = memberships.map((m) => m.groupId);
    const [user, stats, daily, reviewDue, assignments, lastTest, weekly] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
      userStats(u.id),
      prisma.attempt.findUnique({ where: { userId_mode_dailyDate: { userId: u.id, mode: 'DAILY', dailyDate: today } } }),
      prisma.reviewItem.count({ where: { userId: u.id, dueAt: { lte: now } } }),
      groupIds.length
        ? prisma.assignment.findMany({
            where: { groupId: { in: groupIds }, OR: [{ dueAt: null }, { dueAt: { gte: new Date(now.getTime() - 3 * 86400_000) } }] },
            include: {
              test: { select: { title: true, type: true } },
              attempts: { where: { userId: u.id }, select: { id: true, status: true, totalScaled: true, correctCount: true, totalItems: true } },
            },
            orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
            take: 10,
          })
        : Promise.resolve([]),
      prisma.attempt.findFirst({
        where: { userId: u.id, mode: 'TEST', status: 'FINISHED' },
        orderBy: { finishedAt: 'desc' },
        select: { id: true, title: true, totalScaled: true, rwScaled: true, mathScaled: true, correctCount: true, totalItems: true, finishedAt: true },
      }),
      prisma.ratingHistory.aggregate({
        where: { userId: u.id, type: 'OVERALL', createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) } },
        _sum: { delta: true },
      }),
    ]);
    const daysToExam = user.examDate
      ? Math.max(0, Math.ceil((user.examDate.getTime() - tashkentDayStart(today).getTime()) / 86400_000))
      : null;
    res.json({
      user: selfUser(user),
      stats,
      daily: {
        date: today,
        done: daily?.status === 'FINISHED',
        attemptId: daily?.id ?? null,
        correct: daily?.correctCount ?? 0,
        total: daily?.totalItems ?? 0,
      },
      reviewDue,
      assignments: assignments.map((a) => {
        const finished = a.attempts.filter((x) => x.status === 'FINISHED');
        return {
          id: a.id,
          title: a.title,
          testTitle: a.test.title,
          testType: a.test.type,
          dueAt: a.dueAt,
          maxAttempts: a.maxAttempts,
          attemptsUsed: a.attempts.length,
          done: finished.length > 0,
          inProgressId: a.attempts.find((x) => x.status !== 'FINISHED')?.id ?? null,
          overdue: !!a.dueAt && a.dueAt < now,
        };
      }),
      lastTest,
      weeklyDelta: displayChange('OVERALL', weekly._sum.delta ?? 0),
      daysToExam,
    });
  }),
);

/** Reyting tarixi: kunlik oxirgi qiymatlar (grafik uchun), peak, kunlik/haftalik o'zgarish. */
meRouter.get(
  '/rating-history',
  ah(async (req, res) => {
    const q = parse(
      z.object({ type: z.enum(['OVERALL', 'MATH', 'RW']).default('OVERALL'), days: z.coerce.number().int().min(1).max(365).default(90), userId: z.string().optional() }),
      req.query,
    );
    const userId = me(req).id;
    res.json(await ratingHistory(userId, q.type, q.days));
  }),
);

export async function ratingHistory(userId: string, type: 'OVERALL' | 'MATH' | 'RW', days: number) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.ratingHistory.findMany({
    where: { userId, type, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { rating: true, delta: true, createdAt: true },
  });
  const byDay = new Map<string, number>();
  const s = await getSettings();
  for (const r of rows) byDay.set(tashkentDate(r.createdAt), displayRating(type, r.rating, s.ratingToSat));
  const dayAgo = Date.now() - 86400_000;
  const weekAgo = Date.now() - 7 * 86400_000;
  const current = await prisma.rating.findUnique({ where: { userId_type: { userId, type } } });
  return {
    type,
    points: [...byDay].map(([date, rating]) => ({ date, rating })),
    current: current ? displayRating(type, current.rating, s.ratingToSat) : null,
    peak: current ? displayRating(type, current.peak, s.ratingToSat) : null,
    dayChange: displayChange(type, rows.filter((r) => r.createdAt.getTime() >= dayAgo).reduce((s, r) => s + r.delta, 0)),
    weekChange: displayChange(type, rows.filter((r) => r.createdAt.getTime() >= weekAgo).reduce((s, r) => s + r.delta, 0)),
  };
}

meRouter.get(
  '/achievements',
  ah(async (req, res) => {
    const [all, mine] = await Promise.all([
      prisma.achievement.findMany({ orderBy: { order: 'asc' } }),
      prisma.userAchievement.findMany({ where: { userId: me(req).id } }),
    ]);
    const earned = new Map(mine.map((m) => [m.code, m.earnedAt]));
    res.json(all.map((a) => ({ ...a, earnedAt: earned.get(a.code) ?? null })));
  }),
);

/** Ko'nikmalar bo'yicha o'zlashtirish (kuchli/zaif tomonlar). */
meRouter.get(
  '/skills',
  ah(async (req, res) => {
    res.json(await skillOverview(me(req).id));
  }),
);

export async function skillOverview(userId: string) {
  const s = await getSettings();
  const rows = await prisma.skillMastery.findMany({ where: { userId } });
  const map = new Map(rows.map((r) => [r.skillId, r]));
  return TAXONOMY.map((d) => ({
    id: d.id,
    name: d.name,
    section: d.section,
    skills: d.skills.map((sk) => {
      const m = map.get(sk.id);
      const mastery = m?.mastery ?? s.mastery.initial;
      return {
        id: sk.id,
        name: sk.name,
        mastery: Math.round(mastery),
        answered: m ? m.correct + m.wrong : 0,
        accuracy: m && m.correct + m.wrong > 0 ? Math.round((m.correct / (m.correct + m.wrong)) * 100) : null,
        bucket: m ? bucketOf(mastery, s.mastery) : 'unknown',
      };
    }),
  }));
}

/** Xatolar daftari: noto'g'ri ishlangan savollar (shablon bo'yicha guruhlangan). */
meRouter.get(
  '/mistakes',
  ah(async (req, res) => {
    const u = me(req);
    const wrong = await prisma.attemptAnswer.findMany({
      where: { attempt: { userId: u.id }, isCorrect: false, answer: { not: null } },
      orderBy: { answeredAt: 'desc' },
      take: 400,
      include: {
        template: {
          select: { id: true, title: true, section: true, status: true, skill: { select: { name: true } }, domain: { select: { name: true } } },
        },
      },
    });
    const review = await prisma.reviewItem.findMany({ where: { userId: u.id } });
    const reviewMap = new Map(review.map((r) => [r.templateId, r]));
    const grouped = new Map<string, Record<string, unknown> & { count: number }>();
    for (const w of wrong) {
      const g = grouped.get(w.templateId);
      if (g) {
        g.count++;
        continue;
      }
      const r = reviewMap.get(w.templateId);
      grouped.set(w.templateId, {
        templateId: w.templateId,
        title: w.template.title,
        section: w.template.section,
        skill: w.template.skill.name,
        domain: w.template.domain.name,
        available: w.template.status === 'PUBLISHED',
        lastAnswerId: w.id,
        lastWrongAt: w.answeredAt,
        count: 1,
        review: r ? { stage: r.stage, streak: r.streak, dueAt: r.dueAt, due: r.dueAt <= new Date() } : null,
      });
    }
    res.json({ items: [...grouped.values()], reviewDue: review.filter((r) => r.dueAt <= new Date()).length });
  }),
);

/** Xato qilingan aniq variantni (o'sha sonlar bilan) ko'rish. */
meRouter.get(
  '/answers/:id',
  ah(async (req, res) => {
    const row = await prisma.attemptAnswer.findUnique({ where: { id: req.params.id }, include: { attempt: { select: { userId: true, status: true } } } });
    if (!row || row.attempt.userId !== me(req).id) throw notFound('Javob');
    if (row.attempt.status !== 'FINISHED' && row.isCorrect === null) throw new HttpError(409, 'Urinish hali tugamagan');
    const v = await getVariant(row);
    res.json({ question: reviewQuestion(v, row.templateId), answer: row.answer, isCorrect: row.isCorrect, templateId: row.templateId, seed: row.seed, templateVersion: row.templateVersion });
  }),
);

meRouter.get(
  '/attempts',
  ah(async (req, res) => {
    const attempts = await prisma.attempt.findMany({
      where: { userId: me(req).id, status: 'FINISHED' },
      orderBy: { finishedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        mode: true,
        title: true,
        correctCount: true,
        totalItems: true,
        totalScaled: true,
        rwScaled: true,
        mathScaled: true,
        ratingDelta: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    res.json(attempts);
  }),
);

/** O'quvchiga berilgan uy vazifalari va testlar. */
meRouter.get(
  '/assignments',
  ah(async (req, res) => {
    const u = me(req);
    const groupIds = (await prisma.groupMember.findMany({ where: { userId: u.id, role: 'STUDENT' }, select: { groupId: true } })).map((g) => g.groupId);
    const list = await prisma.assignment.findMany({
      where: { groupId: { in: groupIds } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        test: { select: { id: true, title: true, type: true, modules: { select: { durationSec: true, order: true } } } },
        group: { select: { name: true } },
        attempts: {
          where: { userId: u.id },
          select: { id: true, status: true, totalScaled: true, correctCount: true, totalItems: true, finishedAt: true },
        },
      },
    });
    const now = new Date();
    res.json(
      list.map((a) => {
        const hidden = a.resultVisibility === 'AFTER_DUE' && !!a.dueAt && a.dueAt > now;
        return {
          id: a.id,
          title: a.title,
          group: a.group.name,
          test: { id: a.test.id, title: a.test.title, type: a.test.type },
          dueAt: a.dueAt,
          maxAttempts: a.maxAttempts,
          resultVisibility: a.resultVisibility,
          resultsHidden: hidden,
          overdue: !!a.dueAt && a.dueAt < now,
          attempts: a.attempts.map((x) => ({
            ...x,
            totalScaled: hidden ? null : x.totalScaled,
            correctCount: hidden ? null : x.correctCount,
          })),
        };
      }),
    );
  }),
);

meRouter.get(
  '/comments',
  ah(async (req, res) => {
    const list = await prisma.teacherComment.findMany({
      where: { studentId: me(req).id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { teacher: { select: { firstName: true, lastName: true } } },
    });
    res.json(list.map((c) => ({ id: c.id, text: c.text, createdAt: c.createdAt, teacher: [c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ') })));
  }),
);

/** Ota-onani ulash: kod yaratiladi, ota-ona botda /start parent_KOD yuboradi. */
meRouter.post(
  '/parent-code',
  ah(async (req, res) => {
    const code = randomCode(8);
    await prisma.parentLink.create({ data: { code, studentId: me(req).id } });
    res.json({
      code,
      link: env.BOT_USERNAME ? `https://t.me/${env.BOT_USERNAME}?start=parent_${code}` : null,
    });
  }),
);
