import type { Prisma, Test, TestModule, TestModuleItem } from '@prisma/client';
import { routeSecondModule } from '@sat/shared';
import { prisma } from '../db';
import type { AuthUser } from './auth';
import { getCatalog, pickFromPool } from './catalog';
import { addXp, applyEffects, checkAchievements } from './effects';
import { HttpError, notFound } from './http';
import { notifyUser } from './notify';
import { computeScaled } from './scoring';
import { getSettings } from './settings';
import { getVariants, grade, pickWorkingSeed, publicQuestion } from './variants';

/** Taymer serverda: muddatdan keyin shuncha vaqt ichida kelgan javoblar qabul qilinadi (tarmoq kechikishi). */
export const GRACE_MS = 15_000;

type TestFull = Test & { modules: Array<TestModule & { items: TestModuleItem[] }> };

export async function loadTest(testId: string): Promise<TestFull> {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: { modules: { include: { items: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } },
  });
  if (!test) throw notFound('Test');
  return test;
}

function slotOrders(test: TestFull): number[] {
  return [...new Set(test.modules.map((m) => m.order))].sort((a, b) => a - b);
}

function firstModuleOf(test: TestFull, order: number) {
  const cands = test.modules.filter((m) => m.order === order);
  return cands.find((m) => m.variant === 'STANDARD') ?? cands[0];
}

async function resolveItems(
  attemptId: string,
  attemptModuleId: string,
  module: TestModule & { items: TestModuleItem[] },
  startOrder: number,
  used: Set<string>,
): Promise<Prisma.AttemptAnswerCreateManyInput[]> {
  const catalog = await getCatalog();
  const rows: Prisma.AttemptAnswerCreateManyInput[] = [];
  for (const item of module.items) {
    let ref: { id: string; version: number } | undefined;
    if (item.templateId) {
      ref = catalog.find((c) => c.id === item.templateId);
      if (!ref) {
        const t = await prisma.questionTemplate.findUnique({ where: { id: item.templateId }, select: { id: true, version: true } });
        ref = t ?? undefined;
      }
    } else {
      ref = pickFromPool(
        catalog,
        { section: module.section, domainId: item.poolDomainId, skillId: item.poolSkillId, difficulty: item.poolDifficulty },
        used,
      );
    }
    if (!ref) continue;
    const seed = await pickWorkingSeed(ref.id, ref.version);
    if (seed === null) continue;
    used.add(ref.id);
    rows.push({
      attemptId,
      attemptModuleId,
      order: startOrder + rows.length,
      templateId: ref.id,
      templateVersion: ref.version,
      seed,
    });
  }
  return rows;
}

async function createAttemptModule(
  attemptId: string,
  tm: TestModule & { items: TestModuleItem[] },
  start: boolean,
): Promise<void> {
  const existing = await prisma.attemptAnswer.findMany({ where: { attemptId }, select: { templateId: true, order: true } });
  const used = new Set(existing.map((r) => r.templateId));
  const startOrder = existing.length ? Math.max(...existing.map((r) => r.order)) + 1 : 0;
  const now = new Date();
  const am = await prisma.attemptModule.create({
    data: {
      attemptId,
      testModuleId: tm.id,
      order: tm.order,
      section: tm.section,
      stage: tm.stage,
      variant: tm.variant,
      durationSec: tm.durationSec,
      startedAt: start ? now : null,
      deadlineAt: start ? new Date(now.getTime() + tm.durationSec * 1000) : null,
    },
  });
  const rows = await resolveItems(attemptId, am.id, tm, startOrder, used);
  if (!rows.length) throw new HttpError(409, "Modul uchun savol topilmadi — savollar bankini to'ldiring");
  await prisma.attemptAnswer.createMany({ data: rows });
  await prisma.attemptModule.update({ where: { id: am.id }, data: { total: rows.length } });
}

/** Test boshlash (yoki tugallanmagan urinishni davom ettirish). */
export async function startTestAttempt(user: AuthUser, testId: string, assignmentId?: string | null) {
  const test = await loadTest(testId);
  if (!test.modules.length) throw new HttpError(400, "Testda modul yo'q");
  const existing = await prisma.attempt.findFirst({
    where: {
      userId: user.id,
      testId,
      assignmentId: assignmentId ?? null,
      mode: 'TEST',
      status: { in: ['IN_PROGRESS', 'BREAK'] },
    },
  });
  if (existing) return existing;

  const orders = slotOrders(test);
  const totalItems = orders.reduce((s, o) => s + firstModuleOf(test, o).items.length, 0);
  const attempt = await prisma.attempt.create({
    data: { userId: user.id, mode: 'TEST', testId, assignmentId: assignmentId ?? null, title: test.title, totalItems },
  });
  try {
    await createAttemptModule(attempt.id, firstModuleOf(test, orders[0]), true);
  } catch (e) {
    await prisma.attempt.delete({ where: { id: attempt.id } }).catch(() => undefined);
    throw e;
  }
  return attempt;
}

async function loadOwnedAttempt(attemptId: string, user: AuthUser) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { modules: { orderBy: { order: 'asc' } }, test: { select: { title: true, type: true, breakSeconds: true } } },
  });
  if (!attempt || attempt.userId !== user.id) throw notFound('Urinish');
  if (attempt.mode !== 'TEST') throw new HttpError(400, 'Bu test urinishi emas');
  return attempt;
}

export async function getTestState(attemptId: string, user: AuthUser, depth = 0): Promise<Record<string, unknown>> {
  const attempt = await loadOwnedAttempt(attemptId, user);
  const now = new Date();
  if (attempt.status === 'FINISHED') return { status: 'FINISHED', attemptId };
  const current = attempt.modules.find((m) => !m.submittedAt);
  if (!current) {
    await finalizeTest(attempt.id);
    return { status: 'FINISHED', attemptId };
  }
  const totalModules = attempt.testId
    ? new Set((await prisma.testModule.findMany({ where: { testId: attempt.testId }, select: { order: true } })).map((m) => m.order)).size
    : attempt.modules.length;
  const index = attempt.modules.filter((m) => m.submittedAt).length;

  if (!current.startedAt) {
    const prev = [...attempt.modules].reverse().find((m) => m.submittedAt);
    const breakSeconds = attempt.test?.breakSeconds ?? 600;
    return {
      status: 'BREAK',
      attemptId,
      title: attempt.title,
      next: { order: current.order, section: current.section, index, totalModules, durationSec: current.durationSec },
      breakSeconds,
      breakEndsAt: prev?.submittedAt ? new Date(prev.submittedAt.getTime() + breakSeconds * 1000) : null,
      serverNow: now.toISOString(),
    };
  }

  if (current.deadlineAt && now.getTime() > current.deadlineAt.getTime() + GRACE_MS && depth < 5) {
    await submitTestModule(attempt.id, current.order, user, true);
    return getTestState(attemptId, user, depth + 1);
  }

  const rows = await prisma.attemptAnswer.findMany({ where: { attemptModuleId: current.id }, orderBy: { order: 'asc' } });
  const variants = await getVariants(rows);
  return {
    status: 'IN_PROGRESS',
    attemptId,
    title: attempt.title,
    testType: attempt.test?.type,
    module: {
      order: current.order,
      section: current.section,
      stage: current.stage,
      index,
      totalModules,
      durationSec: current.durationSec,
      startedAt: current.startedAt,
      deadlineAt: current.deadlineAt,
    },
    serverNow: now.toISOString(),
    items: rows.map((r, i) => ({
      order: r.order,
      number: i + 1,
      question: publicQuestion(variants[i], r.templateId),
      answer: r.answer,
      marked: r.marked,
      timeSpentMs: r.timeSpentMs,
    })),
  };
}

export interface SaveAnswerInput {
  order: number;
  answer?: string | null;
  marked?: boolean;
  timeSpentMs?: number;
}

export async function saveTestAnswers(attemptId: string, user: AuthUser, moduleOrder: number, answers: SaveAnswerInput[]) {
  const am = await prisma.attemptModule.findUnique({
    where: { attemptId_order: { attemptId, order: moduleOrder } },
    include: { attempt: { select: { userId: true } } },
  });
  if (!am || am.attempt.userId !== user.id) throw notFound('Modul');
  if (am.submittedAt) throw new HttpError(409, 'Modul allaqachon yopilgan', 'MODULE_CLOSED');
  if (!am.startedAt) throw new HttpError(409, 'Modul hali boshlanmagan', 'MODULE_NOT_STARTED');
  const now = new Date();
  if (am.deadlineAt && now.getTime() > am.deadlineAt.getTime() + GRACE_MS) {
    await submitTestModule(attemptId, moduleOrder, user, true);
    throw new HttpError(409, 'Modul vaqti tugadi', 'TIME_UP');
  }
  const ops = answers.map((a) => {
    const data: Prisma.AttemptAnswerUpdateManyMutationInput = {};
    if (a.answer !== undefined) {
      const v = a.answer === null ? null : String(a.answer).trim().slice(0, 12) || null;
      data.answer = v;
      data.answeredAt = v ? now : null;
    }
    if (a.marked !== undefined) data.marked = a.marked;
    if (a.timeSpentMs !== undefined) data.timeSpentMs = Math.max(0, Math.min(Math.round(a.timeSpentMs), 6 * 3600_000));
    return prisma.attemptAnswer.updateMany({ where: { attemptId, attemptModuleId: am.id, order: a.order }, data });
  });
  await prisma.$transaction(ops);
  return { saved: answers.length, serverNow: now.toISOString() };
}

export async function submitTestModule(attemptId: string, moduleOrder: number, user: AuthUser, auto = false) {
  const am = await prisma.attemptModule.findUnique({
    where: { attemptId_order: { attemptId, order: moduleOrder } },
    include: { attempt: { select: { userId: true, testId: true } } },
  });
  if (!am || am.attempt.userId !== user.id) throw notFound('Modul');
  const claim = await prisma.attemptModule.updateMany({
    where: { id: am.id, submittedAt: null, startedAt: { not: null } },
    data: { submittedAt: new Date() },
  });
  if (claim.count === 0) return { alreadySubmitted: true };

  const rows = await prisma.attemptAnswer.findMany({ where: { attemptModuleId: am.id }, orderBy: { order: 'asc' } });
  const variants = await getVariants(rows);
  const graded = rows.map((r, i) => ({ row: r, correct: grade(variants[i], r.answer), answered: !!r.answer }));
  const correctCount = graded.filter((g) => g.correct).length;
  const answered = graded.filter((g) => g.answered);
  const eff = await applyEffects(
    user.id,
    answered.map((g) => ({ templateId: g.row.templateId, correct: g.correct, timeMs: g.row.timeSpentMs })),
  );
  const deltaById = new Map(answered.map((g, i) => [g.row.id, eff.perItem[i] ?? 0]));
  await prisma.$transaction([
    ...graded.map((g) =>
      prisma.attemptAnswer.update({
        where: { id: g.row.id },
        data: { isCorrect: g.correct, ratingDelta: g.answered ? deltaById.get(g.row.id) : null },
      }),
    ),
    prisma.attemptModule.update({ where: { id: am.id }, data: { correctCount, total: rows.length } }),
    prisma.attempt.update({
      where: { id: attemptId },
      data: {
        correctCount: { increment: correctCount },
        answeredCount: { increment: answered.length },
        mistakes: { increment: rows.length - correctCount },
        ratingDelta: { increment: eff.overallDelta },
      },
    }),
  ]);

  // keyingi modul
  if (!am.attempt.testId) {
    await finalizeTest(attemptId);
    return { finished: true, auto, achievements: eff.achievements };
  }
  const test = await loadTest(am.attempt.testId);
  const orders = slotOrders(test);
  const nextOrder = orders[orders.indexOf(am.order) + 1];
  if (nextOrder === undefined) {
    await finalizeTest(attemptId);
    return { finished: true, auto, achievements: eff.achievements };
  }
  const cands = test.modules.filter((m) => m.order === nextOrder);
  let next = cands[0];
  if (cands.length > 1) {
    const stage1 = await prisma.attemptModule.findFirst({ where: { attemptId, section: cands[0].section, stage: 1 } });
    const route = routeSecondModule(stage1?.correctCount ?? 0, stage1?.total ?? 0, test.adaptiveThreshold);
    next = cands.find((c) => c.variant === route) ?? cands[0];
  }
  const sectionChanged = next.section !== am.section;
  await createAttemptModule(attemptId, next, !sectionChanged);
  if (sectionChanged) await prisma.attempt.update({ where: { id: attemptId }, data: { status: 'BREAK' } });
  return { finished: false, auto, break: sectionChanged, achievements: eff.achievements };
}

/** Tanaffusdan keyin keyingi modulni boshlash (taymer shu paytdan boshlanadi). */
export async function startNextModule(attemptId: string, user: AuthUser) {
  const am = await prisma.attemptModule.findFirst({
    where: { attemptId, startedAt: null, submittedAt: null },
    include: { attempt: { select: { userId: true } } },
  });
  if (!am || am.attempt.userId !== user.id) throw notFound('Keyingi modul');
  const now = new Date();
  await prisma.$transaction([
    prisma.attemptModule.update({
      where: { id: am.id },
      data: { startedAt: now, deadlineAt: new Date(now.getTime() + (am.durationSec ?? 1800) * 1000) },
    }),
    prisma.attempt.update({ where: { id: attemptId }, data: { status: 'IN_PROGRESS' } }),
  ]);
  return { ok: true };
}

/** Test yakuni: bo'lim ballari (200–800), jami (400–1600), XP, bildirishnoma. */
export async function finalizeTest(attemptId: string): Promise<void> {
  const claim = await prisma.attempt.updateMany({
    where: { id: attemptId, status: { not: 'FINISHED' } },
    data: { status: 'FINISHED', finishedAt: new Date() },
  });
  if (!claim.count) return;
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      modules: true,
      test: { select: { type: true, title: true } },
      assignment: { select: { resultVisibility: true, dueAt: true } },
      user: { select: { id: true, tgId: true, botBlocked: true } },
    },
  });
  const sec: Record<'RW' | 'MATH', { raw: number; max: number; variant: 'STANDARD' | 'EASY' | 'HARD'; present: boolean }> = {
    RW: { raw: 0, max: 0, variant: 'STANDARD', present: false },
    MATH: { raw: 0, max: 0, variant: 'STANDARD', present: false },
  };
  for (const m of attempt.modules) {
    if (!m.section) continue;
    const s = sec[m.section];
    s.present = true;
    s.raw += m.correctCount;
    s.max += m.total;
    if (m.stage === 2 && m.variant !== 'STANDARD') s.variant = m.variant;
  }
  const scaledTypes = ['MOCK', 'SECTION'];
  const doScale = !!attempt.test && scaledTypes.includes(attempt.test.type);
  const rwScaled = doScale && sec.RW.present ? await computeScaled('RW', sec.RW.variant, sec.RW.raw, sec.RW.max) : null;
  const mathScaled = doScale && sec.MATH.present ? await computeScaled('MATH', sec.MATH.variant, sec.MATH.raw, sec.MATH.max) : null;
  const totalScaled = rwScaled !== null && mathScaled !== null ? rwScaled + mathScaled : null;
  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      rwRaw: sec.RW.present ? sec.RW.raw : null,
      mathRaw: sec.MATH.present ? sec.MATH.raw : null,
      rwScaled,
      mathScaled,
      totalScaled,
    },
  });
  const s = await getSettings();
  await addXp(attempt.userId, s.xp.testFinish);
  await checkAchievements(attempt.userId);

  const hidden = attempt.assignment?.resultVisibility === 'AFTER_DUE' && attempt.assignment.dueAt && attempt.assignment.dueAt > new Date();
  if (!hidden) {
    const scoreText = totalScaled !== null
      ? `Jami: <b>${totalScaled}</b> (R&W ${rwScaled}, Math ${mathScaled})`
      : rwScaled !== null || mathScaled !== null
        ? `Ball: <b>${rwScaled ?? mathScaled}</b>`
        : `To'g'ri javoblar: <b>${attempt.correctCount}/${attempt.totalItems}</b>`;
    void notifyUser(attempt.user, `✅ <b>${attempt.title ?? 'Test'}</b> natijasi tayyor!\n${scoreText}`, {
      text: "📊 Natijani ko'rish",
      path: `/attempt/${attemptId}/result`,
    }, 'RESULT_READY');
  }
}
