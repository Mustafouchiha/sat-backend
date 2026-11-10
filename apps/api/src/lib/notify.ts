import type { Telegraf } from 'telegraf';
import { prisma } from '../db';
import { env } from '../env';

let botRef: Telegraf | null = null;
let botUsernameRef: string | null = null;

export function setBot(bot: Telegraf | null): void {
  botRef = bot;
}

export function getBot(): Telegraf | null {
  return botRef;
}

/** Bot ishga tushganda getMe() dan olinadi; bo'lmasa BOT_USERNAME. */
export function setBotUsername(username: string | null | undefined): void {
  botUsernameRef = username ?? null;
}

export function getBotUsername(): string | null {
  return botUsernameRef ?? env.BOT_USERNAME ?? null;
}

export function appUrl(params?: Record<string, string>): string {
  const u = new URL(env.MINI_APP_URL);
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

export interface NotifyButton {
  text: string;
  /** Mini App ichidagi sahifa: masalan "/tests" */
  path?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bitta foydalanuvchiga bot orqali xabar. Bot bloklangan bo'lsa botBlocked=true qilinadi. */
export async function notifyUser(
  user: { id: string; tgId: bigint; botBlocked?: boolean },
  text: string,
  button?: NotifyButton,
  type = 'GENERIC',
): Promise<boolean> {
  if (!botRef || user.botBlocked) return false;
  try {
    await botRef.telegram.sendMessage(Number(user.tgId), text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: button
        ? { inline_keyboard: [[{ text: button.text, web_app: { url: appUrl(button.path ? { path: button.path } : {}) } }]] }
        : undefined,
    });
    await prisma.notification.create({ data: { userId: user.id, type, payload: { text } } }).catch(() => undefined);
    return true;
  } catch (e) {
    const code = (e as { response?: { error_code?: number } })?.response?.error_code;
    if (code === 403) {
      await prisma.user.update({ where: { id: user.id }, data: { botBlocked: true } }).catch(() => undefined);
    } else {
      console.error('Telegram xabar yuborilmadi:', (e as Error).message);
    }
    return false;
  }
}

/** Ko'p foydalanuvchiga (Telegram limiti ~30 xabar/soniya — 40ms oraliq bilan). */
export async function broadcast(
  users: Array<{ id: string; tgId: bigint; botBlocked?: boolean }>,
  text: string,
  button?: NotifyButton,
  type = 'BROADCAST',
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const u of users) {
    if (await notifyUser(u, text, button, type)) sent++;
    else failed++;
    await sleep(40);
  }
  return { sent, failed };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
