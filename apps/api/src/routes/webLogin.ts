import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../env';
import { me, requireAuth } from '../lib/auth';
import { ah, HttpError, parse } from '../lib/http';
import { approveQrLogin, createQrLogin, peekQrLogin, pollLogin, requestPhoneCode, verifyPhoneCode } from '../lib/webLogin';
import { upsertTgUser } from './auth';

/** Kompyuterdagi brauzer uchun kirish: QR kod (telefonda tasdiqlash) yoki telefon raqam + Telegram'ga kelgan kod. */
export const webLoginRouter = Router();

const limiter = (windowMin: number, limit: number) =>
  rateLimit({ windowMs: windowMin * 60_000, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: "Juda ko'p so'rov — birozdan keyin urinib ko'ring", code: 'RATE_LIMIT' } });

const idE = z.string().regex(/^[A-Za-z0-9_-]{16,40}$/);
const secretE = z.string().min(16).max(80);

// Bitta o'quv markaz Wi-Fi'sida ko'p o'quvchi bir vaqtda kirishi mumkin — IP limitlari keng, raqam bo'yicha limit serverda
webLoginRouter.post(
  '/qr',
  limiter(10, 120),
  ah(async (req, res) => {
    res.json(await createQrLogin(req.get('user-agent')));
  }),
);

webLoginRouter.post(
  '/poll',
  limiter(1, 120),
  ah(async (req, res) => {
    const b = parse(z.object({ id: idE, secret: secretE }), req.body);
    res.json(await pollLogin(b.id, b.secret));
  }),
);

webLoginRouter.post(
  '/phone',
  limiter(10, 40),
  ah(async (req, res) => {
    const b = parse(z.object({ phone: z.string().min(7).max(30) }), req.body);
    res.json(await requestPhoneCode(b.phone, req.get('user-agent')));
  }),
);

webLoginRouter.post(
  '/phone/verify',
  limiter(10, 60),
  ah(async (req, res) => {
    const b = parse(z.object({ id: idE, secret: secretE, code: z.string().regex(/^\s*\d{6}\s*$/, '6 xonali kod kiriting') }), req.body);
    res.json(await verifyPhoneCode(b.id, b.secret, b.code));
  }),
);

/**
 * Mini App ichidagi QR skaner: kirgan foydalanuvchi kompyuterdagi QR'ni skanerlaydi,
 * avval qurilmani ko'radi (peek), so'ng tasdiqlaydi (approve) — bot chatiga o'tish shart emas.
 */
webLoginRouter.post(
  '/peek',
  requireAuth,
  ah(async (req, res) => {
    const b = parse(z.object({ id: idE }), req.body);
    res.json(await peekQrLogin(b.id));
  }),
);

webLoginRouter.post(
  '/approve',
  requireAuth,
  ah(async (req, res) => {
    const b = parse(z.object({ id: idE }), req.body);
    const result = await approveQrLogin(b.id, me(req));
    if (result === 'gone') throw new HttpError(410, 'QR kod eskirgan yoki ishlatilgan — kompyuterdagi sahifani yangilab, qayta skanerlang', 'WL_EXPIRED');
    if (result === 'blocked') throw new HttpError(403, 'Hisobingiz bloklangan', 'BLOCKED');
    res.json({ ok: true });
  }),
);

/** Faqat lokal ishlab chiqish: bot o'chiq bo'lganda QR'ni "telefonda tasdiqlash" o'rniga. */
webLoginRouter.post(
  '/dev-approve',
  ah(async (req, res) => {
    if (!env.devLogin) throw new HttpError(404, 'Topilmadi');
    const b = parse(z.object({ id: idE, tgId: z.coerce.number().int().positive() }), req.body);
    const user = await upsertTgUser({ id: b.tgId, first_name: 'Dev' });
    res.json({ result: await approveQrLogin(b.id, user) });
  }),
);
