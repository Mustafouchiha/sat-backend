import { Prisma, type Difficulty, type Section, type TemplateStatus } from '@prisma/client';
import {
  findNumbers,
  generateVariant,
  parseSpec,
  previewVariants,
  runChecks,
  suggestVariable,
  validateSpec,
  type TemplateSpec,
} from '@sat/generator';
import { initialQuestionRating } from '@sat/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { suggestTemplate } from '../lib/ai';
import { audit } from '../lib/audit';
import { hasRole, me, requireAuth, requireRole, type AuthUser } from '../lib/auth';
import { invalidateCatalog } from '../lib/catalog';
import { ah, forbidden, HttpError, notFound, pageParams, parse, str } from '../lib/http';
import { notifyUser } from '../lib/notify';
import { getSpec } from '../lib/variants';

export const templatesRouter = Router();
templatesRouter.use(requireAuth, requireRole('OPERATOR', 'TEACHER'));

const sectionE = z.enum(['RW', 'MATH']);
const diffE = z.enum(['EASY', 'MEDIUM', 'HARD']);
const statusE = z.enum(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED']);

const templateBody = z.object({
  title: z.string().min(1).max(200),
  section: sectionE,
  domainId: z.string().min(1),
  skillId: z.string().min(1),
  difficulty: diffE,
  status: statusE.optional(),
  spec: z.unknown(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  similarIds: z.array(z.string()).max(50).optional(),
  imageId: z.string().nullable().optional(),
});

type TemplateBody = z.infer<typeof templateBody>;

async function checkTaxonomy(section: Section, domainId: string, skillId: string) {
  const skill = await prisma.skill.findUnique({ where: { id: skillId }, include: { domain: true } });
  if (!skill) throw new HttpError(400, `Ko'nikma topilmadi: ${skillId}`);
  if (skill.domainId !== domainId) throw new HttpError(400, "Ko'nikma tanlangan domenga tegishli emas");
  if (skill.domain.section !== section) throw new HttpError(400, "Domen tanlangan bo'limga tegishli emas");
}

/** Saqlashdan oldin tekshiruv: sxema + 200 ta variantli avto-tekshiruv (qoralama uchun faqat sxema). */
function validateForSave(raw: unknown, status: TemplateStatus): TemplateSpec {
  const v = validateSpec(raw);
  if (!v.ok) throw new HttpError(400, 'Shablonda xatolar bor', 'TEMPLATE_INVALID', { errors: v.errors });
  if (status !== 'DRAFT') {
    const report = runChecks(v.spec, 200);
    if (!report.ok) throw new HttpError(400, "Avto-tekshiruvdan o'tmadi", 'TEMPLATE_CHECK_FAILED', { report });
  }
  return v.spec;
}

function statusFor(user: AuthUser, requested?: TemplateStatus): TemplateStatus {
  if (hasRole(user, 'OPERATOR')) return requested ?? 'DRAFT';
  return 'PENDING_REVIEW'; // o'qituvchi faqat taklif qila oladi
}

templatesRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { skip, take, page, size } = pageParams(req.query, 30);
    const search = str(req.query.search);
    const where: Prisma.QuestionTemplateWhereInput = {
      ...(str(req.query.section) ? { section: str(req.query.section) as Section } : {}),
      ...(str(req.query.domainId) ? { domainId: str(req.query.domainId) } : {}),
      ...(str(req.query.skillId) ? { skillId: str(req.query.skillId) } : {}),
      ...(str(req.query.difficulty) ? { difficulty: str(req.query.difficulty) as Difficulty } : {}),
      ...(str(req.query.status) ? { status: str(req.query.status) as TemplateStatus } : {}),
      ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { id: search }, { tags: { has: search } }] } : {}),
      ...(hasRole(u, 'OPERATOR') ? {} : { OR: [{ status: 'PUBLISHED' }, { createdById: u.id }] }),
    };
    const [items, total] = await Promise.all([
      prisma.questionTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          section: true,
          domainId: true,
          skillId: true,
          difficulty: true,
          status: true,
          version: true,
          rating: true,
          ratingGames: true,
          timesAnswered: true,
          timesCorrect: true,
          tags: true,
          updatedAt: true,
          createdById: true,
          skill: { select: { name: true } },
          _count: { select: { reports: { where: { status: 'OPEN' } } } },
        },
      }),
      prisma.questionTemplate.count({ where }),
    ]);
    res.json({
      items: items.map((t) => ({
        ...t,
        rating: Math.round(t.rating),
        accuracy: t.timesAnswered ? Math.round((t.timesCorrect / t.timesAnswered) * 100) : null,
        openReports: t._count.reports,
      })),
      total,
      page,
      size,
    });
  }),
);

/** Spec'ni sinab ko'rish: 10 ta variant (to'g'ri javoblari bilan). */
templatesRouter.post(
  '/preview',
  ah(async (req, res) => {
    const body = parse(z.object({ spec: z.unknown(), count: z.number().int().min(1).max(30).default(10), seedBase: z.number().int().optional() }), req.body);
    const v = validateSpec(body.spec);
    if (!v.ok) throw new HttpError(400, 'Shablonda xatolar bor', 'TEMPLATE_INVALID', { errors: v.errors });
    res.json({ variants: previewVariants(v.spec, body.count, body.seedBase) });
  }),
);

/** Avto-tekshiruv: 500 ta variant generatsiya qilib hisobot. */
templatesRouter.post(
  '/check',
  ah(async (req, res) => {
    const body = parse(z.object({ spec: z.unknown(), runs: z.number().int().min(10).max(2000).default(500) }), req.body);
    const v = validateSpec(body.spec);
    if (!v.ok) return res.json({ ok: false, errors: v.errors, report: null });
    res.json({ ok: true, errors: [], report: runChecks(v.spec, body.runs) });
  }),
);

/** Tayyor savoldan shablon: matndagi sonlar va diapazon takliflari. */
templatesRouter.post(
  '/templatize',
  ah(async (req, res) => {
    const { text } = parse(z.object({ text: z.string().min(1).max(10000) }), req.body);
    res.json({ numbers: findNumbers(text).map((n) => ({ ...n, suggestion: suggestVariable(n.suggestedName, n.value) })) });
  }),
);

/** Ixtiyoriy AI yordamchi (Claude): taklif qaytaradi, SAQLAMAYDI. */
templatesRouter.post(
  '/ai-suggest',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const body = parse(z.object({ text: z.string().min(10).max(8000), section: sectionE.optional() }), req.body);
    res.json(await suggestTemplate(body.text, body.section));
  }),
);

templatesRouter.get(
  '/export',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const list = await prisma.questionTemplate.findMany({
      where: str(req.query.status) ? { status: str(req.query.status) as TemplateStatus } : { status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'asc' },
      select: { title: true, section: true, domainId: true, skillId: true, difficulty: true, status: true, spec: true, tags: true },
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sat-templates-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(list, null, 2));
  }),
);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function jsonOr<T>(s: string | undefined, fallback: T): T {
  if (!s || !s.trim()) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    throw new HttpError(400, `JSON ustun noto'g'ri: ${s.slice(0, 60)}`);
  }
}

/** CSV qatorini shablonga aylantirish. Ustunlar README da tasvirlangan. */
function csvRowToTemplate(h: string[], r: string[]): TemplateBody {
  const get = (k: string) => r[h.indexOf(k)]?.trim() ?? '';
  const kind = (get('answerKind') || 'MCQ').toUpperCase();
  const distractors = ['distractor1', 'distractor2', 'distractor3', 'distractor4', 'distractor5'].map(get).filter(Boolean);
  const answer =
    kind === 'SPR'
      ? { kind: 'SPR', correct: get('correct') }
      : kind === 'MCQ_TEXT'
        ? { kind: 'MCQ_TEXT', choices: [get('correct'), ...distractors].slice(0, 4) }
        : { kind: 'MCQ', correct: get('correct'), distractors, ...(get('format') ? { format: get('format') } : {}) };
  const constraintsRaw = get('constraints');
  return {
    title: get('title') || get('stem').slice(0, 60),
    section: (get('section') || 'MATH').toUpperCase() as Section,
    domainId: get('domainId'),
    skillId: get('skillId'),
    difficulty: (get('difficulty') || 'MEDIUM').toUpperCase() as Difficulty,
    status: (get('status') || undefined) as TemplateStatus | undefined,
    spec: {
      version: 1,
      stem: get('stem'),
      ...(get('passage') ? { passage: get('passage') } : {}),
      ...(get('explanation') ? { explanation: get('explanation') } : {}),
      variables: jsonOr(get('variables'), []),
      derived: jsonOr(get('derived'), []),
      constraints: constraintsRaw.startsWith('[') ? jsonOr(constraintsRaw, []) : constraintsRaw.split('&&').map((c) => c.trim()).filter(Boolean),
      answer,
    },
  };
}

/** Ommaviy import: JSON massiv yoki CSV/Excel'dan saqlangan CSV. */
templatesRouter.post(
  '/import',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ format: z.enum(['json', 'csv']), content: z.string().min(2).max(5_000_000), status: statusE.optional() }),
      req.body,
    );
    let rows: TemplateBody[];
    if (body.format === 'json') {
      const data = jsonOr<unknown>(body.content, []);
      rows = parse(z.array(templateBody), Array.isArray(data) ? data : [data]);
    } else {
      const csv = parseCsv(body.content.replace(/^﻿/, ''));
      if (csv.length < 2) throw new HttpError(400, 'CSV bo\'sh');
      const header = csv[0].map((x) => x.trim());
      rows = csv.slice(1).map((r) => csvRowToTemplate(header, r));
    }
    const u = me(req);
    const results: Array<{ index: number; ok: boolean; id?: string; title: string; errors?: string[] }> = [];
    for (const [index, row] of rows.entries()) {
      try {
        const status = body.status ?? row.status ?? 'DRAFT';
        await checkTaxonomy(row.section, row.domainId, row.skillId);
        const spec = validateForSave(row.spec, status);
        const t = await createTemplate(u, { ...row, status }, spec);
        results.push({ index, ok: true, id: t.id, title: row.title });
      } catch (e) {
        const extra = e instanceof HttpError ? (e.extra?.errors as string[] | undefined) ?? (e.extra?.report as { errors: string[] } | undefined)?.errors : undefined;
        results.push({ index, ok: false, title: row.title, errors: extra ?? [(e as Error).message] });
      }
    }
    await audit(u.id, 'IMPORT', 'template', null, { count: rows.length, ok: results.filter((r) => r.ok).length });
    invalidateCatalog();
    res.json({ total: rows.length, created: results.filter((r) => r.ok).length, results });
  }),
);

async function createTemplate(u: AuthUser, body: TemplateBody, spec: TemplateSpec) {
  const status = statusFor(u, body.status);
  const t = await prisma.questionTemplate.create({
    data: {
      title: body.title,
      section: body.section,
      domainId: body.domainId,
      skillId: body.skillId,
      difficulty: body.difficulty,
      status,
      spec: spec as unknown as Prisma.InputJsonValue,
      rating: initialQuestionRating(body.difficulty),
      tags: body.tags ?? [],
      similarIds: body.similarIds ?? [],
      imageId: body.imageId ?? null,
      createdById: u.id,
      updatedById: u.id,
      revisions: { create: { version: 1, spec: spec as unknown as Prisma.InputJsonValue, createdById: u.id } },
    },
  });
  await audit(u.id, 'CREATE', 'template', t.id, { title: t.title, status });
  return t;
}

templatesRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const body = parse(templateBody, req.body);
    const status = statusFor(u, body.status);
    await checkTaxonomy(body.section, body.domainId, body.skillId);
    const spec = validateForSave(body.spec, status);
    const t = await createTemplate(u, { ...body, status }, spec);
    invalidateCatalog();
    res.status(201).json(t);
  }),
);

templatesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const t = await prisma.questionTemplate.findUnique({
      where: { id: req.params.id },
      include: {
        skill: { select: { name: true } },
        domain: { select: { name: true } },
        reports: { where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!t) throw notFound('Shablon');
    const u = me(req);
    if (!hasRole(u, 'OPERATOR') && t.status !== 'PUBLISHED' && t.createdById !== u.id) throw forbidden();
    res.json({ ...t, rating: Math.round(t.rating), avgTimeMs: t.timesAnswered ? Math.round(t.totalTimeMs / t.timesAnswered) : null });
  }),
);

templatesRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const existing = await prisma.questionTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Shablon');
    const isOperator = hasRole(u, 'OPERATOR');
    if (!isOperator && !(existing.createdById === u.id && existing.status === 'PENDING_REVIEW')) throw forbidden();
    const body = parse(templateBody, req.body);
    const status = isOperator ? body.status ?? existing.status : 'PENDING_REVIEW';
    await checkTaxonomy(body.section, body.domainId, body.skillId);
    const spec = validateForSave(body.spec, status);
    const specChanged = JSON.stringify(spec) !== JSON.stringify(parseSpec(existing.spec));
    const version = specChanged ? existing.version + 1 : existing.version;
    const t = await prisma.questionTemplate.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        section: body.section,
        domainId: body.domainId,
        skillId: body.skillId,
        difficulty: body.difficulty,
        status,
        spec: spec as unknown as Prisma.InputJsonValue,
        version,
        tags: body.tags ?? existing.tags,
        similarIds: body.similarIds ?? existing.similarIds,
        imageId: body.imageId === undefined ? existing.imageId : body.imageId,
        updatedById: u.id,
        ...(specChanged ? { revisions: { create: { version, spec: spec as unknown as Prisma.InputJsonValue, createdById: u.id } } } : {}),
      },
    });
    await audit(u.id, 'UPDATE', 'template', t.id, {
      specChanged,
      version,
      before: { title: existing.title, status: existing.status, difficulty: existing.difficulty },
      after: { title: t.title, status: t.status, difficulty: t.difficulty },
    });
    invalidateCatalog();
    res.json(t);
  }),
);

templatesRouter.delete(
  '/:id',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const u = me(req);
    const t = await prisma.questionTemplate.findUnique({ where: { id: req.params.id }, include: { _count: { select: { answers: true } } } });
    if (!t) throw notFound('Shablon');
    if (t._count.answers > 0) {
      await prisma.questionTemplate.update({ where: { id: t.id }, data: { status: 'ARCHIVED', updatedById: u.id } });
      await audit(u.id, 'ARCHIVE', 'template', t.id, { title: t.title });
      invalidateCatalog();
      return res.json({ archived: true, message: "Shablon ishlatilgan — o'chirilmadi, arxivlandi" });
    }
    await prisma.questionTemplate.delete({ where: { id: t.id } });
    await audit(u.id, 'DELETE', 'template', t.id, { title: t.title });
    invalidateCatalog();
    res.json({ deleted: true });
  }),
);

templatesRouter.post(
  '/:id/duplicate',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const u = me(req);
    const t = await prisma.questionTemplate.findUnique({ where: { id: req.params.id } });
    if (!t) throw notFound('Shablon');
    const spec = parseSpec(t.spec);
    const copy = await createTemplate(
      u,
      { title: `${t.title} (nusxa)`, section: t.section, domainId: t.domainId, skillId: t.skillId, difficulty: t.difficulty, status: 'DRAFT', spec, tags: t.tags, similarIds: t.similarIds, imageId: t.imageId },
      spec,
    );
    res.status(201).json(copy);
  }),
);

/** O'qituvchi taklif qilgan savolni tasdiqlash. */
templatesRouter.post(
  '/:id/approve',
  requireRole('OPERATOR'),
  ah(async (req, res) => {
    const u = me(req);
    const t = await prisma.questionTemplate.findUnique({ where: { id: req.params.id } });
    if (!t) throw notFound('Shablon');
    const report = runChecks(parseSpec(t.spec), 200);
    if (!report.ok) throw new HttpError(400, "Avto-tekshiruvdan o'tmadi", 'TEMPLATE_CHECK_FAILED', { report });
    const updated = await prisma.questionTemplate.update({ where: { id: t.id }, data: { status: 'PUBLISHED', updatedById: u.id } });
    await audit(u.id, 'APPROVE', 'template', t.id, { title: t.title });
    invalidateCatalog();
    if (t.createdById && t.createdById !== u.id) {
      const author = await prisma.user.findUnique({ where: { id: t.createdById } });
      if (author) void notifyUser(author, `✅ Siz taklif qilgan savol tasdiqlandi va bankka qo'shildi: <b>${t.title}</b>`);
    }
    res.json(updated);
  }),
);

templatesRouter.get(
  '/:id/revisions',
  ah(async (req, res) => {
    const revs = await prisma.templateRevision.findMany({ where: { templateId: req.params.id }, orderBy: { version: 'desc' } });
    res.json(revs);
  }),
);

/** Aniq variantni qayta tiklash (shikoyatni tekshirish uchun): template + versiya + seed. */
templatesRouter.get(
  '/:id/variant',
  ah(async (req, res) => {
    const q = parse(z.object({ seed: z.coerce.number().int(), version: z.coerce.number().int().optional() }), req.query);
    const t = await prisma.questionTemplate.findUnique({ where: { id: req.params.id }, select: { version: true } });
    if (!t) throw notFound('Shablon');
    const spec = await getSpec(req.params.id, q.version ?? t.version);
    res.json(generateVariant(spec, q.seed));
  }),
);
