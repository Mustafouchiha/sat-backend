import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { me, requireActive, requireAuth, requireRole } from '../lib/auth';
import { ah, HttpError, notFound, parse } from '../lib/http';
import { buildAutoModules, modulesCreateInput } from '../lib/testBuilder';

export const testsRouter = Router();
testsRouter.use(requireAuth);

const sectionE = z.enum(['RW', 'MATH']);
const diffE = z.enum(['EASY', 'MEDIUM', 'HARD']);
const typeE = z.enum(['MOCK', 'SECTION', 'MODULE', 'TOPIC', 'HOMEWORK', 'QUICK']);

const moduleSchema = z.object({
  order: z.number().int().min(0),
  section: sectionE,
  stage: z.number().int().min(1).max(2).default(1),
  variant: z.enum(['STANDARD', 'EASY', 'HARD']).default('STANDARD'),
  durationSec: z.number().int().min(60).max(4 * 3600),
  items: z
    .array(
      z.object({
        templateId: z.string().nullish(),
        poolDomainId: z.string().nullish(),
        poolSkillId: z.string().nullish(),
        poolDifficulty: diffE.nullish(),
      }),
    )
    .min(1)
    .max(60),
});

const testSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  type: typeE,
  adaptive: z.boolean().default(false),
  adaptiveThreshold: z.number().min(0.1).max(0.95).default(0.6),
  breakSeconds: z.number().int().min(0).max(3600).default(600),
  isPublic: z.boolean().default(false),
  modules: z.array(moduleSchema).min(1).max(8),
});

function summary(t: Prisma.TestGetPayload<{ include: { modules: { include: { _count: { select: { items: true } } } } } }>) {
  const orders = [...new Set(t.modules.map((m) => m.order))].sort((a, b) => a - b);
  const first = (o: number) => t.modules.find((m) => m.order === o && m.variant !== 'HARD') ?? t.modules.find((m) => m.order === o)!;
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    adaptive: t.adaptive,
    isPublic: t.isPublic,
    createdAt: t.createdAt,
    sections: [...new Set(t.modules.map((m) => m.section))],
    moduleCount: orders.length,
    questionCount: orders.reduce((s, o) => s + first(o)._count.items, 0),
    durationMin: Math.round(orders.reduce((s, o) => s + first(o).durationSec, 0) / 60),
  };
}

const listInclude = { modules: { include: { _count: { select: { items: true } } } } } as const;

/** O'quvchilar uchun ochiq testlar (masalan bepul mock). */
testsRouter.get(
  '/public',
  requireActive,
  ah(async (_req, res) => {
    const tests = await prisma.test.findMany({ where: { isPublic: true }, orderBy: { createdAt: 'desc' }, include: listInclude });
    res.json(tests.map(summary));
  }),
);

testsRouter.get(
  '/',
  requireRole('OPERATOR', 'TEACHER'),
  ah(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: typeof req.query.type === 'string' ? { type: req.query.type as Prisma.EnumTestTypeFilter['equals'] } : {},
      orderBy: { createdAt: 'desc' },
      include: listInclude,
      take: 200,
    });
    res.json(tests.map(summary));
  }),
);

testsRouter.get(
  '/:id',
  requireRole('OPERATOR', 'TEACHER'),
  ah(async (req, res) => {
    const t = await prisma.test.findUnique({
      where: { id: req.params.id },
      include: { modules: { orderBy: [{ order: 'asc' }, { variant: 'asc' }], include: { items: { orderBy: { order: 'asc' } } } } },
    });
    if (!t) throw notFound('Test');
    res.json(t);
  }),
);

testsRouter.post(
  '/',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const body = parse(testSchema, req.body);
    const u = me(req);
    const t = await prisma.test.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        type: body.type,
        adaptive: body.adaptive,
        adaptiveThreshold: body.adaptiveThreshold,
        breakSeconds: body.breakSeconds,
        isPublic: body.isPublic,
        createdById: u.id,
        modules: { create: modulesCreateInput(body.modules) },
      },
    });
    await audit(u.id, 'CREATE', 'test', t.id, { title: t.title });
    res.status(201).json(t);
  }),
);

/** Avtomatik test: domen/qiyinlik nisbati bo'yicha pool elementlari (har o'quvchiga tasodifiy savollar). */
testsRouter.post(
  '/auto',
  requireRole('OPERATOR', 'TEACHER'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        title: z.string().min(1).max(200),
        type: typeE,
        sections: z.array(sectionE).min(1).max(2),
        adaptive: z.boolean().default(true),
        adaptiveThreshold: z.number().min(0.1).max(0.95).default(0.6),
        questionsPerModule: z.number().int().min(1).max(60).optional(),
        minutesPerModule: z.number().int().min(1).max(240).optional(),
        domainIds: z.array(z.string()).optional(),
        skillIds: z.array(z.string()).optional(),
        difficulty: diffE.nullish(),
        isPublic: z.boolean().default(false),
      }),
      req.body,
    );
    const u = me(req);
    const modules = buildAutoModules(body);
    const t = await prisma.test.create({
      data: {
        title: body.title,
        type: body.type,
        adaptive: body.adaptive && modules.some((m) => m.variant !== 'STANDARD'),
        adaptiveThreshold: body.adaptiveThreshold,
        isPublic: body.isPublic,
        createdById: u.id,
        modules: { create: modulesCreateInput(modules) },
      },
    });
    await audit(u.id, 'CREATE_AUTO', 'test', t.id, { title: t.title, type: t.type });
    res.status(201).json(t);
  }),
);

testsRouter.put(
  '/:id',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const body = parse(testSchema, req.body);
    const u = me(req);
    const existing = await prisma.test.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Test');
    const t = await prisma.$transaction(async (tx) => {
      await tx.testModule.deleteMany({ where: { testId: existing.id } });
      return tx.test.update({
        where: { id: existing.id },
        data: {
          title: body.title,
          description: body.description ?? null,
          type: body.type,
          adaptive: body.adaptive,
          adaptiveThreshold: body.adaptiveThreshold,
          breakSeconds: body.breakSeconds,
          isPublic: body.isPublic,
          modules: { create: modulesCreateInput(body.modules) },
        },
      });
    });
    await audit(u.id, 'UPDATE', 'test', t.id, { title: t.title });
    res.json(t);
  }),
);

testsRouter.delete(
  '/:id',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const u = me(req);
    const used = await prisma.attempt.count({ where: { testId: req.params.id } });
    if (used > 0 && req.query.force !== 'true') {
      throw new HttpError(409, `Bu test ${used} ta urinishda ishlatilgan. Baribir o'chirish uchun force=true`, 'IN_USE');
    }
    await prisma.test.delete({ where: { id: req.params.id } });
    await audit(u.id, 'DELETE', 'test', req.params.id);
    res.json({ deleted: true });
  }),
);
