import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { prisma } from './db';
import { env } from './env';
import { errorHandler } from './lib/http';
import { adminRouter } from './routes/admin';
import { assignmentsRouter } from './routes/assignments';
import { attemptsRouter } from './routes/attempts';
import { authRouter } from './routes/auth';
import { dailyRouter } from './routes/daily';
import { duelsRouter } from './routes/duels';
import { groupsRouter } from './routes/groups';
import { leaderboardRouter } from './routes/leaderboard';
import { meRouter } from './routes/me';
import { miscRouter } from './routes/misc';
import { sessionsRouter } from './routes/sessions';
import { studentsRouter } from './routes/students';
import { templatesRouter } from './routes/templates';
import { testsRouter } from './routes/tests';
import { webLoginRouter } from './routes/webLogin';

function originAllowed(origin: string): boolean {
  const o = origin.replace(/\/+$/, '');
  if (env.corsOrigins.includes(o)) return true;
  if (!env.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  return false;
}

export function buildApp(app: Express): Express {
  app.set('trust proxy', 1); // Railway proksi ortida — rate limit uchun to'g'ri IP
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || originAllowed(origin)),
      credentials: true,
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: '4mb' }));

  app.get('/', (_req, res) => res.json({ name: 'SAT Mini App API', ok: true }));
  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      // commit — Railway avtomatik beradi; deploy haqiqatan yangilanganini tekshirish uchun
      res.json({ ok: true, db: true, time: new Date().toISOString(), commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null });
    } catch {
      res.status(503).json({ ok: false, db: false });
    }
  });

  // Bitta o'quv markaz Wi-Fi'sidan ko'p o'quvchi kirishi mumkin — limit keng
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 1500, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }), authRouter);
  app.use('/api/templates/ai-suggest', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api/web-login', webLoginRouter);

  app.use('/api/me', meRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/tests', testsRouter);
  app.use('/api/attempts', attemptsRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/daily', dailyRouter);
  app.use('/api/duels', duelsRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', miscRouter);

  app.use('/api', (_req, res) => res.status(404).json({ message: 'Topilmadi', code: 'NOT_FOUND' }));
  app.use(errorHandler);
  return app;
}
