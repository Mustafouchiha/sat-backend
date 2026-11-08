import crypto from 'node:crypto';
import type { Role, UserStatus } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { env } from '../env';
import { ah, HttpError } from './http';

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && crypto.timingSafeEqual(ab, bb);
}

/**
 * Telegram Mini App initData tekshiruvi (HMAC-SHA256):
 * secret = HMAC_SHA256("WebAppData", bot_token); hash = HMAC_SHA256(secret, data_check_string)
 */
export function verifyInitData(initData: string, botToken: string, maxAgeSec: number): { user: TgUser; startParam?: string } {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new HttpError(401, "initData da hash yo'q", 'BAD_INIT_DATA');
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (!safeEqualHex(expected, hash)) throw new HttpError(401, "initData imzosi noto'g'ri", 'BAD_INIT_DATA');
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) {
    throw new HttpError(401, "Sessiya eskirgan — Mini App'ni qayta oching", 'INIT_DATA_EXPIRED');
  }
  let user: TgUser | null = null;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    user = null;
  }
  if (!user?.id) throw new HttpError(401, 'initData da foydalanuvchi yo\'q', 'BAD_INIT_DATA');
  return { user, startParam: params.get('start_param') ?? undefined };
}

/**
 * Telegram Login Widget tekshiruvi (desktop brauzerdagi admin panel uchun):
 * secret = SHA256(bot_token); hash = HMAC_SHA256(secret, data_check_string)
 */
export function verifyLoginWidget(data: Record<string, string | number>, botToken: string, maxAgeSec: number): TgUser {
  const { hash, ...rest } = data;
  if (!hash) throw new HttpError(401, "hash yo'q", 'BAD_LOGIN');
  const dataCheck = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (!safeEqualHex(expected, String(hash))) throw new HttpError(401, "Login imzosi noto'g'ri", 'BAD_LOGIN');
  if (Date.now() / 1000 - Number(rest.auth_date) > maxAgeSec) throw new HttpError(401, 'Login eskirgan', 'BAD_LOGIN');
  return {
    id: Number(rest.id),
    first_name: rest.first_name as string | undefined,
    last_name: rest.last_name as string | undefined,
    username: rest.username as string | undefined,
    photo_url: rest.photo_url as string | undefined,
  };
}

interface TokenPayload {
  sub: string;
  scope?: 'download';
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d' });
}

/** Fayl yuklab olish uchun 5 daqiqalik token (URL ichida yuboriladi). */
export function signDownloadToken(userId: string): string {
  return jwt.sign({ sub: userId, scope: 'download' }, env.JWT_SECRET, { expiresIn: '5m' });
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    throw new HttpError(401, "Token yaroqsiz yoki muddati o'tgan", 'BAD_TOKEN');
  }
}

export interface AuthUser {
  id: string;
  tgId: bigint;
  firstName: string;
  lastName: string | null;
  username: string | null;
  roles: Role[];
  status: UserStatus;
  lang: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const authSelect = {
  id: true,
  tgId: true,
  firstName: true,
  lastName: true,
  username: true,
  roles: true,
  status: true,
  lang: true,
  lastSeenAt: true,
} as const;

export const requireAuth = ah(async (req, _res, next) => {
  const header = req.headers.authorization;
  let token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  let fromQuery = false;
  if (!token && req.method === 'GET' && typeof req.query.dl === 'string') {
    token = req.query.dl;
    fromQuery = true;
  }
  if (!token) throw new HttpError(401, 'Avtorizatsiya talab qilinadi', 'NO_TOKEN');
  const payload = verifyToken(token);
  if (fromQuery && payload.scope !== 'download') throw new HttpError(401, 'Token yaroqsiz', 'BAD_TOKEN');
  if (!fromQuery && payload.scope === 'download') throw new HttpError(401, 'Token yaroqsiz', 'BAD_TOKEN');
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: authSelect });
  if (!user) throw new HttpError(401, 'Foydalanuvchi topilmadi', 'NO_USER');
  if (user.status === 'BLOCKED') throw new HttpError(403, 'Hisobingiz bloklangan', 'BLOCKED');
  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 5 * 60_000) {
    void prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  const { lastSeenAt: _ls, ...authUser } = user;
  req.user = authUser;
  next();
});

export function hasRole(u: Pick<AuthUser, 'roles'>, ...roles: Role[]): boolean {
  return u.roles.includes('SUPER_ADMIN') || roles.some((r) => u.roles.includes(r));
}

export const isStaff = (u: Pick<AuthUser, 'roles'>) => hasRole(u, 'OPERATOR', 'TEACHER');
export const isManager = (u: Pick<AuthUser, 'roles'>) => hasRole(u, 'OPERATOR');

export function me(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Avtorizatsiya talab qilinadi', 'NO_TOKEN');
  return req.user;
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Avtorizatsiya talab qilinadi', 'NO_TOKEN'));
    if (!hasRole(req.user, ...roles)) return next(new HttpError(403, "Bu amal uchun ruxsat yo'q", 'FORBIDDEN'));
    next();
  };

/** Guruhga qo'shilmagan (PENDING) o'quvchilar test/mashq qila olmaydi. */
export const requireActive = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'Avtorizatsiya talab qilinadi', 'NO_TOKEN'));
  if (req.user.status === 'ACTIVE' || hasRole(req.user, 'OPERATOR', 'TEACHER')) return next();
  next(new HttpError(403, "Avval guruhga qo'shiling (o'qituvchidan taklif kodini oling)", 'PENDING'));
};
