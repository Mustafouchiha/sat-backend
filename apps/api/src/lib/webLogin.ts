import crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { signToken } from './auth';
import { HttpError } from './http';
import { escapeHtml, getBot, getBotTitle, getBotUsername } from './notify';
import { deviceLabel, maskPhone, normalizePhone } from './loginHelpers';
import { publicUser } from './users';

export { deviceLabel, maskPhone, normalizePhone };

/**
 * Kompyuterdagi brauzer uchun kirish (Telegram Mini App'dan tashqarida):
 *  - QR: brauzer QR ko'rsatadi → telefonda skanerlanadi → @bot «Tasdiqlash» → brauzer token oladi;
 *  - telefon raqam: botga ulangan raqamga bot orqali 6 xonali kod yuboriladi.
 * Token faqat so'rovni yaratgan brauzerga beriladi: u QR'da ko'rinmaydigan sirni biladi.
 */

export const QR_TTL_MS = 5 * 60_000;
export const PHONE_TTL_MS = 10 * 60_000;
/** Tasdiqlangan QR'ni brauzer shu vaqt ichida olib ketishi kerak */
const CLAIM_WINDOW_MS = 15 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
const PHONE_REQUESTS_PER_10_MIN = 3;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const randomId = () => crypto.randomBytes(16).toString('base64url');
const randomSecret = () => crypto.randomBytes(24).toString('base64url');

function sameHash(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && crypto.timingSafeEqual(ab, bb);
}

/** Telegram'da bot bilan chatni ochadigan havola (start parametri bilan). */
export function botStartLink(param: string): string | null {
  const name = getBotUsername();
  return name ? `https://t.me/${name}?start=${param}` : null;
}

/** Bot ishlamasa (masalan BOT_TOKEN noto'g'ri) QR tasdiqlanmaydi va kod yetib bormaydi — oldindan aytamiz. */
function requireBot(): void {
  if (!getBot() && !env.devLogin) {
    throw new HttpError(503, "Telegram bot hozir ishlamayapti, shuning uchun kompyuterdan kirib bo'lmaydi. Administrator Railway'dagi BOT_TOKEN'ni tekshirsin.", 'BOT_DOWN');
  }
}

/** Bir kundan eski so'rovlarni tozalash (arzon, indeks bo'yicha). */
function cleanup(): void {
  void prisma.webLogin.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } }).catch(() => undefined);
}

async function sessionFor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'Foydalanuvchi topilmadi', 'NO_USER');
  if (user.status === 'BLOCKED') throw new HttpError(403, 'Hisobingiz bloklangan', 'BLOCKED');
  return { token: signToken(user.id), user: publicUser(user) };
}

async function findOwned(id: string, secret: string) {
  const wl = await prisma.webLogin.findUnique({ where: { id } });
  if (!wl || !sameHash(wl.secretHash, sha256(secret))) throw new HttpError(404, "Kirish so'rovi topilmadi — sahifani yangilang", 'WL_NOT_FOUND');
  return wl;
}

// ───────────────────────── QR ─────────────────────────

export async function createQrLogin(userAgent?: string) {
  requireBot();
  cleanup();
  const id = randomId();
  const secret = randomSecret();
  const expiresAt = new Date(Date.now() + QR_TTL_MS);
  await prisma.webLogin.create({ data: { id, secretHash: sha256(secret), kind: 'QR', device: deviceLabel(userAgent), expiresAt } });
  return { id, secret, expiresAt, link: botStartLink(`login_${id}`), botTitle: getBotTitle() };
}

export type PollResult =
  | { status: 'pending' | 'expired' | 'rejected' | 'used' }
  | { status: 'approved'; token: string; user: ReturnType<typeof publicUser> };

/** Brauzer har 2 soniyada so'raydi: telefonda tasdiqlangan bo'lsa — bir martalik token. */
export async function pollLogin(id: string, secret: string): Promise<PollResult> {
  const wl = await findOwned(id, secret);
  if (wl.status === 'REJECTED') return { status: 'rejected' };
  if (wl.status === 'USED') return { status: 'used' };
  if (wl.status === 'APPROVED' && wl.userId) {
    if (Date.now() - wl.createdAt.getTime() > CLAIM_WINDOW_MS) return { status: 'expired' };
    // Bir vaqtda ikki so'rov kelsa ham token faqat bir marta beriladi
    const claimed = await prisma.webLogin.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'USED' } });
    if (claimed.count !== 1) return { status: 'used' };
    return { status: 'approved', ...(await sessionFor(wl.userId)) };
  }
  if (wl.expiresAt.getTime() < Date.now()) return { status: 'expired' };
  return { status: 'pending' };
}

/** Mini App ichidagi skaner: tasdiqlashdan oldin qaysi qurilma kirayotganini ko'rsatish. */
export async function peekQrLogin(id: string) {
  const wl = await findPendingQr(id);
  if (!wl) throw new HttpError(410, "QR kod eskirgan yoki ishlatilgan — kompyuterdagi sahifani yangilab, qayta skanerlang", 'WL_EXPIRED');
  return { id: wl.id, device: wl.device, expiresAt: wl.expiresAt };
}

/** Bot «/start login_ID» olganda: tasdiqlash xabari uchun so'rov ma'lumoti. */
export async function findPendingQr(id: string) {
  const wl = await prisma.webLogin.findUnique({ where: { id } });
  if (!wl || wl.kind !== 'QR' || wl.status !== 'PENDING' || wl.expiresAt.getTime() < Date.now()) return null;
  return wl;
}

export async function approveQrLogin(id: string, user: Pick<User, 'id' | 'status'>): Promise<'ok' | 'gone' | 'blocked'> {
  if (user.status === 'BLOCKED') return 'blocked';
  const r = await prisma.webLogin.updateMany({
    where: { id, kind: 'QR', status: 'PENDING', expiresAt: { gt: new Date() } },
    data: { status: 'APPROVED', userId: user.id },
  });
  return r.count ? 'ok' : 'gone';
}

export async function rejectQrLogin(id: string): Promise<boolean> {
  const r = await prisma.webLogin.updateMany({ where: { id, kind: 'QR', status: 'PENDING' }, data: { status: 'REJECTED' } });
  return r.count > 0;
}

// ───────────────────────── Telefon raqam + kod ─────────────────────────

/** Kodni bot orqali yuboradi (bazaga faqat xeshi yoziladi, xabar Notification jadvaliga saqlanmaydi). */
async function sendCode(wl: { id: string; device: string }, user: Pick<User, 'id' | 'tgId' | 'phone'>): Promise<boolean> {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  await prisma.webLogin.update({ where: { id: wl.id }, data: { userId: user.id, codeHash: sha256(`${wl.id}:${code}`) } });
  const bot = getBot();
  if (!bot) {
    // Faqat lokal ishlab chiqishda (bot o'chiq): kodni konsolga chiqarish
    if (env.devLogin) console.log(`[dev] ${maskPhone(user.phone)} uchun kirish kodi: ${code}`);
    return env.devLogin;
  }
  try {
    await bot.telegram.sendMessage(
      Number(user.tgId),
      `🔐 <b>SAT Prep</b> — kompyuterda kirish kodi:\n\n<code>${code}</code>\n\n` +
        `Qurilma: ${escapeHtml(wl.device)}\nKod 10 daqiqa amal qiladi. Uni hech kimga bermang.\n` +
        `Agar kirishni siz so'ramagan bo'lsangiz, bu xabarga e'tibor bermang.`,
      { parse_mode: 'HTML' },
    );
    return true;
  } catch (e) {
    console.error('Kirish kodi yuborilmadi:', (e as Error).message);
    return false;
  }
}

/**
 * Raqam botga ulangan bo'lsa, kod Telegram'ga yuboriladi. Javob har doim bir xil ko'rinishda —
 * kimdir begona raqamlar ro'yxatdan o'tganmi yoki yo'qligini bilib ololmaydi.
 */
export async function requestPhoneCode(rawPhone: string, userAgent?: string) {
  requireBot();
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Telefon raqam noto'g'ri. Masalan: +998 90 123 45 67", 'BAD_PHONE');
  const recent = await prisma.webLogin.count({ where: { phone, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
  if (recent >= PHONE_REQUESTS_PER_10_MIN) {
    throw new HttpError(429, "Bu raqamga juda ko'p kod so'raldi. 10 daqiqadan keyin qayta urinib ko'ring", 'TOO_MANY_CODES');
  }
  cleanup();
  const id = randomId();
  const secret = randomSecret();
  const expiresAt = new Date(Date.now() + PHONE_TTL_MS);
  const wl = await prisma.webLogin.create({
    data: { id, secretHash: sha256(secret), kind: 'PHONE', phone, device: deviceLabel(userAgent), expiresAt },
  });
  const user = await prisma.user.findUnique({ where: { phone } });
  // botBlocked eskirgan bo'lishi mumkin (botni qayta ochgan bo'lsa) — baribir urinamiz, xato bo'lsa jim o'tadi
  if (user && user.status !== 'BLOCKED') await sendCode(wl, user);
  const bot = getBotUsername();
  return { id, secret, expiresAt, phone: maskPhone(phone), linkBot: botStartLink('phone'), chatLink: bot ? `https://t.me/${bot}` : null, botTitle: getBotTitle() };
}

export async function verifyPhoneCode(id: string, secret: string, code: string) {
  const wl = await findOwned(id, secret);
  if (wl.kind !== 'PHONE') throw new HttpError(400, "So'rov turi noto'g'ri", 'WL_KIND');
  if (wl.status !== 'PENDING' || wl.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, "Kod muddati o'tgan yoki ishlatilgan — yangi kod so'rang", 'WL_EXPIRED');
  }
  if (wl.attempts >= MAX_CODE_ATTEMPTS) throw new HttpError(429, "Urinishlar tugadi — yangi kod so'rang", 'WL_LOCKED');
  const ok = !!wl.codeHash && !!wl.userId && sameHash(wl.codeHash, sha256(`${id}:${code.trim()}`));
  if (!ok) {
    const after = await prisma.webLogin.update({ where: { id }, data: { attempts: { increment: 1 } } });
    const left = MAX_CODE_ATTEMPTS - after.attempts;
    if (left <= 0) await prisma.webLogin.update({ where: { id }, data: { status: 'REJECTED' } });
    throw new HttpError(
      400,
      left > 0 ? `Kod noto'g'ri. Yana ${left} ta urinish qoldi` : "Kod noto'g'ri. Urinishlar tugadi — yangi kod so'rang",
      'BAD_CODE',
      { left: Math.max(0, left) },
    );
  }
  const used = await prisma.webLogin.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'USED' } });
  if (!used.count) throw new HttpError(410, "Kod allaqachon ishlatilgan — yangi kod so'rang", 'WL_EXPIRED');
  return sessionFor(wl.userId!);
}

/** Botda «Raqamni ulashish» bosilganda: raqam shu foydalanuvchiga biriktiriladi (boshqa akkauntda bo'lsa, o'sha yerdan olinadi). */
export async function linkPhone(userId: string, rawPhone: string): Promise<User> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Telefon raqam noto'g'ri", 'BAD_PHONE');
  const [, user] = await prisma.$transaction([
    prisma.user.updateMany({ where: { phone, NOT: { id: userId } }, data: { phone: null } }),
    prisma.user.update({ where: { id: userId }, data: { phone } }),
  ]);
  return user;
}

/** Kompyuterda shu raqam bilan kod kutayotgan so'rov bo'lsa — kodni darhol yuborish (raqam ulangandan keyin). */
export async function sendPendingPhoneCode(user: Pick<User, 'id' | 'tgId' | 'phone'>): Promise<boolean> {
  if (!user.phone) return false;
  const pending = await prisma.webLogin.findFirst({
    where: { kind: 'PHONE', phone: user.phone, status: 'PENDING', codeHash: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  return pending ? sendCode(pending, user) : false;
}
