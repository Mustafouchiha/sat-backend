import type { Difficulty, Section } from '@prisma/client';
import { effectiveDifficulty, type AppSettings } from '@sat/shared';
import { prisma } from '../db';

/** Nashr qilingan shablonlarning yengil ro'yxati (spec'siz) — tanlov algoritmlari uchun. */
export interface CatalogItem {
  id: string;
  version: number;
  section: Section;
  domainId: string;
  skillId: string;
  difficulty: Difficulty;
  rating: number;
  ratingGames: number;
}

let cache: { at: number; items: CatalogItem[] } | null = null;
const TTL = 60_000;

export async function getCatalog(): Promise<CatalogItem[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items;
  const items = await prisma.questionTemplate.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      id: true,
      version: true,
      section: true,
      domainId: true,
      skillId: true,
      difficulty: true,
      rating: true,
      ratingGames: true,
    },
  });
  cache = { at: Date.now(), items };
  return items;
}

export function invalidateCatalog(): void {
  cache = null;
}

export interface CatalogFilter {
  section?: Section | null;
  domainId?: string | null;
  skillId?: string | null;
  difficulty?: Difficulty | null;
}

export function filterCatalog(items: CatalogItem[], f: CatalogFilter, settings?: AppSettings): CatalogItem[] {
  return items.filter((t) => {
    if (f.section && t.section !== f.section) return false;
    if (f.domainId && t.domainId !== f.domainId) return false;
    if (f.skillId && t.skillId !== f.skillId) return false;
    if (f.difficulty) {
      const d = settings ? effectiveDifficulty(t, settings.difficulty) : t.difficulty;
      if (d !== f.difficulty) return false;
    }
    return true;
  });
}

/**
 * Pool'dan tanlash: filtr bo'yicha topilmasa, shartlarni bosqichma-bosqich yumshatadi.
 * seen berilsa — avval o'quvchi hali ko'rmagan savol (istalgan bosqichda), topilmasa eng uzoq vaqt oldin ko'rilgani.
 */
export function pickFromPool(
  items: CatalogItem[],
  f: CatalogFilter,
  used: Set<string>,
  rnd: () => number = Math.random,
  seen?: ReadonlyMap<string, number>,
): CatalogItem | undefined {
  const tiers: CatalogFilter[] = [
    f,
    { ...f, difficulty: null },
    { section: f.section, domainId: f.domainId },
    { section: f.section },
  ];
  const tierCands = tiers.map((tier) => filterCatalog(items, tier));
  if (seen?.size) {
    for (const cands of tierCands) {
      const fresh = cands.filter((c) => !used.has(c.id) && !seen.has(c.id));
      if (fresh.length) return fresh[Math.floor(rnd() * fresh.length)];
    }
  }
  for (const cands of tierCands) {
    if (!cands.length) continue;
    const unused = cands.filter((c) => !used.has(c.id));
    if (unused.length && seen?.size) {
      // hammasi ko'rilgan: eng eskilaridan biri (yangi sonlar bilan)
      const oldest = [...unused].sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0)).slice(0, 3);
      return oldest[Math.floor(rnd() * oldest.length)];
    }
    const pool = unused.length ? unused : cands;
    return pool[Math.floor(rnd() * pool.length)];
  }
  return undefined;
}
