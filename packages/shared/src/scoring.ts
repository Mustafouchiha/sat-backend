export type ModuleVariantName = 'STANDARD' | 'EASY' | 'HARD';

/** Adaptiv rejim: 1-modulda ulush >= threshold bo'lsa 2-modul qiyin, aks holda oson. */
export function routeSecondModule(correct: number, total: number, threshold: number): 'HARD' | 'EASY' {
  return total > 0 && correct / total >= threshold ? 'HARD' : 'EASY';
}

export interface ScaleRow {
  raw: number;
  scaled: number;
}

const round10 = (x: number) => Math.round(x / 10) * 10;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Jadval bo'lmasa ishlatiladigan zaxira formula. Oson yo'nalishda maksimal ball cheklangan. */
export function fallbackScaled(raw: number, maxRaw: number, variant: ModuleVariantName): number {
  if (maxRaw <= 0) return 200;
  const share = clamp(raw / maxRaw, 0, 1);
  const span = variant === 'EASY' ? 440 : 600;
  return clamp(round10(200 + span * share), 200, 800);
}

/** Xom ball -> shkala ball (200–800). Jadvalda bo'lmagan qiymat qo'shnilar orasida interpolatsiya qilinadi. */
export function scaleScore(raw: number, rows: ScaleRow[], maxRaw: number, variant: ModuleVariantName): number {
  if (!rows.length) return fallbackScaled(raw, maxRaw, variant);
  const sorted = [...rows].sort((a, b) => a.raw - b.raw);
  // Admin jadvalga 613 kabi qiymat yozgan bo'lsa ham ball 10 ga karrali chiqadi
  const exact = sorted.find((r) => r.raw === raw);
  if (exact) return clamp(round10(exact.scaled), 200, 800);
  if (raw <= sorted[0].raw) return clamp(round10(sorted[0].scaled), 200, 800);
  const last = sorted[sorted.length - 1];
  if (raw >= last.raw) return clamp(round10(last.scaled), 200, 800);
  let i = 0;
  while (sorted[i + 1].raw < raw) i++;
  const a = sorted[i];
  const b = sorted[i + 1];
  return clamp(round10(a.scaled + ((raw - a.raw) / (b.raw - a.raw)) * (b.scaled - a.scaled)), 200, 800);
}

/** Seed uchun standart shkala jadvali (admin keyin tahrirlaydi). */
export function defaultScaleRows(maxRaw: number, variant: ModuleVariantName): ScaleRow[] {
  const rows: ScaleRow[] = [];
  for (let raw = 0; raw <= maxRaw; raw++) rows.push({ raw, scaled: fallbackScaled(raw, maxRaw, variant) });
  return rows;
}

// ───────────────────────── Streak ─────────────────────────

export interface StreakState {
  current: number;
  best: number;
  lastDate: string | null;
  freezeUsedAt: string | null;
}

function toUtcDay(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day) / 86_400_000;
}

export function dayDiff(from: string, to: string): number {
  return Math.round(toUtcDay(to) - toUtcDay(from));
}

export function canFreeze(freezeUsedAt: string | null, today: string): boolean {
  return !freezeUsedAt || dayDiff(freezeUsedAt, today) >= 7;
}

/** Kunlik test bajarilganda seriyani yangilash. Bitta o'tkazib yuborilgan kun — haftasiga 1 marta "freeze". */
export function applyDailyCompletion(s: StreakState, today: string): { state: StreakState; freezeUsed: boolean } {
  if (s.lastDate === today) return { state: s, freezeUsed: false };
  let current = 1;
  let freezeUsed = false;
  let freezeUsedAt = s.freezeUsedAt;
  if (s.lastDate) {
    const gap = dayDiff(s.lastDate, today);
    if (gap === 1) current = s.current + 1;
    else if (gap === 2 && canFreeze(s.freezeUsedAt, today)) {
      current = s.current + 1;
      freezeUsed = true;
      freezeUsedAt = today;
    }
  }
  return { state: { current, best: Math.max(s.best, current), lastDate: today, freezeUsedAt }, freezeUsed };
}

/** Ko'rsatish uchun joriy seriya (uzilgan bo'lsa 0). */
export function effectiveStreak(s: StreakState | null, today: string): number {
  if (!s?.lastDate) return 0;
  const gap = dayDiff(s.lastDate, today);
  if (gap <= 1) return s.current;
  if (gap === 2 && canFreeze(s.freezeUsedAt, today)) return s.current;
  return 0;
}

/** Asia/Tashkent (UTC+5, yozgi vaqt yo'q) bo'yicha sana: YYYY-MM-DD */
export function tashkentDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Toshkent vaqti bilan kun boshlanishi (UTC Date). */
export function tashkentDayStart(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 5 * 3_600_000);
}
