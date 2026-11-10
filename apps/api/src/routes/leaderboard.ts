import type { RatingType } from '@prisma/client';
import { displayRating, isProvisional, ratingFactor, tashkentDate, titleFor } from '@sat/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { isStaff, me, requireAuth } from '../lib/auth';
import { ah, forbidden, HttpError, notFound, parse } from '../lib/http';
import { getSettings } from '../lib/settings';
import { displayName } from '../lib/users';
import { dailyLeaderboard } from './daily';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

async function groupStudentIds(groupId: string, viewer: ReturnType<typeof me>): Promise<string[]> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, include: { members: true } });
  if (!group) throw notFound('Guruh');
  const isMember = group.members.some((m) => m.userId === viewer.id);
  if (!isMember && !isStaff(viewer)) throw forbidden();
  if (!group.leaderboardEnabled && !isStaff(viewer)) {
    throw new HttpError(403, "O'qituvchi bu guruhda reyting jadvalini o'chirgan", 'LEADERBOARD_DISABLED');
  }
  return group.members.filter((m) => m.role === 'STUDENT').map((m) => m.userId);
}

/** Reyting jadvali: markaz yoki guruh; umumiy / haftalik / oylik. */
leaderboardRouter.get(
  '/',
  ah(async (req, res) => {
    const q = parse(
      z.object({
        type: z.enum(['OVERALL', 'MATH', 'RW']).default('OVERALL'),
        scope: z.enum(['center', 'group']).default('center'),
        groupId: z.string().optional(),
        period: z.enum(['all', 'week', 'month']).default('all'),
      }),
      req.query,
    );
    const u = me(req);
    const s = await getSettings();
    let userIds: string[] | undefined;
    if (q.scope === 'group') {
      if (!q.groupId) throw new HttpError(400, 'groupId kerak');
      userIds = await groupStudentIds(q.groupId, u);
    }
    const type = q.type as RatingType;
    let entries: Array<{ rank: number; userId: string; name: string; photoUrl: string | null; value: number; title?: ReturnType<typeof titleFor>; provisional?: boolean }>;

    if (q.period === 'all') {
      const rows = await prisma.rating.findMany({
        where: {
          type,
          games: { gt: 0 },
          ...(userIds ? { userId: { in: userIds } } : {}),
          user: { status: 'ACTIVE', roles: { has: 'STUDENT' } },
        },
        orderBy: { rating: 'desc' },
        take: 100,
        include: { user: { select: { firstName: true, lastName: true, username: true, photoUrl: true } } },
      });
      entries = rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        name: displayName(r.user),
        photoUrl: r.user.photoUrl,
        value: displayRating(type, r.rating, s.ratingToSat),
        title: titleFor(r.rating, s.titles),
        provisional: isProvisional(r.games, s.rating),
      }));
    } else {
      const since = new Date(Date.now() - (q.period === 'week' ? 7 : 30) * 86400_000);
      const groups = await prisma.ratingHistory.groupBy({
        by: ['userId'],
        where: { type, createdAt: { gte: since }, ...(userIds ? { userId: { in: userIds } } : {}) },
        _sum: { delta: true },
        orderBy: { _sum: { delta: 'desc' } },
        take: 100,
      });
      const users = await prisma.user.findMany({ where: { id: { in: groups.map((g) => g.userId) } } });
      entries = groups
        .map((g) => ({ g, user: users.find((x) => x.id === g.userId) }))
        .filter((x) => x.user && x.user.status === 'ACTIVE')
        .map((x, i) => ({
          rank: i + 1,
          userId: x.g.userId,
          name: displayName(x.user!),
          photoUrl: x.user!.photoUrl,
          value: Math.round((x.g._sum.delta ?? 0) * ratingFactor(type)),
        }));
    }
    const mine = entries.find((e) => e.userId === u.id) ?? null;
    let myRank = mine?.rank ?? null;
    if (!mine && q.period === 'all') {
      const my = await prisma.rating.findUnique({ where: { userId_type: { userId: u.id, type } } });
      if (my && my.games > 0) {
        myRank =
          (await prisma.rating.count({
            where: {
              type,
              rating: { gt: my.rating },
              games: { gt: 0 },
              ...(userIds ? { userId: { in: userIds } } : {}),
              user: { status: 'ACTIVE', roles: { has: 'STUDENT' } },
            },
          })) + 1;
      }
    }
    res.json({ entries, myRank });
  }),
);

leaderboardRouter.get(
  '/daily',
  ah(async (req, res) => {
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : tashkentDate();
    res.json({ date, entries: await dailyLeaderboard(date, 50) });
  }),
);

leaderboardRouter.get(
  '/rush',
  ah(async (req, res) => {
    const q = parse(
      z.object({ duration: z.coerce.number().int().default(180), period: z.enum(['all', 'week']).default('all') }),
      req.query,
    );
    const where = {
      durationSec: q.duration,
      ...(q.period === 'week' ? { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } : {}),
    };
    const best = await prisma.rushRun.groupBy({
      by: ['userId'],
      where,
      _max: { score: true },
      orderBy: { _max: { score: 'desc' } },
      take: 50,
    });
    const users = await prisma.user.findMany({ where: { id: { in: best.map((b) => b.userId) } } });
    const me_ = me(req);
    const my = await prisma.rushRun.aggregate({ where: { ...where, userId: me_.id }, _max: { score: true } });
    res.json({
      entries: best.map((b, i) => {
        const user = users.find((x) => x.id === b.userId);
        return { rank: i + 1, userId: b.userId, name: user ? displayName(user) : '—', photoUrl: user?.photoUrl ?? null, value: b._max.score ?? 0 };
      }),
      myBest: my._max.score ?? 0,
    });
  }),
);
