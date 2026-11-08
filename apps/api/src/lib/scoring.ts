import type { ModuleVariant, Section } from '@prisma/client';
import { SAT_STRUCTURE, scaleScore } from '@sat/shared';
import { prisma } from '../db';

/** To'liq bo'lim uchun xom ballning maksimumi (shkala jadvallari shu bo'yicha tuzilgan). */
export const STANDARD_MAX_RAW: Record<Section, number> = {
  RW: SAT_STRUCTURE.RW.questionsPerModule * 2,
  MATH: SAT_STRUCTURE.MATH.questionsPerModule * 2,
};

let cache: { at: number; rows: Map<string, Array<{ raw: number; scaled: number }>> } | null = null;

async function loadScales() {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const all = await prisma.scoreScale.findMany();
  const rows = new Map<string, Array<{ raw: number; scaled: number }>>();
  for (const r of all) {
    const k = `${r.section}:${r.variant}`;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k)!.push({ raw: r.raw, scaled: r.scaled });
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export function invalidateScales(): void {
  cache = null;
}

/** Xom ball -> 200..800. Jadval faqat to'liq bo'lim uchun; savollar soni boshqacha bo'lsa formula ishlatiladi. */
export async function computeScaled(section: Section, variant: ModuleVariant, raw: number, maxRaw: number): Promise<number> {
  const scales = await loadScales();
  const rows = maxRaw === STANDARD_MAX_RAW[section] ? scales.get(`${section}:${variant}`) ?? [] : [];
  return scaleScore(raw, rows, maxRaw, variant);
}
