import type { Prisma, Role, UserStatus } from '@prisma/client';
import { DEFAULT_SETTINGS, round10, tashkentDate } from '@sat/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { hasRole, me, requireAuth, requireRole } from '../lib/auth';
import { ah, forbidden, HttpError, notFound, pageParams, parse, str } from '../lib/http';
import { broadcast, escapeHtml, notifyUser } from '../lib/notify';
import { invalidateScales } from '../lib/scoring';
import { getSettings, invalidateSettings, isSettingsKey } from '../lib/settings';
import { displayName, publicUser } from '../lib/users';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('OPERATOR'));

// ───────────── Foydalanuvchilar va rollar ─────────────

adminRouter.get(
  '/users',
  ah(async (req, res) => {
    const { skip, take, page, size } = pageParams(req.query, 50);
    const search = str(req.query.search);
    const where: Prisma.UserWhereInput = {
      ...(str(req.query.role) ? { roles: { has: str(req.query.role) as Role } } : {}),
      ...(str(req.query.status) ? { status: str(req.query.status) as UserStatus } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { username: { contains: search.replace(/^@/, ''), mode: 'insensitive' } },
              ...(/^\d+$/.test(search) ? [{ tgId: BigInt(search) }] : []),
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { memberships: { include: { group: { select: { id: true, name: true } } } } },
      }),
      prisma.user.count({ where }),
    ]);
    res.json({
      items: users.map((u) => ({
        ...publicUser(u),
        lastSeenAt: u.lastSeenAt,
        groups: u.memberships.map((m) => ({ id: m.group.id, name: m.group.name, role: m.role })),
      })),
      total,
      page,
      size,
    });
  }),
);

/** Rollar va holatni o'zgartirish. SUPER_ADMIN/OPERATOR rolini faqat SUPER_ADMIN bera oladi. */
adminRouter.patch(
  '/users/:id',
  ah(async (req, res) => {
    const actor = me(req);
    const body = parse(
      z.object({
        roles: z.array(z.enum(['SUPER_ADMIN', 'OPERATOR', 'TEACHER', 'STUDENT', 'PARENT'])).min(1).optional(),
        status: z.enum(['PENDING', 'ACTIVE', 'BLOCKED']).optional(),
      }),
      req.body,
    );
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('Foydalanuvchi');
    const isSuper = actor.roles.includes('SUPER_ADMIN');
    if (body.roles) {
      const privileged: Role[] = ['SUPER_ADMIN', 'OPERATOR'];
      const changedPrivileged = privileged.some((r) => body.roles!.includes(r) !== target.roles.includes(r));
      if (changedPrivileged && !isSuper) throw forbidden("Admin/operator rolini faqat SUPER_ADMIN bera oladi");
    }
    if (target.roles.includes('SUPER_ADMIN') && !isSuper) throw forbidden();
    if (target.id === actor.id && body.status === 'BLOCKED') throw new HttpError(400, "O'zingizni bloklay olmaysiz");
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { ...(body.roles ? { roles: [...new Set(body.roles)] } : {}), ...(body.status ? { status: body.status } : {}) },
    });
    await audit(actor.id, 'UPDATE_ROLES', 'user', target.id, { before: { roles: target.roles, status: target.status }, after: body });
    res.json(publicUser(user));
  }),
);

// ───────────── Sozlamalar (reyting, unvonlar, mastery, ...) ─────────────

adminRouter.get(
  '/settings',
  ah(async (_req, res) => {
    res.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
  }),
);

adminRouter.put(
  '/settings/:key',
  ah(async (req, res) => {
    const key = req.params.key;
    if (!isSettingsKey(key)) throw notFound('Sozlama');
    const { value } = parse(z.object({ value: z.unknown() }), req.body);
    const def = DEFAULT_SETTINGS[key];
    if (Array.isArray(def) !== Array.isArray(value) || typeof value !== 'object' || value === null) {
      throw new HttpError(400, `"${key}" uchun qiymat turi noto'g'ri`);
    }
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
    invalidateSettings();
    await audit(me(req).id, 'UPDATE', 'setting', key, value);
    res.json({ settings: await getSettings() });
  }),
);

adminRouter.delete(
  '/settings/:key',
  ah(async (req, res) => {
    await prisma.setting.deleteMany({ where: { key: req.params.key } });
    invalidateSettings();
    await audit(me(req).id, 'RESET', 'setting', req.params.key);
    res.json({ settings: await getSettings() });
  }),
);

// ───────────── Ball shkalasi ─────────────

adminRouter.get(
  '/scales',
  ah(async (_req, res) => {
    const rows = await prisma.scoreScale.findMany({ orderBy: [{ section: 'asc' }, { variant: 'asc' }, { raw: 'asc' }] });
    const grouped: Record<string, Array<{ raw: number; scaled: number }>> = {};
    for (const r of rows) (grouped[`${r.section}:${r.variant}`] ??= []).push({ raw: r.raw, scaled: r.scaled });
    res.json(grouped);
  }),
);

adminRouter.put(
  '/scales',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        section: z.enum(['RW', 'MATH']),
        variant: z.enum(['STANDARD', 'EASY', 'HARD']),
        rows: z.array(z.object({ raw: z.number().int().min(0).max(200), scaled: z.number().int().min(200).max(800) })).max(201),
      }),
      req.body,
    );
    await prisma.$transaction([
      prisma.scoreScale.deleteMany({ where: { section: body.section, variant: body.variant } }),
      prisma.scoreScale.createMany({ data: body.rows.map((r) => ({ ...r, section: body.section, variant: body.variant })) }),
    ]);
    invalidateScales();
    await audit(me(req).id, 'UPDATE', 'score_scale', `${body.section}:${body.variant}`, { rows: body.rows.length });
    res.json({ ok: true });
  }),
);

// ───────────── Statistika ─────────────

adminRouter.get(
  '/stats',
  ah(async (_req, res) => {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 86400_000);
    const d30 = new Date(now.getTime() - 30 * 86400_000);
    const [users, students, pending, active7, attempts30, answers30, mockAvg, templates, openReports, daily] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { roles: { has: 'STUDENT' }, status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { lastSeenAt: { gte: d7 } } }),
      prisma.attempt.count({ where: { startedAt: { gte: d30 } } }),
      prisma.attemptAnswer.aggregate({ where: { answeredAt: { gte: d30 } }, _count: { _all: true } }),
      prisma.attempt.aggregate({ where: { mode: 'TEST', status: 'FINISHED', totalScaled: { not: null }, finishedAt: { gte: d30 } }, _avg: { totalScaled: true }, _count: { _all: true } }),
      prisma.questionTemplate.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.attempt.count({ where: { mode: 'DAILY', dailyDate: tashkentDate(), status: 'FINISHED' } }),
    ]);
    // eng ko'p xato qilinadigan savollar (yomon savolni topish uchun ham)
    const hardest = await prisma.questionTemplate.findMany({
      where: { timesAnswered: { gte: 10 } },
      orderBy: { rating: 'desc' },
      take: 15,
      select: { id: true, title: true, section: true, difficulty: true, rating: true, timesAnswered: true, timesCorrect: true, _count: { select: { reports: true } } },
    });
    const correct30 = await prisma.attemptAnswer.count({ where: { answeredAt: { gte: d30 }, isCorrect: true } });
    res.json({
      users,
      students,
      pending,
      active7,
      attempts30,
      answers30: answers30._count._all,
      accuracy30: answers30._count._all ? Math.round((correct30 / answers30._count._all) * 100) : null,
      mockAvg30: mockAvg._avg.totalScaled ? round10(mockAvg._avg.totalScaled) : null,
      mockCount30: mockAvg._count._all,
      templates: Object.fromEntries(templates.map((t) => [t.status, t._count._all])),
      openReports,
      dailyToday: daily,
      hardest: hardest.map((t) => ({
        id: t.id,
        title: t.title,
        section: t.section,
        difficulty: t.difficulty,
        rating: Math.round(t.rating),
        answered: t.timesAnswered,
        accuracy: Math.round((t.timesCorrect / t.timesAnswered) * 100),
        reports: t._count.reports,
        // operator "Easy" degan, lekin ko'pchilik xato qilsa — shubhali
        suspicious: t.difficulty === 'EASY' && t.timesCorrect / t.timesAnswered < 0.35,
      })),
    });
  }),
);

// ───────────── Shikoyatlar ─────────────

adminRouter.get(
  '/reports',
  ah(async (req, res) => {
    const status = str(req.query.status) ?? 'OPEN';
    const list = await prisma.report.findMany({
      where: status === 'ALL' ? {} : { status: status as 'OPEN' | 'RESOLVED' | 'REJECTED' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
        template: { select: { id: true, title: true, version: true } },
      },
    });
    res.json(list.map((r) => ({ ...r, user: { id: r.user.id, name: displayName(r.user), username: r.user.username } })));
  }),
);

adminRouter.patch(
  '/reports/:id',
  ah(async (req, res) => {
    const body = parse(z.object({ status: z.enum(['RESOLVED', 'REJECTED', 'OPEN']), response: z.string().max(2000).optional() }), req.body);
    const r = await prisma.report.update({
      where: { id: req.params.id },
      data: { status: body.status, response: body.response ?? null, resolvedById: me(req).id, resolvedAt: body.status === 'OPEN' ? null : new Date() },
      include: { user: true, template: { select: { title: true } } },
    });
    await audit(me(req).id, 'RESOLVE', 'report', r.id, body);
    if (body.status !== 'OPEN') {
      const verdict = body.status === 'RESOLVED' ? "✅ Shikoyatingiz ko'rib chiqildi va tuzatildi" : '❕ Shikoyatingiz ko\'rib chiqildi';
      void notifyUser(r.user, `${verdict}: <b>${escapeHtml(r.template.title)}</b>${body.response ? `\n\n${escapeHtml(body.response)}` : ''}`);
    }
    res.json(r);
  }),
);

// ───────────── E'lonlar ─────────────

adminRouter.post(
  '/announcements',
  ah(async (req, res) => {
    const body = parse(
      z.object({ text: z.string().min(1).max(3500), groupIds: z.array(z.string()).optional(), includeStaff: z.boolean().default(false) }),
      req.body,
    );
    const where: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      botBlocked: false,
      ...(body.groupIds?.length ? { memberships: { some: { groupId: { in: body.groupIds } } } } : {}),
      ...(body.includeStaff ? {} : { roles: { has: 'STUDENT' } }),
    };
    const users = await prisma.user.findMany({ where, select: { id: true, tgId: true, botBlocked: true } });
    await audit(me(req).id, 'ANNOUNCE', 'announcement', null, { recipients: users.length, groupIds: body.groupIds ?? 'ALL' });
    // fon rejimida yuboriladi (Telegram limiti)
    void broadcast(users, `📢 ${escapeHtml(body.text)}`, { text: "Ilovani ochish" }, 'ANNOUNCEMENT');
    res.json({ queued: users.length });
  }),
);

// ───────────── Audit log ─────────────

adminRouter.get(
  '/audit',
  ah(async (req, res) => {
    const { skip, take, page, size } = pageParams(req.query, 50);
    const where: Prisma.AuditLogWhereInput = {
      ...(str(req.query.entity) ? { entity: str(req.query.entity) } : {}),
      ...(str(req.query.entityId) ? { entityId: str(req.query.entityId) } : {}),
      ...(str(req.query.userId) ? { userId: str(req.query.userId) } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
    ]);
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.userId).filter((x): x is string => !!x))] } } });
    res.json({
      items: items.map((i) => ({ ...i, userName: users.find((u) => u.id === i.userId) ? displayName(users.find((u) => u.id === i.userId)!) : null })),
      total,
      page,
      size,
    });
  }),
);

/** Admin uchun: faqat SUPER_ADMIN ko'radigan tizim ma'lumoti. */
adminRouter.get(
  '/system',
  ah(async (req, res) => {
    if (!hasRole(me(req), 'SUPER_ADMIN') || !me(req).roles.includes('SUPER_ADMIN')) throw forbidden();
    res.json({ node: process.version, uptimeSec: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1e6) });
  }),
);
