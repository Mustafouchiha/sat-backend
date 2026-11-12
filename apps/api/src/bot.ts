import { tashkentDate } from '@sat/shared';
import type { Express } from 'express';
import { Telegraf, type Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { prisma } from './db';
import { env } from './env';
import { clearChat, sendChat, splitMessage, type ChatImage } from './lib/aiTutor';
import { hasRole } from './lib/auth';
import { HttpError } from './lib/http';
import { appUrl, escapeHtml, setBotTitle, setBotUsername } from './lib/notify';
import { displayName } from './lib/users';
import { approveQrLogin, findPendingQr, linkPhone, maskPhone, rejectQrLogin, sendPendingPhoneCode } from './lib/webLogin';
import { upsertTgUser } from './routes/auth';

export const WEBHOOK_PATH = '/telegram/webhook';

type TgFrom = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
const tgUserOf = (from: TgFrom) => ({
  id: from.id,
  first_name: from.first_name,
  last_name: from.last_name,
  username: from.username,
  language_code: from.language_code,
});

/** Kompyuterda telefon raqam bilan kirish: raqamni Telegram'ning o'zi tasdiqlab yuboradi (request_contact). */
const askContact = (ctx: Context) =>
  ctx.reply(
    "📱 Kompyuterda telefon raqamingiz bilan kirish uchun raqamingizni botga ulang.\n\n" +
      "Pastdagi «📱 Raqamni ulashish» tugmasini bosing. Raqam faqat kirish kodini yuborish uchun ishlatiladi.",
    { reply_markup: { keyboard: [[{ text: '📱 Raqamni ulashish', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } },
  );

const tashkentTime = () => new Date().toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });

export function createBot(): Telegraf | null {
  if (!env.BOT_TOKEN || env.BOT_MODE === 'off') return null;
  const bot = new Telegraf(env.BOT_TOKEN);

  const openButton = (params: Record<string, string> = {}, text = "📚 SAT Mini App'ni ochish") => ({
    reply_markup: { inline_keyboard: [[{ text, web_app: { url: appUrl(params) } }]] },
  });

  bot.start(async (ctx) => {
    const from = ctx.from;
    const user = await upsertTgUser(tgUserOf(from));
    const payload = (ctx.payload ?? '').trim();

    // Kompyuterdagi QR kod skanerlandi: kirishni tasdiqlash so'raladi
    if (payload.startsWith('login_')) {
      const wl = await findPendingQr(payload.slice('login_'.length));
      if (!wl) return ctx.reply('⌛ Bu QR kod eskirgan yoki ishlatilgan. Kompyuterdagi sahifada yangi QR kodni skanerlang.');
      if (user.status === 'BLOCKED') return ctx.reply('❌ Hisobingiz bloklangan.');
      return ctx.reply(
        `💻 <b>Kompyuterda kirish</b>\n\nQurilma: ${escapeHtml(wl.device)}\nVaqt: ${tashkentTime()}\n\n` +
          `Hozir kompyuterda SAT Prep'ga o'zingiz kirayotgan bo'lsangiz, «✅ Tasdiqlash» ni bosing.\n\n` +
          `⚠️ QR kodni kimdir sizga yuborgan bo'lsa yoki uni o'zingiz skanerlamagan bo'lsangiz, tasdiqlamang — u odam akkauntingizga kiradi.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Tasdiqlash', callback_data: `wl:ok:${wl.id}` },
                { text: '❌ Rad etish', callback_data: `wl:no:${wl.id}` },
              ],
            ],
          },
        },
      );
    }
    if (payload === 'phone') return askContact(ctx);

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
        `• Har kuni kunlik test va streak 🔥\n• Reyting tizimi va duellar ⚔️\n• Har safar yangi savollar 🎲\n` +
        `• 🤖 AI ustoz: SAT bo'yicha savolingizni shu chatga yozing yoki savol rasmini yuboring\n\n` +
        `Boshlash uchun tugmani bosing. O'qituvchingizdan guruh taklif kodini oling.`,
      { parse_mode: 'HTML', ...openButton() },
    );
  });

  bot.command('app', (ctx) => ctx.reply('Ilovani ochish:', openButton()));
  bot.command('phone', (ctx) => askContact(ctx));

  bot.command('help', (ctx) =>
    ctx.reply(
      "/app — ilovani ochish\n/ai — AI ustoz haqida\n/new — AI ustoz bilan yangi suhbat\n/phone — kompyuterda kirish uchun telefon raqamni ulash\n/stats — kunlik statistika (admin)\n\n" +
        "🤖 SAT bo'yicha savolingizni shu chatga yozing yoki savol rasmini yuboring — AI ustoz tushuntirib beradi.\n\n" +
        `Kompyuterda: ${env.MINI_APP_URL} ni oching va QR kodni telefoningiz bilan skanerlang.\n\n` +
        "Savollar bo'yicha shikoyatni ilova ichidagi \"Xato bor\" tugmasi orqali yuboring.",
      { link_preview_options: { is_disabled: true } },
    ),
  );

  // ───────────── AI ustoz (ilovadagi chat bilan bitta suhbat) ─────────────
  bot.command('ai', (ctx) =>
    ctx.reply(
      "🤖 AI ustoz — SAT Math va English bo'yicha yordamchi.\n\n" +
        "• Savolingizni shu chatga yozing: «Kvadrat tenglamani qanday yechaman?»\n" +
        "• Savolning rasmini yuboring — yechimini tushuntirib beradi\n" +
        "• /new — yangi suhbat boshlash\n\n" +
        "Ilovada ham xuddi shu suhbat bor: «🤖 AI ustoz» bo'limi. Test vaqtida AI ishlamaydi.",
      openButton({ path: '/ai' }, '🤖 Ilovada ochish'),
    ),
  );
  bot.command('new', async (ctx) => {
    const user = await upsertTgUser(tgUserOf(ctx.from));
    await clearChat(user.id);
    return ctx.reply("🆕 Yangi suhbat boshlandi. Savolingizni yozing yoki savol rasmini yuboring.");
  });

  // QR orqali kirishni tasdiqlash / rad etish
  bot.action(/^wl:(ok|no):([A-Za-z0-9_-]{16,40})$/, async (ctx) => {
    const [, act, id] = ctx.match;
    if (act === 'no') {
      await rejectQrLogin(id);
      await ctx.answerCbQuery('Rad etildi');
      return ctx.editMessageText("❌ Kirish rad etildi — kompyuterdagi so'rov bekor qilindi.");
    }
    const user = await upsertTgUser(tgUserOf(ctx.from));
    const result = await approveQrLogin(id, user);
    if (result === 'ok') {
      await ctx.answerCbQuery('✅ Tasdiqlandi');
      return ctx.editMessageText('✅ Kirish tasdiqlandi — kompyuterda davom eting.');
    }
    const text = result === 'blocked' ? '❌ Hisobingiz bloklangan.' : "⌛ So'rov eskirgan. Kompyuterdagi sahifada yangi QR kodni skanerlang.";
    await ctx.answerCbQuery(text, { show_alert: true });
    return ctx.editMessageText(text);
  });

  // «📱 Raqamni ulashish»: faqat o'z raqami qabul qilinadi (contact.user_id = yuboruvchi)
  bot.on(message('contact'), async (ctx) => {
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from.id) {
      return ctx.reply("❌ Bu boshqa odamning raqami. Pastdagi «📱 Raqamni ulashish» tugmasi orqali o'zingizning raqamingizni yuboring.");
    }
    const user = await upsertTgUser(tgUserOf(ctx.from));
    const linked = await linkPhone(user.id, contact.phone_number);
    await ctx.reply(
      `✅ Raqamingiz ulandi: ${maskPhone(linked.phone)}\nEndi kompyuterda shu raqam bilan kirishingiz mumkin — kirish kodi shu chatga keladi.`,
      { reply_markup: { remove_keyboard: true } },
    );
    await sendPendingPhoneCode(linked);
  });

  bot.command('stats', async (ctx) => {
    const user = await prisma.user.findUnique({ where: { tgId: BigInt(ctx.from.id) } });
    if (!user || !hasRole(user, 'OPERATOR')) return ctx.reply("Bu buyruq faqat adminlar uchun.");
    return ctx.reply(await dailyStatsText(), { parse_mode: 'HTML' });
  });

  /**
   * Shaxsiy chatdagi oddiy matn va rasm — AI ustozga. Javob fonda tayyorlanadi: webhook darhol javob qaytaradi,
   * aks holda Telegram uzoq kutib, xabarni qayta yuborishi mumkin.
   */
  const askTutor = (ctx: Context, text: string, getImage?: () => Promise<ChatImage | null>) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return;
    const from = ctx.from;
    void (async () => {
      void ctx.sendChatAction('typing').catch(() => undefined);
      const typing = setInterval(() => void ctx.sendChatAction('typing').catch(() => undefined), 4500);
      try {
        const user = await upsertTgUser(tgUserOf(from));
        const image = getImage ? await getImage() : null;
        const out = await sendChat(user, { text, image, channel: 'bot' });
        for (const part of splitMessage(out.messages[1].content)) {
          await ctx.reply(part, { link_preview_options: { is_disabled: true } });
        }
      } catch (e) {
        const known = e instanceof HttpError;
        if (!known) console.error('AI ustoz (bot) xatosi:', (e as Error).message);
        const text = !known
          ? "AI ustoz hozir javob bera olmadi, birozdan keyin qayta urinib ko'ring."
          : e.code === 'AI_DISABLED'
            ? 'AI ustoz tez orada ishga tushadi. Hozircha ilovada mashq qiling 👇'
            : e.message;
        const needApp = known && ['PENDING', 'AI_DISABLED'].includes(e.code ?? '');
        await ctx.reply(`⚠️ ${text}`, needApp ? openButton() : undefined).catch(() => undefined);
      } finally {
        clearInterval(typing);
      }
    })();
  };

  const downloadImage = async (ctx: Context, fileId: string, mime: ChatImage['mime']): Promise<ChatImage> => {
    const link = await ctx.telegram.getFileLink(fileId);
    const r = await fetch(link);
    if (!r.ok) throw new HttpError(502, "Rasmni yuklab bo'lmadi, qayta yuboring");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) throw new HttpError(413, 'Rasm juda katta (5 MB gacha)');
    return { mime, data: buf.toString('base64') };
  };

  bot.on(message('text'), (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return ctx.reply("Bunday buyruq yo'q. /help — buyruqlar ro'yxati.");
    askTutor(ctx, text);
  });

  bot.on(message('photo'), (ctx) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    askTutor(ctx, ctx.message.caption?.trim() ?? '', () => downloadImage(ctx, photo.file_id, 'image/jpeg'));
  });

  bot.on(message('document'), (ctx) => {
    const doc = ctx.message.document;
    const mime = doc.mime_type ?? '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      return ctx.reply("AI ustoz hozircha faqat matn va rasmlarni (JPG, PNG) tushunadi.");
    }
    askTutor(ctx, ctx.message.caption?.trim() ?? '', () => downloadImage(ctx, doc.file_id, mime as ChatImage['mime']));
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
    const meInfo = await bot.telegram.getMe();
    setBotUsername(meInfo.username);
    setBotTitle(meInfo.first_name);
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Boshlash' },
      { command: 'app', description: 'Ilovani ochish' },
      { command: 'ai', description: 'AI ustoz haqida' },
      { command: 'new', description: 'AI ustoz: yangi suhbat' },
      { command: 'phone', description: 'Kompyuterda kirish uchun raqamni ulash' },
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
