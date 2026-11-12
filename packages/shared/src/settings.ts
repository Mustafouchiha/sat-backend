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
  ai: AiConfig;
}

/** AI (Claude) sozlamalari. Kalit — Railway'dagi ANTHROPIC_API_KEY; bu yerda faqat modellar va cheklovlar. */
export interface AiConfig {
  /** AI ustoz (chat) Mini App va botda ishlaydimi */
  chatEnabled: boolean;
  /** Chat modeli: claude-sonnet-5-5 (tavsiya), claude-haiku-5-5 (eng arzon), claude-opus-5-5 (eng kuchli) */
  chatModel: string;
  /** O'quvchi bir kunda nechta xabar yoza oladi (o'qituvchi va admin uchun cheklov yo'q) */
  chatDailyLimit: number;
  /** Savol yaratish modeli — sifat muhim */
  genModel: string;
  /** Yaratilgan savolni javobini ko'rmasdan yechib tekshiradigan model */
  verifyModel: string;
  /** Tekshiruvdan o'tgan AI savollari darhol bankka qo'shiladi; o'chirilsa — "Tekshiruvda" holatida admin tasdiqlaydi */
  autoPublish: boolean;
  /** O'quvchi uchun ko'rilmagan savol qolmasa, AI shu mavzuga avtomatik yangi savollar yaratadi */
  autoRefill: boolean;
  /** Avtomatik to'ldirish: kuniga ko'pi bilan nechta vazifa (har biri ~5 savol) */
  refillDailyJobs: number;
  /** O'quvchi «AI yangi savollar» tugmasi bilan kuniga necha marta savol yarata oladi */
  studentDailyJobs: number;
  /** Kunlik AI xarajati chegarasi (USD, chat + savol yaratish). Yetganda AI ertagacha to'xtaydi; 0 — cheklovsiz */
  dailyBudgetUsd: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  // Reyting SAT shkalasida: umumiy 400–1600 (Math va R&W ko'rsatishda 200–800).
  // Yangi o'quvchi 800 dan boshlaydi: har bir bo'limda 400 (eng past 200, eng yuqori 800).
  rating: {
    initial: 800,
    kProvisional: 40,
    kStable: 20,
    provisionalGames: 20,
    questionK: 12,
    questionKProvisional: 24,
    questionProvisionalGames: 30,
    min: 400,
    max: 1600,
    speedBonus: { enabled: false, fastMs: 30000, maxBonus: 3 },
  },
  titles: [
    { name: 'Beginner', min: 400, color: '#94a3b8', icon: '🌱' },
    { name: 'Intermediate', min: 900, color: '#22c55e', icon: '📘' },
    { name: 'Advanced', min: 1100, color: '#3b82f6', icon: '🚀' },
    { name: 'Expert', min: 1300, color: '#a855f7', icon: '💎' },
    { name: 'Master', min: 1450, color: '#f59e0b', icon: '👑' },
  ],
  // Reyting allaqachon SAT shkalasida, shuning uchun taxminiy ball = reyting (10 ga yaxlitlanadi).
  ratingToSat: [
    [400, 400],
    [1600, 1600],
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
  ai: {
    chatEnabled: true,
    chatModel: 'claude-sonnet-5-5',
    chatDailyLimit: 30,
    genModel: 'claude-opus-5-5',
    verifyModel: 'claude-sonnet-5-5',
    autoPublish: true,
    autoRefill: true,
    refillDailyJobs: 10,
    studentDailyJobs: 3,
    dailyBudgetUsd: 5,
  },
};

/** Admin panelda tanlanadigan Claude modellari (narx: 1 mln token uchun, kirish / chiqish). */
export const AI_MODELS: Array<{ id: string; name: string; inUsd: number; outUsd: number; cacheReadUsd: number }> = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 — eng kuchli', inUsd: 4, outUsd: 20, cacheReadUsd: 0.2 },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 — tavsiya', inUsd: 2, outUsd: 10, cacheReadUsd: 0.1 },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 — eng arzon', inUsd: 0.1, outUsd: 0.5, cacheReadUsd: 0.01 },
];

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
