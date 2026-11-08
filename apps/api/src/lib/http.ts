import { Prisma } from '@prisma/client';
import { TemplateError } from '@sat/generator';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import type { z, ZodTypeAny } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly extra?: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const notFound = (what = "Ma'lumot") => new HttpError(404, `${what} topilmadi`, 'NOT_FOUND');
export const forbidden = (msg = "Ruxsat yo'q") => new HttpError(403, msg, 'FORBIDDEN');

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Async handler xatolarini Express error handler'ga uzatadi. */
export const ah =
  (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** zod bilan input validatsiya; xato bo'lsa 400. */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new HttpError(400, msg, 'VALIDATION');
  }
  return r.data;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, code: err.code, ...err.extra });
    return;
  }
  if (err instanceof TemplateError) {
    res.status(400).json({ message: err.message, code: `TEMPLATE_${err.code}`, details: err.details });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'Bunday yozuv allaqachon mavjud', code: 'CONFLICT' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Yozuv topilmadi', code: 'NOT_FOUND' });
      return;
    }
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ message: "So'rov hajmi juda katta", code: 'TOO_LARGE' });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ message: "JSON noto'g'ri", code: 'BAD_JSON' });
    return;
  }
  console.error('Server xatosi:', err);
  res.status(500).json({ message: 'Server xatosi', code: 'INTERNAL' });
};

export function pageParams(q: Request['query'], defSize = 30, maxSize = 200) {
  const page = Math.max(1, Number(q.page) || 1);
  const size = Math.min(maxSize, Math.max(1, Number(q.size) || defSize));
  return { skip: (page - 1) * size, take: size, page, size };
}

export function randomCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(len);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join('');
}

export function str(q: unknown): string | undefined {
  return typeof q === 'string' && q.trim() ? q.trim() : undefined;
}
