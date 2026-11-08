import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { assertStudentAccess } from '../lib/access';
import { me, requireAuth, requireRole } from '../lib/auth';
import { ah, notFound, parse } from '../lib/http';
import { escapeHtml, notifyUser } from '../lib/notify';
import { displayName, publicUser, userStats } from '../lib/users';
import { ratingHistory, skillOverview } from './me';

export const studentsRouter = Router();
studentsRouter.use(requireAuth, requireRole('OPERATOR', 'TEACHER'));

/** O'qituvchi uchun o'quvchi profili: ball dinamikasi, kuchli/zaif tomonlar, vaqt, urinishlar. */
studentsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    await assertStudentAccess(u, req.params.id);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("O'quvchi");
    const [stats, history, skills, attempts, comments, timing] = await Promise.all([
      userStats(user.id),
      ratingHistory(user.id, 'OVERALL', 120),
      skillOverview(user.id),
      prisma.attempt.findMany({
        where: { userId: user.id, status: 'FINISHED' },
        orderBy: { finishedAt: 'desc' },
        take: 40,
        select: {
          id: true,
          mode: true,
          title: true,
          correctCount: true,
          totalItems: true,
          totalScaled: true,
          rwScaled: true,
          mathScaled: true,
          blurCount: true,
          ratingDelta: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
      prisma.teacherComment.findMany({
        where: { studentId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { teacher: { select: { firstName: true, lastName: true, username: true } } },
      }),
      prisma.attemptAnswer.aggregate({
        where: { attempt: { userId: user.id }, answeredAt: { not: null } },
        _avg: { timeSpentMs: true },
        _count: { _all: true },
      }),
    ]);
    const scoreHistory = attempts
      .filter((a) => a.totalScaled !== null)
      .map((a) => ({ date: a.finishedAt, total: a.totalScaled, rw: a.rwScaled, math: a.mathScaled }))
      .reverse();
    res.json({
      user: publicUser(user),
      stats,
      ratingHistory: history,
      scoreHistory,
      skills,
      attempts,
      avgTimeSec: timing._avg.timeSpentMs ? Math.round(timing._avg.timeSpentMs / 1000) : null,
      comments: comments.map((c) => ({ id: c.id, text: c.text, createdAt: c.createdAt, teacher: displayName(c.teacher) })),
    });
  }),
);

studentsRouter.post(
  '/:id/comments',
  ah(async (req, res) => {
    const u = me(req);
    await assertStudentAccess(u, req.params.id);
    const { text } = parse(z.object({ text: z.string().min(1).max(2000) }), req.body);
    const student = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!student) throw notFound("O'quvchi");
    const c = await prisma.teacherComment.create({ data: { teacherId: u.id, studentId: student.id, text } });
    const teacher = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    void notifyUser(student, `💬 O'qituvchi izohi (${escapeHtml(displayName(teacher))}):\n\n${escapeHtml(text)}`, { text: 'Ochish', path: '/profile' }, 'TEACHER_COMMENT');
    res.status(201).json(c);
  }),
);
