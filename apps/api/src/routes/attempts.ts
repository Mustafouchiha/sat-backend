import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { canViewStudent } from '../lib/access';
import { hasRole, isStaff, me, requireActive, requireAuth } from '../lib/auth';
import { ah, forbidden, HttpError, notFound, parse } from '../lib/http';
import { getTestState, saveTestAnswers, startNextModule, startTestAttempt, submitTestModule } from '../lib/testEngine';
import { getVariants, reviewQuestion } from '../lib/variants';

export const attemptsRouter = Router();
attemptsRouter.use(requireAuth);

/** Test boshlash: ochiq test yoki guruhga berilgan topshiriq. */
attemptsRouter.post(
  '/',
  requireActive,
  ah(async (req, res) => {
    const body = parse(z.object({ testId: z.string().optional(), assignmentId: z.string().optional() }), req.body);
    const u = me(req);
    if (body.assignmentId) {
      const a = await prisma.assignment.findUnique({ where: { id: body.assignmentId } });
      if (!a) throw notFound('Topshiriq');
      const member = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: a.groupId, userId: u.id } } });
      if (!member && !isStaff(u)) throw forbidden("Bu topshiriq sizning guruhingiz uchun emas");
      const inProgress = await prisma.attempt.findFirst({
        where: { userId: u.id, assignmentId: a.id, status: { in: ['IN_PROGRESS', 'BREAK'] } },
      });
      if (inProgress) return res.json({ attemptId: inProgress.id });
      if (a.dueAt && a.dueAt < new Date()) throw new HttpError(409, "Topshiriq muddati o'tgan", 'OVERDUE');
      const used = await prisma.attempt.count({ where: { userId: u.id, assignmentId: a.id } });
      if (used >= a.maxAttempts) throw new HttpError(409, `Urinishlar soni tugagan (${a.maxAttempts})`, 'NO_ATTEMPTS');
      const attempt = await startTestAttempt(u, a.testId, a.id);
      return res.status(201).json({ attemptId: attempt.id });
    }
    if (!body.testId) throw new HttpError(400, 'testId yoki assignmentId kerak');
    const test = await prisma.test.findUnique({ where: { id: body.testId }, select: { isPublic: true } });
    if (!test) throw notFound('Test');
    if (!test.isPublic && !isStaff(u)) throw forbidden('Bu test ochiq emas');
    const attempt = await startTestAttempt(u, body.testId, null);
    res.status(201).json({ attemptId: attempt.id });
  }),
);

attemptsRouter.get(
  '/:id/state',
  ah(async (req, res) => {
    res.json(await getTestState(req.params.id, me(req)));
  }),
);

/** Javoblarni saqlash (offline navbatdan ham shu orqali keladi). */
attemptsRouter.put(
  '/:id/answers',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        moduleOrder: z.number().int().min(0),
        answers: z
          .array(
            z.object({
              order: z.number().int().min(0),
              answer: z.string().max(20).nullable().optional(),
              marked: z.boolean().optional(),
              timeSpentMs: z.number().min(0).optional(),
            }),
          )
          .max(80),
      }),
      req.body,
    );
    res.json(await saveTestAnswers(req.params.id, me(req), body.moduleOrder, body.answers));
  }),
);

attemptsRouter.post(
  '/:id/submit-module',
  ah(async (req, res) => {
    const body = parse(z.object({ moduleOrder: z.number().int().min(0) }), req.body);
    res.json(await submitTestModule(req.params.id, body.moduleOrder, me(req)));
  }),
);

attemptsRouter.post(
  '/:id/next',
  ah(async (req, res) => {
    res.json(await startNextModule(req.params.id, me(req)));
  }),
);

/** Boshqa ilovaga o'tish qayd qilinadi — o'qituvchi ko'radi. */
attemptsRouter.post(
  '/:id/event',
  ah(async (req, res) => {
    const body = parse(z.object({ type: z.enum(['blur']) }), req.body);
    const r = await prisma.attempt.updateMany({
      where: { id: req.params.id, userId: me(req).id, status: { not: 'FINISHED' } },
      data: body.type === 'blur' ? { blurCount: { increment: 1 } } : {},
    });
    res.json({ ok: r.count > 0 });
  }),
);

/** Natija: bo'lim ballari, domenlar kesimi, har bir savol (javob, to'g'ri javob, izoh, vaqt). */
attemptsRouter.get(
  '/:id/result',
  ah(async (req, res) => {
    const u = me(req);
    const attempt = await prisma.attempt.findUnique({
      where: { id: req.params.id },
      include: {
        modules: { orderBy: { order: 'asc' } },
        test: { select: { title: true, type: true } },
        assignment: { select: { resultVisibility: true, dueAt: true, title: true } },
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
      },
    });
    if (!attempt) throw notFound('Urinish');
    const owner = attempt.userId === u.id;
    if (!owner && !(await canViewStudent(u, attempt.userId))) throw forbidden();
    if (attempt.status !== 'FINISHED') throw new HttpError(409, 'Test hali tugamagan', 'NOT_FINISHED');
    const staffView = !owner || hasRole(u, 'OPERATOR');
    const hidden =
      !staffView && attempt.assignment?.resultVisibility === 'AFTER_DUE' && !!attempt.assignment.dueAt && attempt.assignment.dueAt > new Date();
    const base = {
      id: attempt.id,
      title: attempt.title,
      mode: attempt.mode,
      testType: attempt.test?.type ?? null,
      student: attempt.user,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      blurCount: attempt.blurCount,
    };
    if (hidden) {
      return res.json({ ...base, hidden: true, availableAt: attempt.assignment?.dueAt });
    }
    const answers = await prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
      orderBy: { order: 'asc' },
      include: { template: { select: { domain: { select: { id: true, name: true } }, skill: { select: { id: true, name: true } } } } },
    });
    const variants = await getVariants(answers);
    const moduleById = new Map(attempt.modules.map((m) => [m.id, m]));
    const domains = new Map<string, { name: string; correct: number; total: number }>();
    for (const a of answers) {
      const d = domains.get(a.template.domain.id) ?? { name: a.template.domain.name, correct: 0, total: 0 };
      d.total++;
      if (a.isCorrect) d.correct++;
      domains.set(a.template.domain.id, d);
    }
    res.json({
      ...base,
      hidden: false,
      scores: {
        rwRaw: attempt.rwRaw,
        mathRaw: attempt.mathRaw,
        rwScaled: attempt.rwScaled,
        mathScaled: attempt.mathScaled,
        totalScaled: attempt.totalScaled,
        correct: attempt.correctCount,
        total: attempt.totalItems,
        ratingDelta: attempt.ratingDelta,
      },
      modules: attempt.modules.map((m) => ({
        order: m.order,
        section: m.section,
        stage: m.stage,
        variant: staffView ? m.variant : undefined,
        correct: m.correctCount,
        total: m.total,
      })),
      domains: [...domains.entries()].map(([id, d]) => ({ id, ...d })),
      items: answers.map((a, i) => {
        const m = a.attemptModuleId ? moduleById.get(a.attemptModuleId) : undefined;
        return {
          id: a.id,
          number: i + 1,
          moduleOrder: m?.order ?? null,
          section: m?.section ?? null,
          question: reviewQuestion(variants[i], a.templateId),
          answer: a.answer,
          isCorrect: a.isCorrect,
          marked: a.marked,
          timeSpentMs: a.timeSpentMs,
          ratingDelta: a.ratingDelta,
          templateId: a.templateId,
          templateVersion: a.templateVersion,
          seed: a.seed,
          domain: a.template.domain.name,
          skill: a.template.skill.name,
        };
      }),
    });
  }),
);
