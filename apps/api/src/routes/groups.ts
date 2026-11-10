import { createRequire } from 'node:module';
import { Prisma } from '@prisma/client';
import { displayRating, effectiveStreak, tashkentDate, TAXONOMY } from '@sat/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { assertGroupAccess } from '../lib/access';
import { audit } from '../lib/audit';
import { hasRole, me, requireAuth, requireRole } from '../lib/auth';
import { ah, forbidden, HttpError, notFound, parse, randomCode } from '../lib/http';
import { getSettings } from '../lib/settings';
import { displayName } from '../lib/users';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs') as typeof import('exceljs');

export const groupsRouter = Router();
groupsRouter.use(requireAuth, requireRole('OPERATOR', 'TEACHER'));

groupsRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const where: Prisma.GroupWhereInput = hasRole(u, 'OPERATOR') ? {} : { members: { some: { userId: u.id, role: 'TEACHER' } } };
    const groups = await prisma.group.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { members: { select: { role: true, user: { select: { id: true, firstName: true, lastName: true, username: true } } } } },
    });
    res.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        inviteCode: g.inviteCode,
        leaderboardEnabled: g.leaderboardEnabled,
        createdAt: g.createdAt,
        students: g.members.filter((m) => m.role === 'STUDENT').length,
        teachers: g.members.filter((m) => m.role === 'TEACHER').map((m) => ({ id: m.user.id, name: displayName(m.user) })),
      })),
    );
  }),
);

groupsRouter.post(
  '/',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().min(1).max(100) }), req.body);
    const g = await prisma.group.create({ data: { name, inviteCode: randomCode(6) } });
    await audit(me(req).id, 'CREATE', 'group', g.id, { name });
    res.status(201).json(g);
  }),
);

groupsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    await assertGroupAccess(u, req.params.id);
    const body = parse(
      z.object({ name: z.string().min(1).max(100).optional(), leaderboardEnabled: z.boolean().optional(), openJoin: z.boolean().optional() }),
      req.body,
    );
    if (body.name && !hasRole(u, 'OPERATOR')) throw forbidden("Guruh nomini faqat operator o'zgartira oladi");
    const g = await prisma.group.update({ where: { id: req.params.id }, data: body });
    await audit(u.id, 'UPDATE', 'group', g.id, body);
    res.json(g);
  }),
);

groupsRouter.delete(
  '/:id',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    await prisma.group.delete({ where: { id: req.params.id } });
    await audit(me(req).id, 'DELETE', 'group', req.params.id);
    res.json({ deleted: true });
  }),
);

groupsRouter.post(
  '/:id/code',
  ah(async (req, res) => {
    await assertGroupAccess(me(req), req.params.id);
    const g = await prisma.group.update({ where: { id: req.params.id }, data: { inviteCode: randomCode(6) } });
    res.json({ inviteCode: g.inviteCode });
  }),
);

// ───────────── Shaxsiy kirish kodlari: har o'quvchiga alohida, bir martalik ─────────────

const inviteInclude = { usedBy: { select: { id: true, firstName: true, lastName: true, username: true } } } as const;
type InviteRow = Prisma.GroupInviteGetPayload<{ include: typeof inviteInclude }>;
const inviteView = (i: InviteRow) => ({
  id: i.id,
  code: i.code,
  label: i.label,
  createdAt: i.createdAt,
  usedAt: i.usedAt,
  usedBy: i.usedBy ? { id: i.usedBy.id, name: displayName(i.usedBy), username: i.usedBy.username } : null,
});

groupsRouter.get(
  '/:id/invites',
  ah(async (req, res) => {
    await assertGroupAccess(me(req), req.params.id);
    const list = await prisma.groupInvite.findMany({ where: { groupId: req.params.id }, orderBy: { createdAt: 'asc' }, include: inviteInclude });
    res.json(list.map(inviteView));
  }),
);

/** Ismlar ro'yxati bo'yicha (har biriga bittadan) yoki ismsiz N ta kod. */
groupsRouter.post(
  '/:id/invites',
  ah(async (req, res) => {
    const u = me(req);
    await assertGroupAccess(u, req.params.id);
    const body = parse(
      z.object({
        labels: z.array(z.string().max(60)).max(100).optional(),
        count: z.number().int().min(1).max(100).optional(),
      }),
      req.body,
    );
    const labels = (body.labels ?? []).map((s) => s.trim()).filter(Boolean);
    const items: Array<string | null> = labels.length ? labels : Array.from({ length: body.count ?? 0 }, () => null);
    if (!items.length) throw new HttpError(400, "O'quvchilar ismlari yoki kodlar sonini kiriting");
    const existing = await prisma.groupInvite.count({ where: { groupId: req.params.id } });
    if (existing + items.length > 500) throw new HttpError(400, "Bitta guruhda 500 tadan ortiq shaxsiy kod bo'lmaydi");
    const created: InviteRow[] = [];
    for (const label of items) {
      for (let attempt = 0; ; attempt++) {
        try {
          created.push(
            await prisma.groupInvite.create({ data: { groupId: req.params.id, code: randomCode(8), label, createdById: u.id }, include: inviteInclude }),
          );
          break;
        } catch (e) {
          // Kod takrorlanib qolsa (juda kam ehtimol) — yangisini olamiz
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') || attempt >= 4) throw e;
        }
      }
    }
    await audit(u.id, 'CREATE_INVITES', 'group', req.params.id, { count: created.length });
    res.status(201).json(created.map(inviteView));
  }),
);

groupsRouter.delete(
  '/:id/invites/:inviteId',
  ah(async (req, res) => {
    const u = me(req);
    await assertGroupAccess(u, req.params.id);
    const inv = await prisma.groupInvite.findUnique({ where: { id: req.params.inviteId } });
    if (!inv || inv.groupId !== req.params.id) throw notFound('Kod');
    if (inv.usedById) throw new HttpError(400, "Ishlatilgan kodni o'chirib bo'lmaydi — kerak bo'lsa o'quvchini guruhdan chiqaring", 'CODE_USED');
    await prisma.groupInvite.delete({ where: { id: inv.id } });
    res.json({ deleted: true });
  }),
);

/** O'quvchi yoki o'qituvchini guruhga qo'shish (operator). */
groupsRouter.post(
  '/:id/members',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const body = parse(z.object({ userId: z.string(), role: z.enum(['STUDENT', 'TEACHER']).default('STUDENT') }), req.body);
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw notFound('Foydalanuvchi');
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: req.params.id, userId: body.userId } },
      create: { groupId: req.params.id, userId: body.userId, role: body.role },
      update: { role: body.role },
    });
    const roles = new Set(user.roles);
    roles.add(body.role === 'TEACHER' ? 'TEACHER' : 'STUDENT');
    await prisma.user.update({
      where: { id: user.id },
      data: { roles: [...roles], status: user.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE' },
    });
    await audit(me(req).id, 'ADD_MEMBER', 'group', req.params.id, body);
    res.json({ ok: true });
  }),
);

groupsRouter.delete(
  '/:id/members/:userId',
  ah(async (req, res) => {
    const u = me(req);
    await assertGroupAccess(u, req.params.id);
    const m = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } } });
    if (!m) throw notFound("A'zo");
    if (m.role === 'TEACHER' && !hasRole(u, 'OPERATOR')) throw forbidden();
    await prisma.groupMember.delete({ where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } } });
    await audit(u.id, 'REMOVE_MEMBER', 'group', req.params.id, { userId: req.params.userId });
    res.json({ ok: true });
  }),
);

async function groupStudents(groupId: string) {
  const s = await getSettings();
  const members = await prisma.groupMember.findMany({
    where: { groupId, role: 'STUDENT' },
    include: { user: { include: { ratings: true, streak: true } } },
  });
  const ids = members.map((m) => m.userId);
  const since = new Date(Date.now() - 30 * 86400_000);
  const [lastMocks, blur] = await Promise.all([
    prisma.attempt.findMany({
      where: { userId: { in: ids }, mode: 'TEST', status: 'FINISHED', totalScaled: { not: null } },
      orderBy: { finishedAt: 'desc' },
      select: { userId: true, totalScaled: true, finishedAt: true },
    }),
    prisma.attempt.groupBy({ by: ['userId'], where: { userId: { in: ids }, startedAt: { gte: since } }, _sum: { blurCount: true } }),
  ]);
  const today = tashkentDate();
  return members.map((m) => {
    // SAT shkalasi: umumiy 400–1600, Math va R&W 200–800 (10 ga karrali)
    const r = (t: 'OVERALL' | 'MATH' | 'RW') =>
      displayRating(t, m.user.ratings.find((x) => x.type === t)?.rating ?? s.rating.initial, s.ratingToSat);
    return {
      id: m.user.id,
      name: displayName(m.user),
      username: m.user.username,
      photoUrl: m.user.photoUrl,
      joinedAt: m.joinedAt,
      lastSeenAt: m.user.lastSeenAt,
      ratings: { OVERALL: r('OVERALL'), MATH: r('MATH'), RW: r('RW') },
      streak: effectiveStreak(m.user.streak, today),
      answered: m.user.answeredTotal,
      accuracy: m.user.answeredTotal ? Math.round((m.user.correctTotal / m.user.answeredTotal) * 100) : null,
      lastScore: lastMocks.find((x) => x.userId === m.userId)?.totalScaled ?? null,
      blur30d: blur.find((b) => b.userId === m.userId)?._sum.blurCount ?? 0,
      targetScore: m.user.targetScore,
    };
  });
}

groupsRouter.get(
  '/:id',
  ah(async (req, res) => {
    await assertGroupAccess(me(req), req.params.id);
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw notFound('Guruh');
    const [students, teachers, assignments] = await Promise.all([
      groupStudents(group.id),
      prisma.groupMember.findMany({ where: { groupId: group.id, role: 'TEACHER' }, include: { user: true } }),
      prisma.assignment.findMany({
        where: { groupId: group.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { test: { select: { title: true, type: true } }, attempts: { where: { status: 'FINISHED' }, select: { userId: true } } },
      }),
    ]);
    res.json({
      ...group,
      students: students.sort((a, b) => b.ratings.OVERALL - a.ratings.OVERALL),
      teachers: teachers.map((t) => ({ id: t.userId, name: displayName(t.user) })),
      assignments: assignments.map((a) => ({
        id: a.id,
        title: a.title,
        test: a.test,
        dueAt: a.dueAt,
        maxAttempts: a.maxAttempts,
        resultVisibility: a.resultVisibility,
        createdAt: a.createdAt,
        completed: new Set(a.attempts.map((x) => x.userId)).size,
        total: students.length,
      })),
    });
  }),
);

/** Guruh tahlili: qaysi ko'nikmani hamma yomon bilyapti (30 kun). */
groupsRouter.get(
  '/:id/analytics',
  ah(async (req, res) => {
    await assertGroupAccess(me(req), req.params.id);
    const ids = (await prisma.groupMember.findMany({ where: { groupId: req.params.id, role: 'STUDENT' }, select: { userId: true } })).map((m) => m.userId);
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400_000);
    const rows = ids.length
      ? await prisma.$queryRaw<Array<{ skillId: string; total: number; correct: number; avgTime: number | null; students: number }>>(Prisma.sql`
          SELECT t."skillId" AS "skillId",
                 COUNT(*)::int AS total,
                 SUM(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END)::int AS correct,
                 AVG(a."timeSpentMs")::float AS "avgTime",
                 COUNT(DISTINCT at."userId")::int AS students
          FROM "attempt_answers" a
          JOIN "attempts" at ON at.id = a."attemptId"
          JOIN "question_templates" t ON t.id = a."templateId"
          WHERE at."userId" = ANY(${ids}) AND a."isCorrect" IS NOT NULL AND a."answeredAt" >= ${since}
          GROUP BY t."skillId"`)
      : [];
    const skillName = new Map(TAXONOMY.flatMap((d) => d.skills.map((s) => [s.id, { name: s.name, domain: d.name, section: d.section }])));
    const skills = rows
      .map((r) => ({
        skillId: r.skillId,
        ...(skillName.get(r.skillId) ?? { name: r.skillId, domain: '', section: '' }),
        total: r.total,
        correct: r.correct,
        accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0,
        avgTimeSec: r.avgTime ? Math.round(r.avgTime / 1000) : null,
        students: r.students,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
    res.json({ days, students: ids.length, skills, weakest: skills.filter((s) => s.total >= 5).slice(0, 5) });
  }),
);

/** Natijalarni Excel'ga eksport (?dl=<download token>). */
groupsRouter.get(
  '/:id/export',
  ah(async (req, res) => {
    await assertGroupAccess(me(req), req.params.id);
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw notFound('Guruh');
    const students = await groupStudents(group.id);
    const assignments = await prisma.assignment.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: 'asc' },
      include: { attempts: { where: { status: 'FINISHED' }, select: { userId: true, totalScaled: true, correctCount: true, totalItems: true } } },
    });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SAT Mini App';
    const ws = wb.addWorksheet("O'quvchilar");
    ws.columns = [
      { header: 'Ism', key: 'name', width: 26 },
      { header: 'Username', key: 'username', width: 18 },
      { header: 'Umumiy reyting', key: 'overall', width: 15 },
      { header: 'Math', key: 'math', width: 10 },
      { header: 'R&W', key: 'rw', width: 10 },
      { header: "Oxirgi mock ball", key: 'last', width: 16 },
      { header: 'Maqsad', key: 'target', width: 10 },
      { header: 'Javoblar', key: 'answered', width: 10 },
      { header: "Aniqlik %", key: 'acc', width: 10 },
      { header: 'Streak', key: 'streak', width: 8 },
      { header: "Ilovadan chiqish (30 kun)", key: 'blur', width: 22 },
    ];
    for (const s of students) {
      ws.addRow({
        name: s.name,
        username: s.username ? `@${s.username}` : '',
        overall: s.ratings.OVERALL,
        math: s.ratings.MATH,
        rw: s.ratings.RW,
        last: s.lastScore ?? '',
        target: s.targetScore ?? '',
        answered: s.answered,
        acc: s.accuracy ?? '',
        streak: s.streak,
        blur: s.blur30d,
      });
    }
    ws.getRow(1).font = { bold: true };
    const ws2 = wb.addWorksheet('Topshiriqlar');
    ws2.columns = [{ header: 'Ism', key: 'name', width: 26 }, ...assignments.map((a) => ({ header: a.title, key: a.id, width: 18 }))];
    for (const s of students) {
      const row: Record<string, string | number> = { name: s.name };
      for (const a of assignments) {
        const best = a.attempts
          .filter((x) => x.userId === s.id)
          .map((x) => x.totalScaled ?? Math.round((x.correctCount / Math.max(1, x.totalItems)) * 100))
          .sort((x, y) => y - x)[0];
        row[a.id] = best ?? '—';
      }
      ws2.addRow(row);
    }
    ws2.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="group-${group.inviteCode}-${tashkentDate()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

/** O'qituvchi o'z guruhi uchun foydalanuvchini qidirishi (operator hammani). */
groupsRouter.get(
  '/:id/candidates',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) throw new HttpError(400, 'Kamida 2 belgi kiriting');
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q.replace(/^@/, ''), mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
    res.json(users.map((x) => ({ id: x.id, name: displayName(x), username: x.username, status: x.status, roles: x.roles })));
  }),
);
