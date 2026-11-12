import { Prisma } from '@prisma/client';
import { hashString } from '@sat/generator';
import { assembleAdaptiveSet, tashkentDate } from '@sat/shared';
import { Router } from 'express';
import { prisma } from '../db';
import { me, requireActive, requireAuth } from '../lib/auth';
import { getCatalog } from '../lib/catalog';
import { ah, HttpError } from '../lib/http';
import { reportExhausted, reportShortages, seenTemplates } from '../lib/fresh';
import { createSession } from '../lib/sessions';
import { getSettings } from '../lib/settings';
import { displayName, userStats } from '../lib/users';
import { masteryMap } from './sessions';

export const dailyRouter = Router();
dailyRouter.use(requireAuth);

/** Kunning umumiy savolini tanlash (barchaga bir xil shablon, har kimga o'z sonlari). */
export async function ensureDailyTest(date: string) {
  const existing = await prisma.dailyTest.findUnique({ where: { date } });
  if (existing) return existing;
  const catalog = await getCatalog();
  if (!catalog.length) return null;
  const recent = await prisma.dailyTest.findMany({ orderBy: { date: 'desc' }, take: 14 });
  const recentIds = new Set(recent.map((r) => r.commonTemplateId));
  const dayNum = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400_000);
  const section = dayNum % 2 === 0 ? 'MATH' : 'RW';
  let pool = catalog.filter((c) => c.section === section && c.difficulty === 'MEDIUM' && !recentIds.has(c.id));
  if (!pool.length) pool = catalog.filter((c) => !recentIds.has(c.id));
  if (!pool.length) pool = catalog;
  const pick = pool[hashString(date) % pool.length];
  return prisma.dailyTest.upsert({ where: { date }, create: { date, commonTemplateId: pick.id }, update: {} });
}

export async function dailyLeaderboard(date: string, limit = 20) {
  const rows = await prisma.attempt.findMany({
    where: { mode: 'DAILY', dailyDate: date, status: 'FINISHED' },
    include: { user: { select: { id: true, firstName: true, lastName: true, username: true, photoUrl: true } } },
    take: 500,
  });
  return rows
    .map((a) => ({
      userId: a.userId,
      name: displayName(a.user),
      photoUrl: a.user.photoUrl,
      correct: a.correctCount,
      total: a.totalItems,
      timeMs: (a.finishedAt?.getTime() ?? Date.now()) - a.startedAt.getTime(),
    }))
    .sort((x, y) => y.correct - x.correct || x.timeMs - y.timeMs)
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

dailyRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const date = tashkentDate();
    const s = await getSettings();
    const [daily, mine, stats, leaderboard] = await Promise.all([
      ensureDailyTest(date),
      prisma.attempt.findUnique({ where: { userId_mode_dailyDate: { userId: u.id, mode: 'DAILY', dailyDate: date } } }),
      userStats(u.id),
      dailyLeaderboard(date, 10),
    ]);
    res.json({
      date,
      available: !!daily,
      count: s.daily.count,
      durationMin: s.daily.durationMin,
      my: mine
        ? {
            attemptId: mine.id,
            status: mine.status,
            correct: mine.correctCount,
            total: mine.totalItems,
            startedAt: mine.startedAt,
            finishedAt: mine.finishedAt,
            deadlineAt: mine.deadlineAt,
          }
        : null,
      streak: stats.streak,
      leaderboard,
    });
  }),
);

/** Kunlik test: 1 ta umumiy savol + shaxsiy qism (zaif ko'nikmalar va takrorlash navbati). */
dailyRouter.post(
  '/start',
  requireActive,
  ah(async (req, res) => {
    const u = me(req);
    const date = tashkentDate();
    const existing = await prisma.attempt.findUnique({ where: { userId_mode_dailyDate: { userId: u.id, mode: 'DAILY', dailyDate: date } } });
    if (existing) return res.json({ attemptId: existing.id });
    const daily = await ensureDailyTest(date);
    if (!daily) throw new HttpError(409, "Savollar bankida savol yo'q", 'NO_QUESTIONS');
    const s = await getSettings();
    const catalog = await getCatalog();
    const byId = new Map(catalog.map((c) => [c.id, c]));
    let common = byId.get(daily.commonTemplateId);
    if (!common) {
      const t = await prisma.questionTemplate.findUnique({ where: { id: daily.commonTemplateId } });
      if (t) common = { id: t.id, version: t.version, section: t.section, domainId: t.domainId, skillId: t.skillId, difficulty: t.difficulty, rating: t.rating, ratingGames: t.ratingGames };
    }
    // Shaxsiy qism: zaif ko'nikmalardan, o'quvchi hali ko'rmagan savollar (xatolar faqat «Xatolar daftari»da qaytadi)
    const seen = await seenTemplates(u.id);
    const exhausted = new Set<string>();
    const personal = assembleAdaptiveSet({
      count: Math.max(0, s.daily.count - (common ? 1 : 0)),
      templates: catalog,
      mastery: await masteryMap(u.id),
      dueReviewTemplateIds: [],
      ratios: s.autoTest,
      masteryCfg: s.mastery,
      rng: { float: Math.random },
      exclude: common ? [common.id] : [],
      avoid: new Set(seen.keys()),
      onExhausted: (sk) => exhausted.add(sk),
    });
    const personalRefs = personal.map((id) => byId.get(id)!).filter(Boolean);
    reportShortages(personalRefs, seen);
    reportExhausted(exhausted);
    const refs = [...(common ? [common] : []), ...personalRefs];
    try {
      const attempt = await createSession(u.id, 'DAILY', refs, {
        title: `📅 Kunlik test · ${date}`,
        deadlineAt: new Date(Date.now() + s.daily.durationMin * 60_000),
        dailyDate: date,
        meta: { commonTemplateId: common?.id ?? null },
      });
      res.status(201).json({ attemptId: attempt.id });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await prisma.attempt.findUnique({ where: { userId_mode_dailyDate: { userId: u.id, mode: 'DAILY', dailyDate: date } } });
        if (again) return res.json({ attemptId: again.id });
      }
      throw e;
    }
  }),
);
