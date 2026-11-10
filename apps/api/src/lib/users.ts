import type { Rating, RatingType, User } from '@prisma/client';
import {
  displayRating,
  estimateSat,
  effectiveStreak,
  isProvisional,
  levelFromXp,
  tashkentDate,
  titleFor,
  type AppSettings,
} from '@sat/shared';
import { prisma } from '../db';
import { getSettings } from './settings';

export const RATING_TYPES: RatingType[] = ['OVERALL', 'MATH', 'RW'];

export function displayName(u: Pick<User, 'firstName' | 'lastName' | 'username'>): string {
  const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return n || (u.username ? `@${u.username}` : 'Foydalanuvchi');
}

export function publicUser(u: User) {
  return {
    id: u.id,
    tgId: u.tgId.toString(),
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    photoUrl: u.photoUrl,
    name: displayName(u),
    lang: u.lang,
    roles: u.roles,
    status: u.status,
    targetScore: u.targetScore,
    examDate: u.examDate,
    xp: u.xp,
    answeredTotal: u.answeredTotal,
    correctTotal: u.correctTotal,
    notifyDaily: u.notifyDaily,
    createdAt: u.createdAt,
  };
}

/** Foydalanuvchining 3 ta reytingini (yo'q bo'lsa yaratib) qaytaradi. */
export async function ensureRatings(userId: string): Promise<Record<RatingType, Rating>> {
  let rows = await prisma.rating.findMany({ where: { userId } });
  if (rows.length < RATING_TYPES.length) {
    const s = await getSettings();
    await prisma.rating.createMany({
      data: RATING_TYPES.filter((t) => !rows.some((r) => r.type === t)).map((type) => ({
        userId,
        type,
        rating: s.rating.initial,
        peak: s.rating.initial,
      })),
      skipDuplicates: true,
    });
    rows = await prisma.rating.findMany({ where: { userId } });
  }
  return Object.fromEntries(rows.map((r) => [r.type, r])) as Record<RatingType, Rating>;
}

/**
 * O'quvchiga ko'rsatiladigan reyting (SAT shkalasi): umumiy reyting 400–1600 aniq son,
 * Math va R&W — 200–800, doim 10 ga karrali. Bo'limning taxminiy bali — bo'lim balining o'zi.
 */
export function ratingView(r: Pick<Rating, 'rating' | 'games' | 'peak'>, s: AppSettings, type: RatingType = 'OVERALL') {
  const rating = displayRating(type, r.rating, s.ratingToSat);
  return {
    rating,
    games: r.games,
    peak: displayRating(type, r.peak, s.ratingToSat),
    provisional: isProvisional(r.games, s.rating),
    title: titleFor(r.rating, s.titles),
    estimatedSat: type === 'OVERALL' ? estimateSat(r.rating, s.ratingToSat) : rating,
  };
}

export async function userStats(userId: string) {
  const s = await getSettings();
  const [ratings, streak, user] = await Promise.all([
    ensureRatings(userId),
    prisma.streak.findUnique({ where: { userId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } }),
  ]);
  const today = tashkentDate();
  const math = ratingView(ratings.MATH, s, 'MATH');
  const rw = ratingView(ratings.RW, s, 'RW');
  return {
    ratings: {
      // Taxminiy SAT = Math + R&W (ikkalasi 10 ga yaxlitlangan, shuning uchun yig'indi ham 0 bilan tugaydi)
      OVERALL: { ...ratingView(ratings.OVERALL, s), estimatedSat: math.rating + rw.rating },
      MATH: math,
      RW: rw,
    },
    streak: {
      current: effectiveStreak(streak, today),
      best: streak?.best ?? 0,
      lastDate: streak?.lastDate ?? null,
      doneToday: streak?.lastDate === today,
    },
    level: levelFromXp(user.xp),
  };
}
