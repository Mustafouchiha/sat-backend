import type { RatingType } from '@prisma/client';
import {
  ACHIEVEMENTS,
  earnedAchievements,
  eloUpdate,
  srsNext,
  updateMastery,
  type AchievementStats,
} from '@sat/shared';
import { prisma } from '../db';
import { getSettings } from './settings';
import { ensureRatings } from './users';

export interface EffectItem {
  templateId: string;
  correct: boolean;
  timeMs: number;
}

export interface EarnedAchievement {
  code: string;
  name: string;
  description: string;
  icon: string;
}

export interface EffectsResult {
  perItem: number[];
  overallDelta: number;
  overallRating: number;
  xp: number;
  achievements: EarnedAchievement[];
}

/**
 * Javoblar natijasini qo'llash (bitta tranzaksiyada):
 *  - Elo: o'quvchi (umumiy + bo'lim) va savol reytingi
 *  - mastery (ko'nikma o'zlashtirish darajasi)
 *  - spaced repetition navbati
 *  - shablon statistikasi, XP, yutuqlar
 */
export async function applyEffects(
  userId: string,
  items: EffectItem[],
  opts: { reviewForce?: boolean } = {},
): Promise<EffectsResult> {
  const ratingRows = await ensureRatings(userId);
  if (!items.length) {
    return { perItem: [], overallDelta: 0, overallRating: Math.round(ratingRows.OVERALL.rating), xp: 0, achievements: [] };
  }
  const s = await getSettings();
  const ids = [...new Set(items.map((i) => i.templateId))];
  const templates = await prisma.questionTemplate.findMany({
    where: { id: { in: ids } },
    select: { id: true, section: true, skillId: true, rating: true, ratingGames: true },
  });
  const skillIds = [...new Set(templates.map((t) => t.skillId))];
  const [masteryRows, reviewRows] = await Promise.all([
    prisma.skillMastery.findMany({ where: { userId, skillId: { in: skillIds } } }),
    prisma.reviewItem.findMany({ where: { userId, templateId: { in: ids } } }),
  ]);

  const ratings: Record<RatingType, { rating: number; games: number; peak: number; touched: boolean }> = {
    OVERALL: { ...ratingRows.OVERALL, touched: false },
    MATH: { ...ratingRows.MATH, touched: false },
    RW: { ...ratingRows.RW, touched: false },
  };
  const tState = new Map(
    templates.map((t) => [t.id, { ...t, dRating: 0, dGames: 0, dCorrect: 0, dTime: 0 }]),
  );
  const mState = new Map(masteryRows.map((m) => [m.skillId, { mastery: m.mastery, correct: 0, wrong: 0 }]));
  type RS = { stage: number; streak: number; dueAt: Date; action?: 'upsert' | 'remove' };
  const rState = new Map<string, RS>(reviewRows.map((r) => [r.templateId, { stage: r.stage, streak: r.streak, dueAt: r.dueAt }]));

  const now = new Date();
  const history: Array<{ userId: string; type: RatingType; rating: number; delta: number; createdAt: Date }> = [];
  const perItem: number[] = [];
  let overallDelta = 0;
  let xp = 0;
  let answered = 0;
  let correctN = 0;

  for (const it of items) {
    const t = tState.get(it.templateId);
    if (!t) {
      perItem.push(0);
      continue;
    }
    const secType: RatingType = t.section === 'MATH' ? 'MATH' : 'RW';
    const qRating = t.rating + t.dRating;
    const qGames = t.ratingGames + t.dGames;
    const ov = ratings.OVERALL;
    const sec = ratings[secType];
    const timeMs = Math.max(0, it.timeMs);
    const r1 = eloUpdate(
      { userRating: ov.rating, userGames: ov.games, questionRating: qRating, questionGames: qGames, correct: it.correct, timeMs },
      s.rating,
    );
    const r2 = eloUpdate(
      { userRating: sec.rating, userGames: sec.games, questionRating: qRating, questionGames: qGames, correct: it.correct, timeMs },
      s.rating,
    );
    ov.rating = r1.userRating;
    ov.games++;
    ov.peak = Math.max(ov.peak, ov.rating);
    ov.touched = true;
    sec.rating = r2.userRating;
    sec.games++;
    sec.peak = Math.max(sec.peak, sec.rating);
    sec.touched = true;
    history.push(
      { userId, type: 'OVERALL', rating: ov.rating, delta: r1.userDelta, createdAt: now },
      { userId, type: secType, rating: sec.rating, delta: r2.userDelta, createdAt: now },
    );

    t.dRating += r1.questionDelta;
    t.dGames++;
    if (it.correct) t.dCorrect++;
    t.dTime += timeMs;

    const ms = mState.get(t.skillId) ?? { mastery: s.mastery.initial, correct: 0, wrong: 0 };
    ms.mastery = updateMastery(ms.mastery, it.correct, s.mastery);
    if (it.correct) ms.correct++;
    else ms.wrong++;
    mState.set(t.skillId, ms);

    const rs = rState.get(t.id);
    const current = rs && rs.action !== 'remove' ? { stage: rs.stage, streak: rs.streak, dueAt: rs.dueAt } : null;
    const next = srsNext(current, it.correct, now, s.srs, opts.reviewForce);
    if (next.action === 'upsert') rState.set(t.id, { stage: next.stage, streak: next.streak, dueAt: next.dueAt, action: 'upsert' });
    else if (next.action === 'remove' && rs) rState.set(t.id, { ...rs, action: 'remove' });

    xp += it.correct ? s.xp.correct : s.xp.wrong;
    answered++;
    if (it.correct) correctN++;
    overallDelta += r1.userDelta;
    perItem.push(r1.userDelta);
  }

  const ops = [];
  for (const type of Object.keys(ratings) as RatingType[]) {
    const r = ratings[type];
    if (!r.touched) continue;
    ops.push(
      prisma.rating.update({
        where: { userId_type: { userId, type } },
        data: { rating: r.rating, games: r.games, peak: r.peak },
      }),
    );
  }
  if (history.length) ops.push(prisma.ratingHistory.createMany({ data: history }));
  for (const t of tState.values()) {
    if (!t.dGames) continue;
    ops.push(
      prisma.questionTemplate.update({
        where: { id: t.id },
        data: {
          rating: { increment: t.dRating },
          ratingGames: { increment: t.dGames },
          timesAnswered: { increment: t.dGames },
          timesCorrect: { increment: t.dCorrect },
          totalTimeMs: { increment: t.dTime },
        },
      }),
    );
  }
  for (const [skillId, m] of mState) {
    if (!m.correct && !m.wrong) continue;
    ops.push(
      prisma.skillMastery.upsert({
        where: { userId_skillId: { userId, skillId } },
        create: { userId, skillId, mastery: m.mastery, correct: m.correct, wrong: m.wrong },
        update: { mastery: m.mastery, correct: { increment: m.correct }, wrong: { increment: m.wrong } },
      }),
    );
  }
  for (const [templateId, r] of rState) {
    if (r.action === 'upsert') {
      ops.push(
        prisma.reviewItem.upsert({
          where: { userId_templateId: { userId, templateId } },
          create: { userId, templateId, stage: r.stage, streak: r.streak, dueAt: r.dueAt },
          update: { stage: r.stage, streak: r.streak, dueAt: r.dueAt },
        }),
      );
    } else if (r.action === 'remove') {
      ops.push(prisma.reviewItem.deleteMany({ where: { userId, templateId } }));
    }
  }
  ops.push(
    prisma.user.update({
      where: { id: userId },
      data: { xp: { increment: xp }, answeredTotal: { increment: answered }, correctTotal: { increment: correctN } },
    }),
  );
  await prisma.$transaction(ops);

  const achievements = await checkAchievements(userId);
  return { perItem, overallDelta, overallRating: Math.round(ratings.OVERALL.rating), xp, achievements };
}

export async function addXp(userId: string, amount: number): Promise<void> {
  if (amount > 0) await prisma.user.update({ where: { id: userId }, data: { xp: { increment: amount } } });
}

/** Statistikani yig'ib, yangi yutuqlarni beradi. */
export async function checkAchievements(userId: string): Promise<EarnedAchievement[]> {
  const [user, streak, overall, rush, duelWins, perfectDaily, mock, masteries, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { answeredTotal: true, correctTotal: true } }),
    prisma.streak.findUnique({ where: { userId } }),
    prisma.rating.findUnique({ where: { userId_type: { userId, type: 'OVERALL' } } }),
    prisma.rushRun.aggregate({ where: { userId }, _max: { score: true } }),
    prisma.duel.count({ where: { winnerId: userId } }),
    prisma.attempt.findFirst({
      where: { userId, mode: 'DAILY', status: 'FINISHED', meta: { path: ['perfect'], equals: true } },
      select: { id: true },
    }),
    prisma.attempt.aggregate({
      where: { userId, mode: 'TEST', status: 'FINISHED', test: { type: 'MOCK' } },
      _max: { totalScaled: true },
    }),
    prisma.skillMastery.findMany({ where: { userId }, include: { skill: { select: { domainId: true } } } }),
    prisma.userAchievement.findMany({ where: { userId }, select: { code: true } }),
  ]);
  if (!user) return [];

  const domainAgg = new Map<string, { sum: number; n: number; answered: number }>();
  for (const m of masteries) {
    const d = domainAgg.get(m.skill.domainId) ?? { sum: 0, n: 0, answered: 0 };
    d.sum += m.mastery;
    d.n++;
    d.answered += m.correct + m.wrong;
    domainAgg.set(m.skill.domainId, d);
  }
  const stats: AchievementStats = {
    answered: user.answeredTotal,
    correct: user.correctTotal,
    streakBest: streak?.best ?? 0,
    peakRating: overall?.peak ?? 0,
    rushBest: rush._max.score ?? 0,
    duelWins,
    perfectDaily: !!perfectDaily,
    mockBest: mock._max.totalScaled ?? 0,
    domainMastery: Object.fromEntries(
      [...domainAgg].map(([k, v]) => [k, { avg: v.n ? v.sum / v.n : 0, answered: v.answered }]),
    ),
  };
  const have = new Set(existing.map((e) => e.code));
  const fresh = earnedAchievements(stats).filter((c) => !have.has(c));
  if (!fresh.length) return [];
  await prisma.userAchievement.createMany({ data: fresh.map((code) => ({ userId, code })), skipDuplicates: true });
  return fresh
    .map((code) => ACHIEVEMENTS.find((a) => a.code === code))
    .filter((a): a is (typeof ACHIEVEMENTS)[number] => !!a)
    .map(({ code, name, description, icon }) => ({ code, name, description, icon }));
}

/** Kod ichidagi yutuqlar ro'yxatini bazaga sinxronlash (server ishga tushganda). */
export async function syncAchievements(): Promise<void> {
  await prisma.$transaction(
    ACHIEVEMENTS.map((a, i) =>
      prisma.achievement.upsert({
        where: { code: a.code },
        create: { code: a.code, name: a.name, description: a.description, icon: a.icon, order: i },
        update: { name: a.name, description: a.description, icon: a.icon, order: i },
      }),
    ),
  );
}
