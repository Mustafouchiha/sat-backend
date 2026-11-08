import 'dotenv/config';
import { z } from 'zod';

const opt = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL kerak (Neon pooled connection string)'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET kamida 16 belgidan iborat bo\'lishi kerak'),
  BOT_TOKEN: opt,
  BOT_USERNAME: opt,
  BOT_MODE: z.enum(['webhook', 'polling', 'off']).optional(),
  MINI_APP_URL: z.string().default('http://localhost:5173'),
  PUBLIC_URL: opt,
  RAILWAY_PUBLIC_DOMAIN: opt,
  WEBHOOK_SECRET: opt,
  CORS_ORIGINS: opt,
  SUPER_ADMIN_TG_IDS: opt,
  ANTHROPIC_API_KEY: opt,
  ANTHROPIC_MODEL: opt,
  ALLOW_DEV_LOGIN: opt,
  CRON_ENABLED: opt,
  DESMOS_API_KEY: opt,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ .env xatolari:');
  for (const i of parsed.error.issues) console.error(`  - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}

const e = parsed.data;

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  publicUrl: e.PUBLIC_URL ?? (e.RAILWAY_PUBLIC_DOMAIN ? `https://${e.RAILWAY_PUBLIC_DOMAIN}` : undefined),
  superAdminIds: new Set((e.SUPER_ADMIN_TG_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
  corsOrigins: [
    ...new Set(
      [e.MINI_APP_URL, ...(e.CORS_ORIGINS ?? '').split(',')]
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    ),
  ],
  devLogin: e.ALLOW_DEV_LOGIN === 'true' && e.NODE_ENV !== 'production',
  cronEnabled: e.CRON_ENABLED !== 'false',
  anthropicModel: e.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
};
