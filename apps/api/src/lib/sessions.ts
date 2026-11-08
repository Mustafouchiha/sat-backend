import type { AttemptMode, Prisma, Section } from '@prisma/client';
import { applyDailyCompletion, tashkentDate } from '@sat/shared';
import { prisma } from '../db';
import type { AuthUser } from './auth';
import { filterCatalog, getCatalog, type CatalogItem } from './catalog';
import { addXp, applyEffects, checkAchievements, type EarnedAchievement } from './effects';
import { HttpError, notFound } from './http';
import { getSettings } from './settings';
import { ensureRatings } from './users';
import { getVariant, grade, pickWorkingSeed, publicQuestion, reviewQuestion } from './variants';

/** Mashq, kunlik test, takrorlash, Puzzle Rush va duel — savollar birma-bir, darhol natija bilan. */
export const SESSION_MODES: AttemptMode[] = ['PRACTICE', 'REVIEW', 'DAILY', 'RUSH', 'DUEL'];

export interface RushMeta {
  lives: number;
  durationSec: number;
  section: Section | null;
}

export interface CreateSessionOpts {
  title: string;
  deadlineAt?: Date | null;
  dailyDate?: string | null;
  duelId?: string | null;
  meta?: Prisma.InputJsonValue;
}

export async function buildRows(refs: Array<Pick<CatalogItem, 'id' | 'version'>>) {
  const rows: Array<{ order: number; templateId: string; templateVersion: number; seed: number }> = [];
  for (const ref of refs) {
    const seed = await pickWorkingSeed(ref.id, ref.version);
    if (seed === null) continue;
    rows.push({ order: rows.length, templateId: ref.id, templateVersion: ref.version, seed });
  }
  return rows;
}

export async function createSession(
  userId: string,
  mode: AttemptMode,
  refs: Array<Pick<CatalogItem, 'id' | 'version'>>,
  opts: CreateSessionOpts,
) {
  const rows = await buildRows(refs);
  if (!rows.length) throw new HttpError(409, "Mos savollar topilmadi — boshqa filtrni tanlang yoki savollar bankini to'ldiring", 'NO_QUESTIONS');
  return prisma.attempt.create({
    data: {
      userId,
      mode,
      title: opts.title,
      deadlineAt: opts.deadlineAt ?? null,
      dailyDate: opts.dailyDate ?? null,
      duelId: opts.duelId ?? null,
      meta: opts.meta,
      totalItems: rows.length,
      answers: { createMany: { data: rows } },
    },
  });
}

async function loadSession(attemptId: string, user: AuthUser) {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== user.id) throw notFound('Sessiya');
  if (!SESSION_MODES.includes(attempt.mode)) throw new HttpError(400, 'Bu sessiya emas');
  return attempt;
}

function livesLeft(attempt: { mode: AttemptMode; mistakes: number; meta: Prisma.JsonValue | null }): number | null {
  if (attempt.mode !== 'RUSH') return null;
  const meta = (attempt.meta ?? {}) as unknown as RushMeta;
  return Math.max(0, (meta.lives ?? 3) - attempt.mistakes);
}

export async function getSessionState(attemptId: string, user: AuthUser): Promise<Record<string, unknown>> {
  let attempt = await loadSession(attemptId, user);
  const now = new Date();
  if (attempt.status === 'IN_PROGRESS' && attempt.deadlineAt && now > attempt.deadlineAt) {
    await finishSession(attempt.id);
    attempt = await loadSession(attemptId, user);
  }
  const base = {
    id: attempt.id,
    mode: attempt.mode,
    status: attempt.status,
    title: attempt.title,
    deadlineAt: attempt.deadlineAt,
    serverNow: now.toISOString(),
    total: attempt.mode === 'RUSH' ? null : attempt.totalItems,
    answered: attempt.answeredCount,
    correct: attempt.correctCount,
    mistakes: attempt.mistakes,
    lives: livesLeft(attempt),
    ratingDelta: attempt.ratingDelta,
    duelId: attempt.duelId,
  };
  if (attempt.status === 'FINISHED') return { ...base, question: null };

  const row = await prisma.attemptAnswer.findFirst({
    where: { attemptId, answeredAt: null },
    orderBy: { order: 'asc' },
  });
  if (!row) {
    await finishSession(attempt.id);
    return { ...base, status: 'FINISHED', question: null };
  }
  const v = await getVariant(row);
  return { ...base, index: attempt.answeredCount, question: { order: row.order, ...publicQuestion(v, row.templateId) } };
}

export interface AnswerResult {
  correct: boolean;
  correctLabel?: string;
  correctDisplay: string;
  explanation?: string;
  ratingDelta: number;
  rating: number;
  finished: boolean;
  lives: number | null;
  achievements: EarnedAchievement[];
  expired?: boolean;
  /** Javobdan keyin — "savolda xato bor" shikoyati uchun aynan shu variant */
  ref: { templateId: string; templateVersion: number; seed: number };
}

export async function answerSession(
  attemptId: string,
  user: AuthUser,
  order: number,
  answer: string,
  timeMs: number,
): Promise<AnswerResult> {
  const attempt = await loadSession(attemptId, user);
  const row = await prisma.attemptAnswer.findUnique({ where: { attemptId_order: { attemptId, order } } });
  if (!row) throw notFound('Savol');
  const v = await getVariant(row);
  const ref = { templateId: row.templateId, templateVersion: row.templateVersion, seed: row.seed };

  // takroriy so'rov (tarmoq qayta yuborgan) — saqlangan natijani qaytaramiz
  if (row.answeredAt) {
    const ratings = await ensureRatings(user.id);
    const fresh = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    return {
      correct: !!row.isCorrect,
      correctLabel: v.correctLabel,
      correctDisplay: v.correctDisplay,
      explanation: v.explanation,
      ratingDelta: row.ratingDelta ?? 0,
      rating: Math.round(ratings.OVERALL.rating),
      finished: fresh.status === 'FINISHED',
      lives: livesLeft(fresh),
      achievements: [],
      ref,
    };
  }
  if (attempt.status !== 'IN_PROGRESS') throw new HttpError(409, 'Sessiya yakunlangan', 'FINISHED');
  if (attempt.deadlineAt && Date.now() > attempt.deadlineAt.getTime() + 5000) {
    await finishSession(attempt.id);
    const ratings = await ensureRatings(user.id);
    return {
      correct: false,
      correctDisplay: v.correctDisplay,
      correctLabel: v.correctLabel,
      explanation: v.explanation,
      ratingDelta: 0,
      rating: Math.round(ratings.OVERALL.rating),
      finished: true,
      lives: livesLeft(attempt),
      achievements: [],
      expired: true,
      ref,
    };
  }

  const clean = String(answer ?? '').trim().slice(0, 12);
  const correct = grade(v, clean);
  const now = new Date();
  const claim = await prisma.attemptAnswer.updateMany({
    where: { id: row.id, answeredAt: null },
    data: { answer: clean || null, isCorrect: correct, answeredAt: now, timeSpentMs: Math.max(0, Math.min(Math.round(timeMs), 3600_000)) },
  });
  if (!claim.count) return answerSession(attemptId, user, order, answer, timeMs);

  const eff = await applyEffects(user.id, [{ templateId: row.templateId, correct, timeMs }], {
    reviewForce: attempt.mode === 'REVIEW',
  });
  const delta = eff.perItem[0] ?? 0;
  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      answeredCount: { increment: 1 },
      correctCount: { increment: correct ? 1 : 0 },
      mistakes: { increment: correct ? 0 : 1 },
      ratingDelta: { increment: delta },
    },
  });
  await prisma.attemptAnswer.update({ where: { id: row.id }, data: { ratingDelta: delta } });

  let finished = false;
  if (attempt.mode === 'RUSH') {
    const lives = livesLeft(updated) ?? 0;
    if (lives <= 0) {
      await finishSession(attemptId);
      finished = true;
    } else {
      await appendRushItem(attemptId, user.id);
    }
  } else if (updated.answeredCount >= updated.totalItems) {
    await finishSession(attemptId);
    finished = true;
  }

  if (attempt.duelId) {
    const { emitDuelUpdate } = await import('./duels');
    void emitDuelUpdate(attempt.duelId);
  }

  const achievements = [...eff.achievements];
  if (finished) achievements.push(...(await checkAchievements(user.id)));
  return {
    correct,
    correctLabel: v.correctLabel,
    correctDisplay: v.correctDisplay,
    explanation: v.explanation,
    ratingDelta: delta,
    rating: eff.overallRating,
    finished,
    lives: livesLeft(updated),
    achievements,
    ref,
  };
}

/** Puzzle Rush: har to'g'ri javobdan keyin qiyinroq savol qo'shiladi. */
export async function appendRushItem(attemptId: string, userId: string): Promise<void> {
  const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: { select: { templateId: true, order: true } } } });
  const meta = (attempt.meta ?? {}) as unknown as RushMeta;
  const s = await getSettings();
  const ratings = await ensureRatings(userId);
  const base = meta.section ? ratings[meta.section].rating : ratings.OVERALL.rating;
  const target = base + s.rush.startOffset + attempt.correctCount * s.rush.stepPerCorrect;
  const catalog = filterCatalog(await getCatalog(), { section: meta.section });
  if (!catalog.length) throw new HttpError(409, "Savollar bankida savol yo'q", 'NO_QUESTIONS');
  const used = new Set(attempt.answers.map((a) => a.templateId));
  const recent = new Set(attempt.answers.slice(-5).map((a) => a.templateId));
  const pool = catalog.filter((c) => !used.has(c.id));
  const cands = (pool.length ? pool : catalog.filter((c) => !recent.has(c.id))).sort(
    (a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target),
  );
  const list = cands.length ? cands : catalog;
  const pick = list[Math.floor(Math.random() * Math.min(5, list.length))];
  const seed = await pickWorkingSeed(pick.id, pick.version);
  if (seed === null) return;
  const order = attempt.answers.length ? Math.max(...attempt.answers.map((a) => a.order)) + 1 : 0;
  await prisma.$transaction([
    prisma.attemptAnswer.create({ data: { attemptId, order, templateId: pick.id, templateVersion: pick.version, seed } }),
    prisma.attempt.update({ where: { id: attemptId }, data: { totalItems: { increment: 1 } } }),
  ]);
}

/** Sessiyani yakunlash (idempotent): kunlik streak, rush rekordi, duel natijasi. */
export async function finishSession(attemptId: string): Promise<void> {
  const claim = await prisma.attempt.updateMany({
    where: { id: attemptId, status: 'IN_PROGRESS' },
    data: { status: 'FINISHED', finishedAt: new Date() },
  });
  if (!claim.count) return;
  const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
  const s = await getSettings();

  if (attempt.mode === 'DAILY' && attempt.answeredCount > 0) {
    const today = attempt.dailyDate ?? tashkentDate();
    const st = await prisma.streak.findUnique({ where: { userId: attempt.userId } });
    const { state } = applyDailyCompletion(
      st ? { current: st.current, best: st.best, lastDate: st.lastDate, freezeUsedAt: st.freezeUsedAt } : { current: 0, best: 0, lastDate: null, freezeUsedAt: null },
      today,
    );
    await prisma.streak.upsert({ where: { userId: attempt.userId }, create: { userId: attempt.userId, ...state }, update: state });
    const perfect = attempt.correctCount === attempt.totalItems && attempt.totalItems > 0;
    await prisma.attempt.update({
      where: { id: attemptId },
      data: { meta: { ...((attempt.meta ?? {}) as Record<string, unknown>), perfect } as Prisma.InputJsonValue },
    });
    await addXp(attempt.userId, s.xp.dailyBonus);
  }

  if (attempt.mode === 'RUSH') {
    const meta = (attempt.meta ?? {}) as unknown as RushMeta;
    // oxirgi (javobsiz) savolni hisobdan chiqaramiz
    await prisma.attemptAnswer.deleteMany({ where: { attemptId, answeredAt: null } });
    await prisma.attempt.update({ where: { id: attemptId }, data: { totalItems: attempt.answeredCount } });
    await prisma.rushRun.create({
      data: {
        userId: attempt.userId,
        attemptId,
        durationSec: meta.durationSec ?? 180,
        score: attempt.correctCount,
        mistakes: attempt.mistakes,
      },
    });
  }

  if (attempt.duelId) {
    const { onDuelAttemptFinished } = await import('./duels');
    await onDuelAttemptFinished(attempt.duelId);
  }
  await checkAchievements(attempt.userId);
}

/** Yakunlangan sessiyani ko'rib chiqish: har bir savol, javob va izoh. */
export async function sessionReview(attemptId: string, user: AuthUser) {
  const attempt = await loadSession(attemptId, user);
  if (attempt.status !== 'FINISHED') throw new HttpError(409, 'Sessiya hali tugamagan');
  const rows = await prisma.attemptAnswer.findMany({
    where: { attemptId },
    orderBy: { order: 'asc' },
    include: { template: { select: { title: true, skill: { select: { name: true } }, domain: { select: { name: true } } } } },
  });
  const items = [];
  for (const r of rows) {
    const v = await getVariant(r);
    items.push({
      order: r.order,
      question: reviewQuestion(v, r.templateId),
      answer: r.answer,
      isCorrect: r.isCorrect,
      timeSpentMs: r.timeSpentMs,
      ratingDelta: r.ratingDelta,
      templateId: r.templateId,
      templateVersion: r.templateVersion,
      seed: r.seed,
      skill: r.template.skill.name,
      domain: r.template.domain.name,
    });
  }
  return {
    attempt: {
      id: attempt.id,
      mode: attempt.mode,
      title: attempt.title,
      correct: attempt.correctCount,
      total: attempt.totalItems,
      ratingDelta: attempt.ratingDelta,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
    },
    items,
  };
}
