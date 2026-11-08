/** Admin panelda tahrirlanadigan barcha sonli parametrlar (standart qiymatlar). */

export interface RatingTitle {
  name: string;
  min: number;
  color: string;
  icon: string;
}

export interface RatingConfig {
  initial: number;
  kProvisional: number;
  kStable: number;
  provisionalGames: number;
  questionK: number;
  questionKProvisional: number;
  questionProvisionalGames: number;
  min: number;
  max: number;
  speedBonus: { enabled: boolean; fastMs: number; maxBonus: number };
}

export interface MasteryConfig {
  initial: number;
  gainRate: number;
  lossRate: number;
  weakBelow: number;
  strongAbove: number;
}

export interface SrsConfig {
  intervalsDays: number[];
  removeAfterStreak: number;
}

export interface AutoTestConfig {
  weak: number;
  medium: number;
  strong: number;
  reviewShareMax: number;
}

export interface AppSettings {
  rating: RatingConfig;
  titles: RatingTitle[];
  /** [reyting, SAT ball] juftliklari — chiziqli interpolatsiya */
  ratingToSat: Array<[number, number]>;
  mastery: MasteryConfig;
  srs: SrsConfig;
  autoTest: AutoTestConfig;
  forMe: { window: number; offset: number };
  difficulty: { easyBelow: number; hardAbove: number; minGames: number };
  daily: { count: number; durationMin: number; reminderHour: number };
  rush: { lives: number; startOffset: number; stepPerCorrect: number };
  duel: { count: number; secondsPerQuestion: number; matchWindow: number };
  xp: { correct: number; wrong: number; dailyBonus: number; duelWin: number; testFinish: number };
  streak: { freezePerWeek: number };
  adaptive: { defaultThreshold: number };
}

export const DEFAULT_SETTINGS: AppSettings = {
  rating: {
    initial: 1200,
    kProvisional: 40,
    kStable: 20,
    provisionalGames: 20,
    questionK: 12,
    questionKProvisional: 24,
    questionProvisionalGames: 30,
    min: 100,
    max: 3000,
    speedBonus: { enabled: false, fastMs: 30000, maxBonus: 3 },
  },
  titles: [
    { name: 'Beginner', min: 0, color: '#94a3b8', icon: '🌱' },
    { name: 'Intermediate', min: 1000, color: '#22c55e', icon: '📘' },
    { name: 'Advanced', min: 1300, color: '#3b82f6', icon: '🚀' },
    { name: 'Expert', min: 1500, color: '#a855f7', icon: '💎' },
    { name: 'Master', min: 1700, color: '#f59e0b', icon: '👑' },
  ],
  ratingToSat: [
    [600, 400],
    [800, 600],
    [1000, 820],
    [1200, 1000],
    [1300, 1100],
    [1400, 1200],
    [1500, 1300],
    [1600, 1380],
    [1700, 1450],
    [1800, 1510],
    [2000, 1570],
    [2200, 1600],
  ],
  mastery: { initial: 40, gainRate: 0.15, lossRate: 0.25, weakBelow: 40, strongAbove: 75 },
  srs: { intervalsDays: [1, 3, 7, 14], removeAfterStreak: 3 },
  autoTest: { weak: 0.6, medium: 0.25, strong: 0.15, reviewShareMax: 0.4 },
  forMe: { window: 150, offset: -100 },
  difficulty: { easyBelow: 1100, hardAbove: 1350, minGames: 30 },
  daily: { count: 7, durationMin: 15, reminderHour: 20 },
  rush: { lives: 3, startOffset: -300, stepPerCorrect: 40 },
  duel: { count: 5, secondsPerQuestion: 90, matchWindow: 200 },
  xp: { correct: 10, wrong: 2, dailyBonus: 50, duelWin: 30, testFinish: 20 },
  streak: { freezePerWeek: 1 },
  adaptive: { defaultThreshold: 0.6 },
};

export type SettingsKey = keyof AppSettings;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Standart sozlamalar ustiga bazadagi qiymatlarni chuqur birlashtirish (massivlar butunlay almashtiriladi). */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T));
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = isPlainObject(b) && isPlainObject(v) ? deepMerge(b, v) : v;
  }
  return out as T;
}
