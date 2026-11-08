import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { env } from '../env';
import { me, requireAuth, signDownloadToken, signToken, verifyInitData, verifyLoginWidget, type TgUser } from '../lib/auth';
import { ah, HttpError, parse } from '../lib/http';
import { ensureRatings, publicUser } from '../lib/users';

export const authRouter = Router();

function langOf(code?: string): string {
  if (!code) return 'uz';
  if (code.startsWith('ru')) return 'ru';
  if (code.startsWith('en')) return 'en';
  return 'uz';
}

/** Telegram foydalanuvchisini yaratish/yangilash. SUPER_ADMIN_TG_IDS dagilar avtomatik admin. */
export async function upsertTgUser(tg: TgUser) {
  const tgId = BigInt(tg.id);
  const isSuper = env.superAdminIds.has(String(tg.id));
  const existing = await prisma.user.findUnique({ where: { tgId } });
  if (!existing) {
    const user = await prisma.user.create({
      data: {
        tgId,
        firstName: tg.first_name ?? '',
        lastName: tg.last_name ?? null,
        username: tg.username ?? null,
        photoUrl: tg.photo_url ?? null,
        lang: langOf(tg.language_code),
        roles: isSuper ? ['SUPER_ADMIN', 'STUDENT'] : ['STUDENT'],
        status: isSuper ? 'ACTIVE' : 'PENDING',
        lastSeenAt: new Date(),
      },
    });
    await ensureRatings(user.id);
    return user;
  }
  return prisma.user.update({
    where: { tgId },
    data: {
      firstName: tg.first_name ?? existing.firstName,
      lastName: tg.last_name ?? existing.lastName,
      username: tg.username ?? existing.username,
      photoUrl: tg.photo_url ?? existing.photoUrl,
      lastSeenAt: new Date(),
      ...(isSuper && !existing.roles.includes('SUPER_ADMIN')
        ? { roles: [...new Set([...existing.roles, 'SUPER_ADMIN' as const])], status: 'ACTIVE' as const }
        : {}),
    },
  });
}

/** Mini App: initData -> JWT */
authRouter.post(
  '/telegram',
  ah(async (req, res) => {
    const { initData } = parse(z.object({ initData: z.string().min(10) }), req.body);
    if (!env.BOT_TOKEN) throw new HttpError(500, 'Serverda BOT_TOKEN sozlanmagan', 'NO_BOT_TOKEN');
    // auth_date 24 soatdan eski bo'lsa rad etiladi
    const { user: tg, startParam } = verifyInitData(initData, env.BOT_TOKEN, 86400);
    const user = await upsertTgUser(tg);
    if (user.status === 'BLOCKED') throw new HttpError(403, 'Hisobingiz bloklangan', 'BLOCKED');
    res.json({ token: signToken(user.id), user: publicUser(user), startParam: startParam ?? null });
  }),
);

/** Desktop brauzer (admin panel): Telegram Login Widget -> JWT */
authRouter.post(
  '/widget',
  ah(async (req, res) => {
    const data = parse(z.record(z.union([z.string(), z.number()])), req.body);
    if (!env.BOT_TOKEN) throw new HttpError(500, 'Serverda BOT_TOKEN sozlanmagan', 'NO_BOT_TOKEN');
    const tg = verifyLoginWidget(data, env.BOT_TOKEN, 86400);
    const user = await upsertTgUser(tg);
    if (user.status === 'BLOCKED') throw new HttpError(403, 'Hisobingiz bloklangan', 'BLOCKED');
    res.json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

/** Faqat lokal ishlab chiqish uchun (ALLOW_DEV_LOGIN=true va NODE_ENV != production). */
authRouter.post(
  '/dev',
  ah(async (req, res) => {
    if (!env.devLogin) throw new HttpError(404, 'Topilmadi');
    const body = parse(
      z.object({ tgId: z.coerce.number().int().positive(), firstName: z.string().default('Dev'), username: z.string().optional() }),
      req.body,
    );
    const user = await upsertTgUser({ id: body.tgId, first_name: body.firstName, username: body.username });
    res.json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

/** Excel/JSON yuklab olish uchun qisqa muddatli token (URL ichida ishlatiladi). */
authRouter.post(
  '/download-token',
  requireAuth,
  ah(async (req, res) => {
    res.json({ token: signDownloadToken(me(req).id) });
  }),
);
