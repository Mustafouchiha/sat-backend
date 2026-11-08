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
  const bot = createBot();
  setBot(bot);
  // Webhook middleware JSON parserdan oldin ulanishi kerak
  const webhook = bot ? await attachWebhook(bot, app) : false;
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
  else console.log('🤖 BOT_TOKEN yo\'q — bot o\'chirilgan');
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
