import type { RatingConfig, RatingTitle } from './settings';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Elo kutilgan natija: o'quvchi savolni to'g'ri yechish ehtimoli. */
export function expectedScore(player: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - player) / 400));
}

export function kFactor(games: number, cfg: RatingConfig): number {
  return games < cfg.provisionalGames ? cfg.kProvisional : cfg.kStable;
}

export function isProvisional(games: number, cfg: RatingConfig): boolean {
  return games < cfg.provisionalGames;
}

export interface EloInput {
  userRating: number;
  userGames: number;
  questionRating: number;
  questionGames: number;
  correct: boolean;
  timeMs?: number;
}

export interface EloResult {
  expected: number;
  /** O'quvchiga ko'rsatiladigan butun o'zgarish (+12 / -8) */
  userDelta: number;
  userRating: number;
  questionDelta: number;
  questionRating: number;
}

/**
 * Har bir savol — "o'yin": o'quvchi vs savol. To'g'ri javob — o'quvchi yutdi.
 * Yangi o'quvchilarda (provisional) K katta, reyting tezroq o'zgaradi.
 */
export function eloUpdate(inp: EloInput, cfg: RatingConfig): EloResult {
  const expected = expectedScore(inp.userRating, inp.questionRating);
  const s = inp.correct ? 1 : 0;
  let raw = kFactor(inp.userGames, cfg) * (s - expected);
  const sb = cfg.speedBonus;
  if (inp.correct && sb.enabled && inp.timeMs !== undefined && inp.timeMs >= 0 && inp.timeMs < sb.fastMs) {
    raw += sb.maxBonus * (1 - inp.timeMs / sb.fastMs);
  }
  let userDelta = Math.round(raw);
  if (inp.correct && userDelta < 1) userDelta = 1;
  if (!inp.correct && userDelta > -1) userDelta = -1;
  const userRating = clamp(inp.userRating + userDelta, cfg.min, cfg.max);

  // Yangi o'quvchi pastdan (800 dan) boshlaydi va hali o'z darajasiga yetmagan — uning javoblari
  // savol qiyinligini yarim kuch bilan o'zgartiradi, aks holda savollar reytingi asossiz pasayib ketadi
  const qkBase = inp.questionGames < cfg.questionProvisionalGames ? cfg.questionKProvisional : cfg.questionK;
  const qk = isProvisional(inp.userGames, cfg) ? qkBase / 2 : qkBase;
  const questionDelta = qk * ((1 - s) - (1 - expected));
  const questionRating = clamp(inp.questionRating + questionDelta, cfg.min, cfg.max);

  return { expected, userDelta: userRating - inp.userRating, userRating, questionDelta, questionRating };
}

export function titleFor(rating: number, titles: RatingTitle[]): RatingTitle {
  const sorted = [...titles].sort((a, b) => a.min - b.min);
  let t = sorted[0] ?? { name: '—', min: 0, color: '#999', icon: '' };
  for (const x of sorted) if (rating >= x.min) t = x;
  return t;
}

/** Jadval bo'yicha chiziqli interpolatsiya (yaxlitlanmagan). */
function interpolateSat(rating: number, table: Array<[number, number]>): number {
  const rows = [...table].sort((a, b) => a[0] - b[0]);
  if (rows.length === 0) return 400;
  if (rating <= rows[0][0]) return rows[0][1];
  if (rating >= rows[rows.length - 1][0]) return rows[rows.length - 1][1];
  let i = 0;
  while (rows[i + 1][0] < rating) i++;
  const [r0, s0] = rows[i];
  const [r1, s1] = rows[i + 1];
  return s0 + ((rating - r0) / (r1 - r0)) * (s1 - s0);
}

/** Reyting -> taxminiy SAT ball (400–1600), 10 ga yaxlitlangan. */
export function estimateSat(rating: number, table: Array<[number, number]>): number {
  return clamp(Math.round(interpolateSat(rating, table) / 10) * 10, 400, 1600);
}

export type RatingKind = 'OVERALL' | 'MATH' | 'RW';

/**
 * Reyting o'quvchiga SAT shkalasida ko'rsatiladi:
 *  - OVERALL — umumiy reyting 400–1600, aniq son (har javobdagi o'zgarish ko'rinsin);
 *  - MATH / RW — bo'lim bali 200–800, doim 10 ga karrali (ichki Elo qiymatining yarmi).
 */
export function ratingFactor(type: RatingKind): number {
  return type === 'OVERALL' ? 1 : 0.5;
}

const IDENTITY_TABLE: Array<[number, number]> = [
  [400, 400],
  [1600, 1600],
];

export function displayRating(type: RatingKind, rating: number, table: Array<[number, number]> = IDENTITY_TABLE): number {
  if (type === 'OVERALL') return clamp(Math.round(rating), 400, 1600);
  // Yaxlitlanmagan bahoning yarmi, keyin 10 ga (ikki marta yaxlitlash xatosisiz): 1517 -> 760, 1238 -> 620
  return clamp(Math.round(interpolateSat(rating, table) / 20) * 10, 200, 800);
}

/** Taxminiy SAT = Math bali + R&W bali (400–1600, doim 10 ga karrali). */
export function estimatedTotal(math: number, rw: number, table: Array<[number, number]> = IDENTITY_TABLE): number {
  return displayRating('MATH', math, table) + displayRating('RW', rw, table);
}

export type DifficultyLabel = 'EASY' | 'MEDIUM' | 'HARD';

/** Savolning amaldagi qiyinligi: yetarli statistika bo'lsa Elo reytingi bo'yicha, aks holda operator belgisi. */
export function effectiveDifficulty(
  t: { difficulty: DifficultyLabel; rating: number; ratingGames: number },
  cfg: { easyBelow: number; hardAbove: number; minGames: number },
): DifficultyLabel {
  if (t.ratingGames < cfg.minGames) return t.difficulty;
  if (t.rating < cfg.easyBelow) return 'EASY';
  if (t.rating > cfg.hardAbove) return 'HARD';
  return 'MEDIUM';
}

/** Operator belgisiga mos boshlang'ich savol reytingi. */
export function initialQuestionRating(d: DifficultyLabel): number {
  return d === 'EASY' ? 1000 : d === 'HARD' ? 1450 : 1200;
}

export function levelFromXp(xp: number): { level: number; current: number; next: number; progress: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const current = 50 * (level - 1) ** 2;
  const next = 50 * level ** 2;
  return { level, current, next, progress: (xp - current) / (next - current) };
}
