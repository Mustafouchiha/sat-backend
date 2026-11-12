import type { Section } from '@prisma/client';
import { pickForMe } from '@sat/shared';
import { prisma } from '../db';
import type { AuthUser } from './auth';
import { filterCatalog, getCatalog } from './catalog';
import { addXp, checkAchievements } from './effects';
import { seenTemplates } from './fresh';
import { HttpError, notFound, randomCode } from './http';
import { emitToDuel } from './realtime';
import { createSession, finishSession } from './sessions';
import { getSettings } from './settings';
import { displayName, ensureRatings } from './users';

/**
 * Duel (1v1): ikkala o'quvchi bir xil shablonlarni oladi, lekin har biri O'Z sonlari bilan (har xil seed).
 * Ko'proq to'g'ri, teng bo'lsa tezroq yechgan yutadi.
 */
export async function createDuel(user: AuthUser, opts: { section?: Section | null; isPublic: boolean }) {
  const s = await getSettings();
  const ratings = await ensureRatings(user.id);
  const myRating = opts.section ? ratings[opts.section].rating : ratings.OVERALL.rating;
  const catalog = filterCatalog(await getCatalog(), { section: opts.section ?? null });
  if (catalog.length === 0) throw new HttpError(409, "Savollar bankida savol yo'q", 'NO_QUESTIONS');
  // Duel yaratgan o'quvchi hali ko'rmagan savollar afzal (raqib keyin qo'shiladi)
  const seen = await seenTemplates(user.id);
  const templateIds = pickForMe(catalog, myRating, Math.min(s.duel.count, catalog.length), { float: Math.random }, s.forMe, seen);
  return prisma.duel.create({
    data: {
      code: randomCode(6),
      creatorId: user.id,
      isPublic: opts.isPublic,
      creatorRating: myRating,
      section: opts.section ?? null,
      count: templateIds.length,
      templateIds,
    },
  });
}

async function startDuel(duelId: string, opponentId: string) {
  const s = await getSettings();
  const duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
  const claim = await prisma.duel.updateMany({
    where: { id: duelId, status: 'WAITING', opponentId: null },
    data: { status: 'ACTIVE', opponentId },
  });
  if (!claim.count) throw new HttpError(409, "Bu duelga allaqachon kimdir qo'shilgan", 'DUEL_TAKEN');
  const catalog = await getCatalog();
  const refs = duel.templateIds
    .map((id) => catalog.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const now = new Date();
  const deadlineAt = new Date(now.getTime() + refs.length * s.duel.secondsPerQuestion * 1000 + 10_000);
  for (const uid of [duel.creatorId, opponentId]) {
    await createSession(uid, 'DUEL', refs, { title: '⚔️ Duel', deadlineAt, duelId });
  }
  await prisma.duel.update({ where: { id: duelId }, data: { startedAt: now, deadlineAt } });
  await emitDuelUpdate(duelId);
}

export async function joinDuelByCode(user: AuthUser, code: string) {
  const duel = await prisma.duel.findUnique({ where: { code: code.toUpperCase() } });
  if (!duel) throw notFound('Duel');
  if (duel.creatorId === user.id) return duel;
  if (duel.opponentId === user.id) return duel;
  if (duel.status !== 'WAITING') throw new HttpError(409, 'Duel allaqachon boshlangan yoki tugagan', 'DUEL_TAKEN');
  await startDuel(duel.id, user.id);
  return prisma.duel.findUniqueOrThrow({ where: { id: duel.id } });
}

/** Reytingi yaqin raqib qidirish: ochiq kutayotgan duel bo'lsa qo'shiladi, bo'lmasa yangisini ochadi. */
export async function matchDuel(user: AuthUser, section: Section | null) {
  const s = await getSettings();
  const ratings = await ensureRatings(user.id);
  const myRating = section ? ratings[section].rating : ratings.OVERALL.rating;
  const since = new Date(Date.now() - 3 * 60_000);
  // o'zimning eski kutayotgan duellarimni bekor qilamiz
  await prisma.duel.updateMany({
    where: { creatorId: user.id, status: 'WAITING', isPublic: true, createdAt: { lt: since } },
    data: { status: 'CANCELLED' },
  });
  for (const window of [s.duel.matchWindow, s.duel.matchWindow * 2, 10000]) {
    const cand = await prisma.duel.findFirst({
      where: {
        status: 'WAITING',
        isPublic: true,
        section,
        creatorId: { not: user.id },
        createdAt: { gte: since },
        creatorRating: { gte: myRating - window, lte: myRating + window },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (cand) {
      try {
        await startDuel(cand.id, user.id);
        return prisma.duel.findUniqueOrThrow({ where: { id: cand.id } });
      } catch {
        // boshqa o'quvchi ulgurdi — keyingisini qidiramiz
      }
    }
  }
  const mine = await prisma.duel.findFirst({
    where: { creatorId: user.id, status: 'WAITING', isPublic: true, section, createdAt: { gte: since } },
  });
  return mine ?? createDuel(user, { section, isPublic: true });
}

export async function cancelDuel(user: AuthUser, duelId: string) {
  const r = await prisma.duel.updateMany({
    where: { id: duelId, creatorId: user.id, status: 'WAITING' },
    data: { status: 'CANCELLED' },
  });
  if (!r.count) throw new HttpError(409, 'Duelni bekor qilib bo\'lmaydi');
  await emitDuelUpdate(duelId);
}

export async function duelSummary(duelId: string) {
  const duel = await prisma.duel.findUnique({
    where: { id: duelId },
    include: { attempts: { select: { id: true, userId: true, answeredCount: true, correctCount: true, status: true, totalItems: true } } },
  });
  if (!duel) return null;
  const ids = [duel.creatorId, duel.opponentId].filter((x): x is string => !!x);
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  const times = await prisma.attemptAnswer.groupBy({
    by: ['attemptId'],
    where: { attemptId: { in: duel.attempts.map((a) => a.id) } },
    _sum: { timeSpentMs: true },
  });
  const side = (uid: string | null) => {
    if (!uid) return null;
    const u = users.find((x) => x.id === uid);
    const a = duel.attempts.find((x) => x.userId === uid);
    return {
      userId: uid,
      name: u ? displayName(u) : '—',
      photoUrl: u?.photoUrl ?? null,
      attemptId: a?.id ?? null,
      answered: a?.answeredCount ?? 0,
      correct: a?.correctCount ?? 0,
      finished: a?.status === 'FINISHED',
      timeMs: times.find((t) => t.attemptId === a?.id)?._sum.timeSpentMs ?? 0,
    };
  };
  return {
    id: duel.id,
    code: duel.code,
    status: duel.status,
    isPublic: duel.isPublic,
    section: duel.section,
    count: duel.count,
    startedAt: duel.startedAt,
    deadlineAt: duel.deadlineAt,
    winnerId: duel.winnerId,
    creator: side(duel.creatorId),
    opponent: side(duel.opponentId),
  };
}

export async function emitDuelUpdate(duelId: string): Promise<void> {
  const s = await duelSummary(duelId);
  if (s) emitToDuel(duelId, s);
}

/** Muddat o'tgan bo'lsa ikkala urinishni ham yopadi. */
export async function settleDuelIfExpired(duelId: string): Promise<void> {
  const duel = await prisma.duel.findUnique({ where: { id: duelId }, include: { attempts: true } });
  if (!duel || duel.status !== 'ACTIVE' || !duel.deadlineAt || duel.deadlineAt > new Date()) return;
  for (const a of duel.attempts) if (a.status === 'IN_PROGRESS') await finishSession(a.id);
  await onDuelAttemptFinished(duelId);
}

export async function onDuelAttemptFinished(duelId: string): Promise<void> {
  const duel = await prisma.duel.findUnique({ where: { id: duelId }, include: { attempts: true } });
  if (!duel || duel.status !== 'ACTIVE') {
    await emitDuelUpdate(duelId);
    return;
  }
  const expired = !!duel.deadlineAt && duel.deadlineAt < new Date();
  const allDone = duel.attempts.length >= 2 && duel.attempts.every((a) => a.status === 'FINISHED');
  if (!allDone && !expired) {
    await emitDuelUpdate(duelId);
    return;
  }
  const times = await prisma.attemptAnswer.groupBy({
    by: ['attemptId'],
    where: { attemptId: { in: duel.attempts.map((a) => a.id) } },
    _sum: { timeSpentMs: true },
  });
  const scored = duel.attempts
    .map((a) => ({ userId: a.userId, correct: a.correctCount, time: times.find((t) => t.attemptId === a.id)?._sum.timeSpentMs ?? 0 }))
    .sort((x, y) => y.correct - x.correct || x.time - y.time);
  const winner = scored.length >= 2 && (scored[0].correct !== scored[1].correct || scored[0].time !== scored[1].time) ? scored[0].userId : null;
  const claim = await prisma.duel.updateMany({
    where: { id: duelId, status: 'ACTIVE' },
    data: { status: 'FINISHED', winnerId: winner, finishedAt: new Date() },
  });
  if (claim.count && winner) {
    const s = await getSettings();
    await addXp(winner, s.xp.duelWin);
    await checkAchievements(winner);
  }
  await emitDuelUpdate(duelId);
}
