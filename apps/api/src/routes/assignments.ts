import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { assertGroupAccess } from '../lib/access';
import { audit } from '../lib/audit';
import { hasRole, me, requireAuth, requireRole } from '../lib/auth';
import { ah, notFound, parse } from '../lib/http';
import { broadcast, escapeHtml } from '../lib/notify';
import { displayName } from '../lib/users';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth, requireRole('OPERATOR', 'TEACHER'));

/** Guruhga test yoki uy vazifasi berish: muddat, urinishlar soni, natijani ko'rsatish vaqti. */
assignmentsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        testId: z.string(),
        groupId: z.string(),
        title: z.string().max(200).optional(),
        dueAt: z.string().datetime({ offset: true }).nullish(),
        maxAttempts: z.number().int().min(1).max(20).default(1),
        resultVisibility: z.enum(['IMMEDIATE', 'AFTER_DUE']).default('IMMEDIATE'),
        notify: z.boolean().default(true),
      }),
      req.body,
    );
    const u = me(req);
    await assertGroupAccess(u, body.groupId);
    const test = await prisma.test.findUnique({ where: { id: body.testId } });
    if (!test) throw notFound('Test');
    const a = await prisma.assignment.create({
      data: {
        testId: test.id,
        groupId: body.groupId,
        title: body.title?.trim() || test.title,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        maxAttempts: body.maxAttempts,
        resultVisibility: body.resultVisibility,
        createdById: u.id,
      },
    });
    await audit(u.id, 'CREATE', 'assignment', a.id, { title: a.title, groupId: a.groupId });
    if (body.notify) {
      const students = await prisma.groupMember.findMany({ where: { groupId: body.groupId, role: 'STUDENT' }, include: { user: true } });
      const due = a.dueAt
        ? `\n⏰ Muddat: ${a.dueAt.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', dateStyle: 'short', timeStyle: 'short' })}`
        : '';
      void broadcast(
        students.map((s) => s.user),
        `📝 Yangi topshiriq: <b>${escapeHtml(a.title)}</b>${due}`,
        { text: '▶️ Boshlash', path: '/tests' },
        'NEW_ASSIGNMENT',
      );
    }
    res.status(201).json(a);
  }),
);

assignmentsRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined;
    if (groupId) await assertGroupAccess(u, groupId);
    const list = await prisma.assignment.findMany({
      where: groupId
        ? { groupId }
        : hasRole(u, 'OPERATOR')
          ? {}
          : { group: { members: { some: { userId: u.id, role: 'TEACHER' } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        test: { select: { title: true, type: true } },
        group: { select: { name: true, _count: { select: { members: { where: { role: 'STUDENT' } } } } } },
        attempts: { where: { status: 'FINISHED' }, select: { userId: true } },
      },
    });
    res.json(
      list.map((a) => ({
        id: a.id,
        title: a.title,
        test: a.test,
        group: { id: a.groupId, name: a.group.name },
        dueAt: a.dueAt,
        maxAttempts: a.maxAttempts,
        resultVisibility: a.resultVisibility,
        createdAt: a.createdAt,
        completed: new Set(a.attempts.map((x) => x.userId)).size,
        total: a.group._count.members,
      })),
    );
  }),
);

/** Har bir o'quvchi natijasi. */
assignmentsRouter.get(
  '/:id/results',
  ah(async (req, res) => {
    const a = await prisma.assignment.findUnique({ where: { id: req.params.id }, include: { test: { select: { title: true, type: true } } } });
    if (!a) throw notFound('Topshiriq');
    await assertGroupAccess(me(req), a.groupId);
    const students = await prisma.groupMember.findMany({ where: { groupId: a.groupId, role: 'STUDENT' }, include: { user: true } });
    const attempts = await prisma.attempt.findMany({
      where: { assignmentId: a.id },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        userId: true,
        status: true,
        totalScaled: true,
        rwScaled: true,
        mathScaled: true,
        correctCount: true,
        totalItems: true,
        startedAt: true,
        finishedAt: true,
        blurCount: true,
      },
    });
    res.json({
      assignment: a,
      rows: students.map((s) => {
        const mine = attempts.filter((x) => x.userId === s.userId);
        const finished = mine.filter((x) => x.status === 'FINISHED');
        const best = [...finished].sort(
          (x, y) => (y.totalScaled ?? y.correctCount) - (x.totalScaled ?? x.correctCount),
        )[0];
        return {
          student: { id: s.userId, name: displayName(s.user), username: s.user.username },
          attempts: mine.length,
          inProgress: mine.some((x) => x.status !== 'FINISHED'),
          best: best ?? null,
        };
      }),
    });
  }),
);

assignmentsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const a = await prisma.assignment.findUnique({ where: { id: req.params.id } });
    if (!a) throw notFound('Topshiriq');
    await assertGroupAccess(me(req), a.groupId);
    await prisma.assignment.delete({ where: { id: a.id } });
    await audit(me(req).id, 'DELETE', 'assignment', a.id, { title: a.title });
    res.json({ deleted: true });
  }),
);
