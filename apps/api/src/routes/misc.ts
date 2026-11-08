import { TAXONOMY } from '@sat/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { me, requireAuth, requireRole } from '../lib/auth';
import { ah, HttpError, notFound, parse } from '../lib/http';

/** Taksonomiya, shikoyatlar va rasmlar. */
export const miscRouter = Router();

miscRouter.get(
  '/taxonomy',
  ah(async (_req, res) => {
    const domains = await prisma.domain.findMany({ orderBy: { order: 'asc' }, include: { skills: { orderBy: { order: 'asc' } } } });
    res.json(domains.length ? domains : TAXONOMY.map((d, i) => ({ ...d, order: i })));
  }),
);

/** O'quvchi: "savolda xato bor" shikoyati (template + versiya + seed — aynan shu variant tiklanadi). */
miscRouter.post(
  '/reports',
  requireAuth,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        templateId: z.string(),
        templateVersion: z.number().int().optional(),
        seed: z.number().int().optional(),
        message: z.string().min(3).max(2000),
      }),
      req.body,
    );
    const t = await prisma.questionTemplate.findUnique({ where: { id: body.templateId }, select: { id: true } });
    if (!t) throw notFound('Savol');
    const recent = await prisma.report.count({ where: { userId: me(req).id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (recent >= 10) throw new HttpError(429, "Juda ko'p shikoyat — birozdan keyin urinib ko'ring");
    const r = await prisma.report.create({
      data: { userId: me(req).id, templateId: t.id, templateVersion: body.templateVersion, seed: body.seed, message: body.message },
    });
    res.status(201).json({ id: r.id });
  }),
);

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Savol rasmi yuklash (Neon'da saqlanadi, 2 MB gacha). */
miscRouter.post(
  '/media',
  requireAuth,
  requireRole('OPERATOR', 'TEACHER'),
  ah(async (req, res) => {
    const body = parse(z.object({ mime: z.string(), data: z.string().min(10) }), req.body);
    if (!ALLOWED_MIME.has(body.mime)) throw new HttpError(400, 'Faqat PNG, JPEG, WEBP yoki GIF');
    const buf = Buffer.from(body.data.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (buf.length > 2 * 1024 * 1024) throw new HttpError(413, 'Rasm 2 MB dan katta');
    const m = await prisma.media.create({ data: { mime: body.mime, size: buf.length, data: buf, createdById: me(req).id } });
    res.status(201).json({ id: m.id, url: `/api/media/${m.id}` });
  }),
);

miscRouter.get(
  '/media/:id',
  ah(async (req, res) => {
    const m = await prisma.media.findUnique({ where: { id: req.params.id } });
    if (!m) throw notFound('Rasm');
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(Buffer.from(m.data));
  }),
);
