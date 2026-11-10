import {
  generateVariant,
  isAnswerCorrect,
  parseSpec,
  randomSeed,
  toPublicQuestion,
  type PublicQuestion,
  type TemplateSpec,
  type Variant,
} from '@sat/generator';
import { prisma } from '../db';
import { HttpError } from './http';

class Lru<K, V> {
  private readonly m = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(k: K): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: K, v: V): void {
    this.m.delete(k);
    this.m.set(k, v);
    if (this.m.size > this.max) {
      const first = this.m.keys().next();
      if (!first.done) this.m.delete(first.value);
    }
  }
  delete(k: K): void {
    this.m.delete(k);
  }
}

// Revision spec'lari o'zgarmaydi — xavfsiz keshlanadi
const specCache = new Lru<string, TemplateSpec>(2000);
const variantCache = new Lru<string, Variant>(10000);
const metaCache = new Lru<string, { imageId: string | null }>(2000);

export interface VariantRef {
  templateId: string;
  templateVersion: number;
  seed: number;
}

async function loadSpecs(refs: Array<Pick<VariantRef, 'templateId' | 'templateVersion'>>): Promise<void> {
  const missing = refs.filter((r) => !specCache.get(`${r.templateId}:${r.templateVersion}`));
  if (missing.length) {
    const uniq = [...new Map(missing.map((r) => [`${r.templateId}:${r.templateVersion}`, r])).values()];
    const revs = await prisma.templateRevision.findMany({
      where: { OR: uniq.map((r) => ({ templateId: r.templateId, version: r.templateVersion })) },
    });
    for (const rev of revs) specCache.set(`${rev.templateId}:${rev.version}`, parseSpec(rev.spec));
  }
  // Rasm versiyalanmaydi: operator uni almashtirsa, kesh tozalanadi va shu yerda qayta o'qiladi
  const ids = [...new Set(refs.map((r) => r.templateId))].filter((id) => !metaCache.get(id));
  if (ids.length) {
    const metas = await prisma.questionTemplate.findMany({ where: { id: { in: ids } }, select: { id: true, imageId: true } });
    for (const m of metas) metaCache.set(m.id, { imageId: m.imageId });
  }
}

/** Shablon rasmi o'zgarganda chaqiriladi — keyingi so'rov yangi rasmni oladi. */
export function forgetTemplateMeta(templateId: string): void {
  metaCache.delete(templateId);
}

/** Shablon rasmi URL'i (preview va shikoyatni ko'rish uchun). */
export const mediaPath = (imageId: string | null | undefined) => (imageId ? `/api/media/${imageId}` : undefined);

export async function getSpec(templateId: string, version: number): Promise<TemplateSpec> {
  await loadSpecs([{ templateId, templateVersion: version }]);
  const s = specCache.get(`${templateId}:${version}`);
  if (!s) throw new HttpError(500, `Shablon versiyasi topilmadi: ${templateId} v${version}`);
  return s;
}

export async function getVariants(refs: VariantRef[]): Promise<Variant[]> {
  await loadSpecs(refs);
  return refs.map((r) => {
    const key = `${r.templateId}:${r.templateVersion}:${r.seed}`;
    let v = variantCache.get(key);
    if (!v) {
      const spec = specCache.get(`${r.templateId}:${r.templateVersion}`);
      if (!spec) throw new HttpError(500, `Shablon versiyasi topilmadi: ${r.templateId}`);
      v = generateVariant(spec, r.seed);
      variantCache.set(key, v);
    }
    return v;
  });
}

export async function getVariant(ref: VariantRef): Promise<Variant> {
  return (await getVariants([ref]))[0];
}

export interface ClientQuestion extends PublicQuestion {
  imageUrl?: string;
}

export function publicQuestion(v: Variant, templateId: string): ClientQuestion {
  return { ...toPublicQuestion(v), imageUrl: mediaPath(metaCache.get(templateId)?.imageId) };
}

export function grade(v: Variant, answer: string | null | undefined): boolean {
  return isAnswerCorrect(v, answer);
}

/** Natija sahifasi uchun: savol + to'g'ri javob + izoh. */
export function reviewQuestion(v: Variant, templateId: string) {
  return {
    ...publicQuestion(v, templateId),
    correctLabel: v.correctLabel,
    correctDisplay: v.correctDisplay,
    explanation: v.explanation,
  };
}

/**
 * Shablon uchun ishlaydigan seed tanlash: variant generatsiya qilinmasa (juda kam holatda)
 * boshqa seed bilan qayta urinadi. Topilmasa null.
 */
export async function pickWorkingSeed(templateId: string, version: number): Promise<number | null> {
  const spec = await getSpec(templateId, version);
  for (let i = 0; i < 3; i++) {
    const seed = randomSeed();
    try {
      const v = generateVariant(spec, seed);
      variantCache.set(`${templateId}:${version}:${seed}`, v);
      return seed;
    } catch {
      // keyingi seed
    }
  }
  return null;
}
