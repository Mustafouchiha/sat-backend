import http from 'node:http';
import express from 'express';
import { buildApp } from './app';
import { attachWebhook, createBot, finishBotSetup } from './bot';
import { startCron } from './cron';
import { prisma } from './db';
import { env } from './env';
import { syncAchievements } from './lib/effects';
import { setBot } from './lib/notify';
import { initRealtime } from './lib/realtime';

// BigInt (Telegram ID) JSON'ga satr sifatida chiqadi
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

async function main() {
  const app = express();
  let bot = createBot();
  let webhook = false;
  if (bot) {
    try {
      // Webhook middleware JSON parserdan oldin ulanishi kerak
      webhook = await attachWebhook(bot, app);
    } catch (e) {
      // Bot muammosi (noto'g'ri token, Telegram javob bermasligi) butun API'ni yiqitmasligi kerak.
      // Xato obyektini to'liq chiqarmaymiz: TelegramError ichida webhook secret_token bor.
      const unauthorized = (e as { response?: { error_code?: number } }).response?.error_code === 401;
      console.error(
        `❌ Telegram bot ishga tushmadi: ${(e as Error).message}` +
          (unauthorized ? " — BOT_TOKEN noto'g'ri, BotFather'dagi token bilan solishtiring" : '') +
          '. API botsiz ishlayapti.',
      );
      bot = null;
    }
  } else {
    console.log("🤖 BOT_TOKEN yo'q — bot o'chirilgan");
  }
  setBot(bot);
  buildApp(app);

  const server = http.createServer(app);
  initRealtime(server);

  try {
    await syncAchievements();
  } catch (e) {
    console.error("Yutuqlarni sinxronlab bo'lmadi (migratsiya qilinganmi?):", (e as Error).message);
  }

  server.listen(env.PORT, () => {
    console.log(`🚀 API http://localhost:${env.PORT} (${env.NODE_ENV})`);
    console.log(`   CORS: ${env.corsOrigins.join(', ')}`);
    if (env.devLogin) console.log('   ⚠️  DEV login yoqilgan (faqat lokal ishlab chiqish uchun)');
  });

  if (bot) await finishBotSetup(bot, webhook);
  if (env.cronEnabled) startCron();

  const shutdown = async (signal: string) => {
    console.log(`${signal} — to'xtatilmoqda...`);
    if (bot && !webhook) bot.stop(signal);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('Server ishga tushmadi:', e);
  process.exit(1);
});
