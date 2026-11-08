import { tashkentDate } from '@sat/shared';
import type { Express } from 'express';
import { Telegraf } from 'telegraf';
import { prisma } from './db';
import { env } from './env';
import { hasRole } from './lib/auth';
import { appUrl, escapeHtml } from './lib/notify';
import { displayName } from './lib/users';
import { upsertTgUser } from './routes/auth';

export const WEBHOOK_PATH = '/telegram/webhook';

export function createBot(): Telegraf | null {
  if (!env.BOT_TOKEN || env.BOT_MODE === 'off') return null;
  const bot = new Telegraf(env.BOT_TOKEN);

  const openButton = (params: Record<string, string> = {}, text = "📚 SAT Mini App'ni ochish") => ({
    reply_markup: { inline_keyboard: [[{ text, web_app: { url: appUrl(params) } }]] },
  });

  bot.start(async (ctx) => {
    const from = ctx.from;
    const user = await upsertTgUser({
      id: from.id,
      first_name: from.first_name,
      last_name: from.last_name,
      username: from.username,
      language_code: from.language_code,
    });
    const payload = (ctx.payload ?? '').trim();

    if (payload.startsWith('parent_')) {
      const code = payload.slice('parent_'.length).toUpperCase();
      const link = await prisma.parentLink.findUnique({ where: { code }, include: { student: true } });
      if (!link || link.parentId) return ctx.reply("❌ Kod yaroqsiz yoki allaqachon ishlatilgan.");
      if (link.studentId === user.id) return ctx.reply("❌ O'zingizni ota-ona sifatida ulay olmaysiz.");
      await prisma.parentLink.update({ where: { id: link.id }, data: { parentId: user.id, linkedAt: new Date() } });
      if (!user.roles.includes('PARENT')) {
        await prisma.user.update({ where: { id: user.id }, data: { roles: [...user.roles, 'PARENT'] } });
      }
      return ctx.reply(
        `✅ Siz <b>${escapeHtml(displayName(link.student))}</b> ga ota-ona sifatida ulandingiz.\nHar yakshanba haftalik hisobot yuboriladi.`,
        { parse_mode: 'HTML' },
      );
    }
    if (payload.startsWith('join_')) {
      return ctx.reply("Guruhga qo'shilish uchun ilovani oching:", openButton({ join: payload.slice(5) }));
    }
    if (payload.startsWith('duel_')) {
      return ctx.reply('⚔️ Sizni duelga chaqirishdi! Qabul qilish uchun ilovani oching:', openButton({ duel: payload.slice(5) }, '⚔️ Duelga kirish'));
    }
    return ctx.reply(
      `Salom, ${escapeHtml(from.first_name ?? '')}! 👋\n\n<b>Digital SAT</b> ga tayyorlov ilovasiga xush kelibsiz.\n` +
        `• Har kuni kunlik test va streak 🔥\n• Chess kabi reyting va duellar ⚔️\n• Har safar yangi sonli savollar 🎲\n\n` +
        `Boshlash uchun tugmani bosing. O'qituvchingizdan guruh taklif kodini oling.`,
      { parse_mode: 'HTML', ...openButton() },
    );
  });

  bot.command('app', (ctx) => ctx.reply('Ilovani ochish:', openButton()));

  bot.command('help', (ctx) =>
    ctx.reply(
      "/app — ilovani ochish\n/stats — kunlik statistika (admin)\n\nSavollar bo'yicha shikoyatni ilova ichidagi \"Xato bor\" tugmasi orqali yuboring.",
    ),
  );

  bot.command('stats', async (ctx) => {
    const user = await prisma.user.findUnique({ where: { tgId: BigInt(ctx.from.id) } });
    if (!user || !hasRole(user, 'OPERATOR')) return ctx.reply("Bu buyruq faqat adminlar uchun.");
    return ctx.reply(await dailyStatsText(), { parse_mode: 'HTML' });
  });

  bot.catch((err) => console.error('Bot xatosi:', err));
  return bot;
}

export async function dailyStatsText(): Promise<string> {
  const today = tashkentDate();
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 5 * 3600_000);
  const [newUsers, active, answers, correct, dailyDone, tests, openReports, pending] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { lastSeenAt: { gte: since } } }),
    prisma.attemptAnswer.count({ where: { answeredAt: { gte: since } } }),
    prisma.attemptAnswer.count({ where: { answeredAt: { gte: since }, isCorrect: true } }),
    prisma.attempt.count({ where: { mode: 'DAILY', dailyDate: today, status: 'FINISHED' } }),
    prisma.attempt.count({ where: { mode: 'TEST', status: 'FINISHED', finishedAt: { gte: since } } }),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.user.count({ where: { status: 'PENDING' } }),
  ]);
  return (
    `📊 <b>Kunlik statistika · ${today}</b>\n\n` +
    `👤 Yangi foydalanuvchilar: ${newUsers}\n` +
    `🟢 Faol: ${active}\n` +
    `✍️ Javoblar: ${answers} (to'g'ri: ${answers ? Math.round((correct / answers) * 100) : 0}%)\n` +
    `📅 Kunlik testni bajarganlar: ${dailyDone}\n` +
    `📝 Yakunlangan testlar: ${tests}\n` +
    `⚠️ Ochiq shikoyatlar: ${openReports}\n` +
    `⏳ Guruhga qo'shilmaganlar: ${pending}`
  );
}

/** Webhook (Railway PUBLIC_URL bo'lsa) yoki polling. Menyu tugmasi Mini App'ni ochadi. */
export async function attachWebhook(bot: Telegraf, app: Express): Promise<boolean> {
  const useWebhook = env.BOT_MODE === 'webhook' || (env.BOT_MODE !== 'polling' && !!env.publicUrl);
  if (!useWebhook || !env.publicUrl) return false;
  app.use(
    await bot.createWebhook({
      domain: env.publicUrl,
      path: WEBHOOK_PATH,
      ...(env.WEBHOOK_SECRET ? { secret_token: env.WEBHOOK_SECRET } : {}),
      drop_pending_updates: false,
    }),
  );
  return true;
}

export async function finishBotSetup(bot: Telegraf, webhook: boolean): Promise<void> {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Boshlash' },
      { command: 'app', description: 'Ilovani ochish' },
      { command: 'help', description: 'Yordam' },
    ]);
    if (/^https:\/\//.test(env.MINI_APP_URL)) {
      await bot.telegram.setChatMenuButton({ menuButton: { type: 'web_app', text: 'SAT', web_app: { url: env.MINI_APP_URL } } });
    }
  } catch (e) {
    console.error('Bot sozlamalari xatosi:', (e as Error).message);
  }
  if (!webhook) {
    await bot.telegram.deleteWebhook().catch(() => undefined);
    void bot.launch({ dropPendingUpdates: true }).catch((e) => console.error('Bot polling xatosi:', e));
    console.log('🤖 Bot polling rejimida ishga tushdi');
  } else {
    console.log(`🤖 Bot webhook rejimida: ${env.publicUrl}${WEBHOOK_PATH}`);
  }
}
