export interface AchievementStats {
  answered: number;
  correct: number;
  streakBest: number;
  peakRating: number;
  rushBest: number;
  duelWins: number;
  perfectDaily: boolean;
  mockBest: number;
  /** domainId -> { o'rtacha mastery, javoblar soni } */
  domainMastery: Record<string, { avg: number; answered: number }>;
}

export interface AchievementDef {
  code: string;
  name: string;
  description: string;
  icon: string;
  check: (s: AchievementStats) => boolean;
}

const domainMaster = (domainId: string) => (s: AchievementStats) => {
  const d = s.domainMastery[domainId];
  return !!d && d.answered >= 20 && d.avg >= 85;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'FIRST_STEP', name: 'Birinchi qadam', description: 'Birinchi savolni yechdingiz', icon: '👣', check: (s) => s.answered >= 1 },
  { code: 'Q100', name: '100 savol', description: '100 ta savolga javob berdingiz', icon: '💯', check: (s) => s.answered >= 100 },
  { code: 'Q500', name: '500 savol', description: '500 ta savolga javob berdingiz', icon: '🏋️', check: (s) => s.answered >= 500 },
  { code: 'Q1000', name: '1000 savol', description: '1000 ta savol — haqiqiy mehnatkash', icon: '🏆', check: (s) => s.answered >= 1000 },
  { code: 'STREAK3', name: '3 kunlik seriya', description: '3 kun ketma-ket kunlik test', icon: '🔥', check: (s) => s.streakBest >= 3 },
  { code: 'STREAK7', name: '7 kunlik streak', description: '7 kun ketma-ket kunlik test', icon: '🔥', check: (s) => s.streakBest >= 7 },
  { code: 'STREAK30', name: '30 kunlik streak', description: 'Bir oy uzluksiz', icon: '☄️', check: (s) => s.streakBest >= 30 },
  { code: 'R1300', name: 'Birinchi 1300+', description: 'Reyting 1300 dan oshdi', icon: '🚀', check: (s) => s.peakRating >= 1300 },
  { code: 'R1400', name: 'Birinchi 1400+', description: 'Reyting 1400 dan oshdi', icon: '⭐', check: (s) => s.peakRating >= 1400 },
  { code: 'R1500', name: 'Expert', description: 'Reyting 1500 dan oshdi', icon: '💎', check: (s) => s.peakRating >= 1500 },
  { code: 'R1700', name: 'Master', description: 'Reyting 1700 dan oshdi', icon: '👑', check: (s) => s.peakRating >= 1700 },
  { code: 'ALGEBRA_MASTER', name: 'Algebra ustasi', description: "Algebra bo'yicha o'zlashtirish 85%+", icon: '🧮', check: domainMaster('MATH_ALG') },
  { code: 'ADV_MATH_MASTER', name: 'Advanced Math ustasi', description: "Advanced Math bo'yicha 85%+", icon: '📈', check: domainMaster('MATH_ADV') },
  { code: 'DATA_MASTER', name: 'Data tahlilchisi', description: "Problem-Solving & Data Analysis 85%+", icon: '📊', check: domainMaster('MATH_PSDA') },
  { code: 'GEO_MASTER', name: 'Geometriya ustasi', description: "Geometry & Trigonometry 85%+", icon: '📐', check: domainMaster('MATH_GEO') },
  { code: 'GRAMMAR_MASTER', name: 'Grammatika ustasi', description: 'Standard English Conventions 85%+', icon: '✍️', check: domainMaster('RW_SEC') },
  { code: 'RUSH20', name: 'Puzzle Rush: 20', description: "Puzzle Rush'da 20+ to'g'ri javob", icon: '⚡', check: (s) => s.rushBest >= 20 },
  { code: 'DUEL_WIN', name: "Birinchi g'alaba", description: "Duelda birinchi g'alaba", icon: '⚔️', check: (s) => s.duelWins >= 1 },
  { code: 'DUEL_10', name: 'Duelchi', description: "10 ta duel g'alabasi", icon: '🥇', check: (s) => s.duelWins >= 10 },
  { code: 'PERFECT_DAILY', name: 'Mukammal kun', description: "Kunlik testni xatosiz yechdingiz", icon: '🎯', check: (s) => s.perfectDaily },
  { code: 'MOCK1400', name: 'Mock 1400+', description: "To'liq mock testda 1400+ ball", icon: '🎓', check: (s) => s.mockBest >= 1400 },
];

export function earnedAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(stats)).map((a) => a.code);
}
