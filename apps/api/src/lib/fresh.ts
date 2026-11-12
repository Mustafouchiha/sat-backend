import type { Difficulty, Section } from '@prisma/client';
import { TAXONOMY } from '@sat/shared';
import { prisma } from '../db';
import type { CatalogItem } from './catalog';

/**
 * O'quvchi ko'rgan savollar (shablon bo'yicha): id -> oxirgi ko'rilgan vaqt (ms).
 * Javob berilgan yoki yakunlangan urinishda chiqqan savollar hisoblanadi; tashlab ketilgan mashqning
 * ochilmagan savollari "ko'rilgan" emas.
 */
export async function seenTemplates(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ id: string; last: Date | null }>>`
    SELECT a."templateId" AS id, MAX(COALESCE(a."answeredAt", t."startedAt")) AS last
    FROM attempt_answers a
    JOIN attempts t ON t.id = a."attemptId"
    WHERE t."userId" = ${userId} AND (a."answeredAt" IS NOT NULL OR t.status = 'FINISHED')
    GROUP BY a."templateId"`;
  return new Map(rows.map((r) => [r.id, r.last ? r.last.getTime() : 0]));
}

export interface Shortage {
  section: Section;
  skillId: string;
  difficulty: Difficulty;
}

/**
 * Tanlangan savollardan qaysilari takror (o'quvchi oldin ko'rgan) — o'sha mavzularda yangi savol tugagan.
 * AI avto-to'ldirish shu ro'yxat bo'yicha ishlaydi.
 */
export function shortagesOf(picked: Array<Pick<CatalogItem, 'id' | 'section' | 'skillId' | 'difficulty'>>, seen: ReadonlyMap<string, number>): Shortage[] {
  const out = new Map<string, Shortage>();
  for (const p of picked) {
    if (!seen.has(p.id)) continue;
    const key = `${p.section}:${p.skillId}`;
    if (!out.has(key)) out.set(key, { section: p.section, skillId: p.skillId, difficulty: p.difficulty });
  }
  return [...out.values()];
}

function queueRefill(list: Shortage[]): void {
  if (!list.length) return;
  void import('./aiJobs')
    .then((m) => m.requestRefill(list))
    .catch((e) => console.error("AI avto-to'ldirish xatosi:", (e as Error).message));
}

/** Takror savollar chiqqan bo'lsa — fonda AI'ga shu mavzularda yangi savol yaratish so'rovi (cheklovlar aiJobs'da). */
export function reportShortages(picked: Array<Pick<CatalogItem, 'id' | 'section' | 'skillId' | 'difficulty'>>, seen: ReadonlyMap<string, number>): void {
  queueRefill(shortagesOf(picked, seen));
}

/** Adaptiv to'plamda o'quvchi uchun yangi savoli tugagan ko'nikmalar (assembleAdaptiveSet.onExhausted). */
export function reportExhausted(skillIds: Iterable<string>): void {
  const list: Shortage[] = [];
  for (const id of skillIds) {
    const d = TAXONOMY.find((x) => x.skills.some((s) => s.id === id));
    if (d) list.push({ section: d.section as Section, skillId: id, difficulty: 'MEDIUM' });
  }
  queueRefill(list);
}
