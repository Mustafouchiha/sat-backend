import type { AutoTestConfig, MasteryConfig, SrsConfig } from './settings';

export interface RandomSource {
  float(): number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const DAY = 86_400_000;

// ───────────────────────── Mastery ─────────────────────────

export function updateMastery(current: number | undefined, correct: boolean, cfg: MasteryConfig): number {
  const m = current ?? cfg.initial;
  const next = correct ? m + (100 - m) * cfg.gainRate : m - m * cfg.lossRate;
  return clamp(Math.round(next * 100) / 100, 0, 100);
}

export type Bucket = 'weak' | 'medium' | 'strong';

export function bucketOf(mastery: number, cfg: MasteryConfig): Bucket {
  if (mastery < cfg.weakBelow) return 'weak';
  if (mastery >= cfg.strongAbove) return 'strong';
  return 'medium';
}

// ───────────────────────── Spaced repetition ─────────────────────────

export interface ReviewState {
  stage: number;
  streak: number;
  dueAt: Date;
}

export type SrsResult =
  | { action: 'upsert'; stage: number; streak: number; dueAt: Date }
  | { action: 'remove' }
  | { action: 'none' };

/**
 * Xato — navbatga (1 kundan keyin). To'g'ri (vaqti kelgan bo'lsa yoki "Xatolar ustida ishlash" rejimida) —
 * keyingi bosqich (3, 7, 14 kun). Ketma-ket N marta to'g'ri — navbatdan chiqadi.
 */
export function srsNext(
  state: ReviewState | null,
  correct: boolean,
  now: Date,
  cfg: SrsConfig,
  force = false,
): SrsResult {
  const intervals = cfg.intervalsDays.length ? cfg.intervalsDays : [1];
  if (!correct) {
    return { action: 'upsert', stage: 0, streak: 0, dueAt: new Date(now.getTime() + intervals[0] * DAY) };
  }
  if (!state) return { action: 'none' };
  if (!force && state.dueAt.getTime() > now.getTime()) return { action: 'none' };
  const streak = state.streak + 1;
  if (streak >= cfg.removeAfterStreak) return { action: 'remove' };
  const stage = Math.min(state.stage + 1, intervals.length - 1);
  return { action: 'upsert', stage, streak, dueAt: new Date(now.getTime() + intervals[stage] * DAY) };
}

// ───────────────────────── Avtomatik test yig'ish ─────────────────────────

export interface TemplateRef {
  id: string;
  skillId: string;
  rating: number;
}

export interface AssembleInput {
  count: number;
  templates: TemplateRef[];
  /** skillId -> mastery (yo'q bo'lsa cfg.initial) */
  mastery: Record<string, number>;
  dueReviewTemplateIds: string[];
  ratios: AutoTestConfig;
  masteryCfg: MasteryConfig;
  userRating?: number;
  /** "Men uchun" maqsadi: reyting + offset atrofidagi savollar afzal */
  ratingOffset?: number;
  rng: RandomSource;
  exclude?: string[];
}

function shuffle<T>(arr: readonly T[], rng: RandomSource): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.float() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weighted<T>(items: readonly T[], w: (t: T) => number, rng: RandomSource): T | undefined {
  if (!items.length) return undefined;
  const ws = items.map((t) => Math.max(0, w(t)));
  const total = ws.reduce((s, x) => s + x, 0);
  if (total <= 0) return items[Math.floor(rng.float() * items.length)];
  let r = rng.float() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Largest-remainder usulida N ta joyni bo'sh bo'lmagan guruhlarga taqsimlash. */
export function allocate(n: number, ratios: Record<Bucket, number>, available: Record<Bucket, boolean>): Record<Bucket, number> {
  const res: Record<Bucket, number> = { weak: 0, medium: 0, strong: 0 };
  const keys = (['weak', 'medium', 'strong'] as Bucket[]).filter((k) => available[k]);
  if (!keys.length || n <= 0) return res;
  let total = keys.reduce((s, k) => s + Math.max(0, ratios[k]), 0);
  const share = (k: Bucket) => (total > 0 ? Math.max(0, ratios[k]) / total : 1 / keys.length);
  if (total <= 0) total = keys.length;
  const parts = keys.map((k) => {
    const v = n * share(k);
    return { k, n: Math.floor(v), rem: v - Math.floor(v) };
  });
  let left = n - parts.reduce((s, p) => s + p.n, 0);
  parts.sort((a, b) => b.rem - a.rem);
  for (const p of parts) {
    if (left <= 0) break;
    p.n++;
    left--;
  }
  for (const p of parts) res[p.k] = p.n;
  return res;
}

/**
 * Shaxsiy mashq / kunlik test uchun savollar to'plami:
 *  1) vaqti kelgan takrorlash savollari (shu shablon, yangi sonlar bilan)
 *  2) ~60% zaif, ~25% o'rtacha, ~15% kuchli ko'nikmalar (sozlanadi)
 * Zaif ko'nikmalar (100 - mastery)^2 og'irlik bilan tanlanadi — xato qilingan ko'nikmadan ko'proq savol chiqadi.
 */
export function assembleAdaptiveSet(inp: AssembleInput): string[] {
  const { count, rng, masteryCfg } = inp;
  const excluded = new Set(inp.exclude ?? []);
  const templates = inp.templates.filter((t) => !excluded.has(t.id));
  const byId = new Map(templates.map((t) => [t.id, t]));
  const result: string[] = [];
  const used = new Set<string>();
  if (!templates.length || count <= 0) return result;

  const take = (id: string) => {
    result.push(id);
    used.add(id);
  };

  const maxReview = Math.floor(count * inp.ratios.reviewShareMax);
  for (const id of shuffle(inp.dueReviewTemplateIds, rng)) {
    if (result.length >= maxReview) break;
    if (byId.has(id) && !used.has(id)) take(id);
  }

  const m = (skill: string) => inp.mastery[skill] ?? masteryCfg.initial;
  const skills = [...new Set(templates.map((t) => t.skillId))];
  const bucketSkills: Record<Bucket, string[]> = { weak: [], medium: [], strong: [] };
  for (const s of skills) bucketSkills[bucketOf(m(s), masteryCfg)].push(s);

  const alloc = allocate(count - result.length, inp.ratios, {
    weak: bucketSkills.weak.length > 0,
    medium: bucketSkills.medium.length > 0,
    strong: bucketSkills.strong.length > 0,
  });

  const target = inp.userRating !== undefined ? inp.userRating + (inp.ratingOffset ?? -100) : undefined;
  const pickTemplate = (skill: string, bucket: Bucket): string | undefined => {
    let cands = templates.filter((t) => t.skillId === skill && !used.has(t.id));
    if (!cands.length) cands = templates.filter((t) => bucketSkills[bucket].includes(t.skillId) && !used.has(t.id));
    if (!cands.length) cands = templates.filter((t) => t.skillId === skill); // qayta ishlatish (yangi seed bilan)
    if (!cands.length) return undefined;
    if (target !== undefined) {
      const sorted = [...cands].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
      return sorted[Math.floor(rng.float() * Math.min(3, sorted.length))].id;
    }
    return cands[Math.floor(rng.float() * cands.length)].id;
  };

  for (const b of ['weak', 'medium', 'strong'] as Bucket[]) {
    for (let k = 0; k < alloc[b]; k++) {
      const skill = weighted(
        bucketSkills[b],
        (s) => (b === 'weak' ? (100 - m(s)) ** 2 : 1),
        rng,
      );
      if (!skill) break;
      const id = pickTemplate(skill, b);
      if (id) take(id);
    }
  }

  // yetmasa — istalgan foydalanilmagan shablon
  for (const t of shuffle(templates, rng)) {
    if (result.length >= count) break;
    if (!used.has(t.id)) take(t.id);
  }
  return shuffle(result.slice(0, count), rng);
}

/**
 * "Men uchun" rejimi: o'quvchi reytingi ± window oralig'idagi savollar, maqsad — reyting + offset
 * (offset = -100 => to'g'ri javob ehtimoli ~64%, eng samarali o'rganish zonasi).
 */
export function pickForMe(
  templates: TemplateRef[],
  userRating: number,
  count: number,
  rng: RandomSource,
  cfg: { window: number; offset: number },
): string[] {
  if (!templates.length) return [];
  let window = cfg.window;
  let cands = templates.filter((t) => Math.abs(t.rating - userRating) <= window);
  while (cands.length < count && cands.length < templates.length && window < 2000) {
    window += 100;
    cands = templates.filter((t) => Math.abs(t.rating - userRating) <= window);
  }
  if (!cands.length) cands = templates;
  const target = userRating + cfg.offset;
  const pool = [...cands];
  const res: string[] = [];
  while (res.length < count && pool.length) {
    const t = weighted(pool, (x) => 1 / (1 + Math.abs(x.rating - target) / 50), rng)!;
    res.push(t.id);
    pool.splice(pool.indexOf(t), 1);
  }
  while (res.length < count) res.push(cands[Math.floor(rng.float() * cands.length)].id);
  return res;
}
