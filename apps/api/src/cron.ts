import cron from 'node-cron';
import { displayChange, displayRating, tashkentDate } from '@sat/shared';
import { dailyStatsText } from './bot';
import { prisma } from './db';
import type { AuthUser } from './lib/auth';
import { settleDuelIfExpired } from './lib/duels';
import { broadcast, escapeHtml, notifyUser } from './lib/notify';
import { finishSession, SESSION_MODES } from './lib/sessions';
import { getSettings } from './lib/settings';
import { submitTestModule } from './lib/testEngine';
import { displayName } from './lib/users';
import { ensureDailyTest } from './routes/daily';

const TZ = 'Asia/Tashkent';

function job(name: string, fn: () => Promise<unknown>) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (e) {
      console.error(`Cron "${name}" xatosi:`, e);
    } finally {
      running = false;
    }
  };
}

function tashkentHour(): number {
  return new Date(Date.now() + 5 * 3600_000).getUTCHours();
}

/** Kechqurun kunlik test hali ishlanmagan bo'lsa eslatma. */
async function remindDaily() {
  const s = await getSettings();
  if (tashkentHour() !== s.daily.reminderHour) return;
  const today = tashkentDate();
  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      roles: { has: 'STUDENT' },
      notifyDaily: true,
      botBlocked: false,
      attempts: { none: { mode: 'DAILY', dailyDate: today, status: 'FINISHED' } },
    },
    include: { streak: true },
  });
  for (const u of users) {
    const streak = u.streak?.current ?? 0;
    const text = streak > 0
      ? `🔥 Seriyangiz <b>${streak} kun</b> — uzilib qolmasin! Bugungi kunlik test sizni kutmoqda.`
      : '📅 Bugungi kunlik test hali ishlanmagan. 10–15 daqiqa — va reytingingiz o\'sadi!';
    await notifyUser(u, text, { text: '▶️ Kunlik test', path: '/daily' }, 'DAILY_REMINDER');
    await new Promise((r) => setTimeout(r, 40));
  }
}

/** Topshiriq muddatiga 24 soat va 2 soat qolganda eslatma. */
async function assignmentReminders() {
  const now = Date.now();
  for (const [hours, flag] of [
    [24, 'reminded24'],
    [2, 'reminded2'],
  ] as const) {
    const list = await prisma.assignment.findMany({
      where: { [flag]: false, dueAt: { gt: new Date(now), lte: new Date(now + hours * 3600_000) } },
      include: { group: { include: { members: { where: { role: 'STUDENT' }, include: { user: true } } } }, attempts: { where: { status: 'FINISHED' }, select: { userId: true } } },
    });
    for (const a of list) {
      const done = new Set(a.attempts.map((x) => x.userId));
      const pending = a.group.members.filter((m) => !done.has(m.userId)).map((m) => m.user);
      await broadcast(pending, `⏰ <b>${escapeHtml(a.title)}</b> — muddatga ${hours} soat qoldi!`, { text: '▶️ Boshlash', path: '/tests' }, 'ASSIGNMENT_REMINDER');
      await prisma.assignment.update({ where: { id: a.id }, data: { [flag]: true } });
    }
  }
}

/** Ota-onalarga haftalik hisobot (yakshanba). */
async function parentWeekly() {
  const links = await prisma.parentLink.findMany({ where: { parentId: { not: null } }, include: { parent: true, student: true } });
  const since = new Date(Date.now() - 7 * 86400_000);
  for (const l of links) {
    if (!l.parent) continue;
    const sid = l.studentId;
    const [answered, correct, delta, rating, dailyDone, lastTest] = await Promise.all([
      prisma.attemptAnswer.count({ where: { attempt: { userId: sid }, answeredAt: { gte: since } } }),
      prisma.attemptAnswer.count({ where: { attempt: { userId: sid }, answeredAt: { gte: since }, isCorrect: true } }),
      prisma.ratingHistory.aggregate({ where: { userId: sid, type: 'OVERALL', createdAt: { gte: since } }, _sum: { delta: true } }),
      prisma.rating.findUnique({ where: { userId_type: { userId: sid, type: 'OVERALL' } } }),
      prisma.attempt.count({ where: { userId: sid, mode: 'DAILY', status: 'FINISHED', startedAt: { gte: since } } }),
      prisma.attempt.findFirst({ where: { userId: sid, mode: 'TEST', status: 'FINISHED', totalScaled: { not: null } }, orderBy: { finishedAt: 'desc' } }),
    ]);
    const d = displayChange('OVERALL', delta._sum.delta ?? 0);
    const text =
      `👨‍👩‍👧 <b>Haftalik hisobot: ${escapeHtml(displayName(l.student))}</b>\n\n` +
      `✍️ Yechilgan savollar: ${answered} (to'g'ri: ${answered ? Math.round((correct / answered) * 100) : 0}%)\n` +
      `📅 Kunlik testlar: ${dailyDone}/7\n` +
      `📈 Reyting: ${rating ? displayRating('OVERALL', rating.rating) : '—'} (${d >= 0 ? '+' : ''}${d} hafta davomida)\n` +
      (lastTest ? `🎓 Oxirgi mock test: ${lastTest.totalScaled}\n` : '');
    await notifyUser(l.parent, text, undefined, 'PARENT_WEEKLY');
    await new Promise((r) => setTimeout(r, 40));
  }
}

async function adminDailyStats() {
  const admins = await prisma.user.findMany({ where: { roles: { hasSome: ['SUPER_ADMIN', 'OPERATOR'] }, botBlocked: false } });
  if (!admins.length) return;
  const text = await dailyStatsText();
  for (const a of admins) await notifyUser(a, text, undefined, 'ADMIN_STATS');
}

/** Muddati o'tgan sessiyalar, modullar va duellarni yopish (o'quvchi ilovani yopib qo'ygan bo'lsa ham natija chiqadi). */
async function cleanup() {
  const cutoff = new Date(Date.now() - 60_000);
  const sessions = await prisma.attempt.findMany({
    where: { status: 'IN_PROGRESS', mode: { in: SESSION_MODES }, deadlineAt: { lt: cutoff } },
    select: { id: true },
    take: 200,
  });
  for (const s of sessions) await finishSession(s.id);

  const modules = await prisma.attemptModule.findMany({
    where: { submittedAt: null, startedAt: { not: null }, deadlineAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    include: { attempt: { select: { userId: true } } },
    take: 100,
  });
  for (const m of modules) {
    await submitTestModule(m.attemptId, m.order, { id: m.attempt.userId } as AuthUser, true).catch((e) =>
      console.error('Modulni avto-yopishda xato:', e),
    );
  }

  await prisma.duel.updateMany({
    where: { status: 'WAITING', createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    data: { status: 'CANCELLED' },
  });
  const active = await prisma.duel.findMany({ where: { status: 'ACTIVE', deadlineAt: { lt: new Date() } }, select: { id: true } });
  for (const d of active) await settleDuelIfExpired(d.id);
}

export function startCron(): void {
  cron.schedule('1 0 * * *', job('daily-test', () => ensureDailyTest(tashkentDate())), { timezone: TZ });
  cron.schedule('0 * * * *', job('daily-reminder', remindDaily), { timezone: TZ });
  cron.schedule('*/15 * * * *', job('assignment-reminders', assignmentReminders), { timezone: TZ });
  cron.schedule('0 18 * * 0', job('parent-weekly', parentWeekly), { timezone: TZ });
  cron.schedule('0 21 * * *', job('admin-stats', adminDailyStats), { timezone: TZ });
  cron.schedule('*/5 * * * *', job('cleanup', cleanup), { timezone: TZ });
  console.log('⏰ Cron vazifalari ishga tushdi (Asia/Tashkent)');
}
