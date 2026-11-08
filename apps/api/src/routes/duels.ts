import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { env } from '../env';
import { me, requireActive, requireAuth } from '../lib/auth';
import { cancelDuel, createDuel, duelSummary, joinDuelByCode, matchDuel, settleDuelIfExpired } from '../lib/duels';
import { ah, forbidden, notFound, parse } from '../lib/http';

export const duelsRouter = Router();
duelsRouter.use(requireAuth, requireActive);

const sectionE = z.enum(['RW', 'MATH']).nullish();

function inviteLink(code: string): string | null {
  return env.BOT_USERNAME ? `https://t.me/${env.BOT_USERNAME}?start=duel_${code}` : null;
}

/** Do'stni taklif qilish uchun duel ochish (havola orqali). */
duelsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = parse(z.object({ section: sectionE }), req.body);
    const duel = await createDuel(me(req), { section: body.section ?? null, isPublic: false });
    res.status(201).json({ id: duel.id, code: duel.code, link: inviteLink(duel.code) });
  }),
);

/** Reytingi yaqin raqib qidirish. */
duelsRouter.post(
  '/match',
  ah(async (req, res) => {
    const body = parse(z.object({ section: sectionE }), req.body);
    const duel = await matchDuel(me(req), body.section ?? null);
    res.json({ id: duel.id, code: duel.code, status: duel.status });
  }),
);

duelsRouter.post(
  '/join/:code',
  ah(async (req, res) => {
    const duel = await joinDuelByCode(me(req), req.params.code);
    res.json({ id: duel.id, status: duel.status });
  }),
);

duelsRouter.get(
  '/mine',
  ah(async (req, res) => {
    const u = me(req);
    const list = await prisma.duel.findMany({
      where: { OR: [{ creatorId: u.id }, { opponentId: u.id }], status: { in: ['ACTIVE', 'FINISHED', 'WAITING'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(await Promise.all(list.map((d) => duelSummary(d.id))));
  }),
);

duelsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    await settleDuelIfExpired(req.params.id);
    const s = await duelSummary(req.params.id);
    if (!s) throw notFound('Duel');
    if (s.creator?.userId !== u.id && s.opponent?.userId !== u.id) throw forbidden();
    res.json({ ...s, link: inviteLink(s.code), me: u.id });
  }),
);

duelsRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    await cancelDuel(me(req), req.params.id);
    res.json({ ok: true });
  }),
);
