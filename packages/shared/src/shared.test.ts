import { describe, expect, it } from 'vitest';
import {
  allocate,
  applyDailyCompletion,
  assembleAdaptiveSet,
  bucketOf,
  DEFAULT_SETTINGS,
  deepMerge,
  displayRating,
  distributeByWeight,
  earnedAchievements,
  effectiveDifficulty,
  effectiveStreak,
  eloUpdate,
  estimateSat,
  estimatedTotal,
  expectedScore,
  levelFromXp,
  pickForMe,
  routeSecondModule,
  scaleScore,
  srsNext,
  tashkentDate,
  titleFor,
  updateMastery,
  type AchievementStats,
  type TemplateRef,
} from './index';

const S = DEFAULT_SETTINGS;

/** Testlar uchun deterministik RNG */
function seeded(seed: number) {
  let s = seed >>> 0;
  return {
    float() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

describe('Elo reyting', () => {
  it('teng reytingda kutilgan natija 0.5', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
    expect(expectedScore(1300, 1200)).toBeGreaterThan(0.5);
  });

  it("to'g'ri javob reytingni oshiradi, savol reytingini pasaytiradi", () => {
    const r = eloUpdate({ userRating: 1200, userGames: 50, questionRating: 1200, questionGames: 100, correct: true }, S.rating);
    expect(r.userDelta).toBe(10); // K=20 * 0.5
    expect(r.userRating).toBe(1210);
    expect(r.questionRating).toBeLessThan(1200);
  });

  it("noto'g'ri javob reytingni pasaytiradi, savol reytingi o'sadi (qiyinroq bo'ladi)", () => {
    const r = eloUpdate({ userRating: 1200, userGames: 50, questionRating: 1200, questionGames: 100, correct: false }, S.rating);
    expect(r.userDelta).toBe(-10);
    expect(r.questionRating).toBeGreaterThan(1200);
  });

  it("provisional o'quvchida reyting tezroq o'zgaradi", () => {
    const fresh = eloUpdate({ userRating: 1200, userGames: 0, questionRating: 1200, questionGames: 100, correct: true }, S.rating);
    const stable = eloUpdate({ userRating: 1200, userGames: 100, questionRating: 1200, questionGames: 100, correct: true }, S.rating);
    expect(fresh.userDelta).toBeGreaterThan(stable.userDelta);
  });

  it("qiyin savolni yechish ko'proq ball beradi", () => {
    const hard = eloUpdate({ userRating: 1200, userGames: 50, questionRating: 1500, questionGames: 100, correct: true }, S.rating);
    const easy = eloUpdate({ userRating: 1200, userGames: 50, questionRating: 900, questionGames: 100, correct: true }, S.rating);
    expect(hard.userDelta).toBeGreaterThan(easy.userDelta);
    expect(easy.userDelta).toBeGreaterThanOrEqual(1);
  });

  it('tezlik bonusi standart holatda o‘chiq, yoqilsa qo‘shiladi', () => {
    const base = { userRating: 1200, userGames: 50, questionRating: 1200, questionGames: 100, correct: true, timeMs: 3000 };
    const off = eloUpdate(base, S.rating);
    const on = eloUpdate(base, { ...S.rating, speedBonus: { enabled: true, fastMs: 30000, maxBonus: 3 } });
    expect(on.userDelta).toBeGreaterThan(off.userDelta);
  });

  it('unvon va taxminiy SAT ball (SAT shkalasi)', () => {
    expect(titleFor(850, S.titles).name).toBe('Beginner');
    expect(titleFor(1000, S.titles).name).toBe('Intermediate');
    expect(titleFor(1500, S.titles).name).toBe('Master');
    expect(Math.max(...S.titles.map((t) => t.min))).toBeLessThanOrEqual(1600);
    expect(estimateSat(1203, S.ratingToSat)).toBe(1200);
    expect(estimateSat(1256, S.ratingToSat)).toBe(1260);
    expect(estimateSat(5000, S.ratingToSat)).toBe(1600);
  });

  it("reyting 400–1600 dan chiqmaydi, bo'lim 200–800 ko'rinishida", () => {
    const top = eloUpdate({ userRating: 1600, userGames: 50, questionRating: 1450, questionGames: 100, correct: true }, S.rating);
    expect(top.userRating).toBe(1600);
    const low = eloUpdate({ userRating: 400, userGames: 50, questionRating: 1000, questionGames: 100, correct: false }, S.rating);
    expect(low.userRating).toBe(400);
    expect(displayRating('OVERALL', 1700)).toBe(1600);
    expect(displayRating('OVERALL', 963)).toBe(963); // umumiy reyting aniq son
    expect(displayRating('MATH', 1213, S.ratingToSat)).toBe(610); // 606.5 -> 610
    expect(displayRating('RW', 1026, S.ratingToSat)).toBe(510); // 513 -> 510, ikki marta yaxlitlanmaydi
    expect(displayRating('RW', 300)).toBe(200);
  });

  it("yangi o'quvchi: Math 400, R&W 400 (jami 800) dan boshlaydi; har bo'lim 200–800", () => {
    const start = S.rating.initial;
    expect(displayRating('MATH', start, S.ratingToSat)).toBe(400);
    expect(displayRating('RW', start, S.ratingToSat)).toBe(400);
    expect(displayRating('OVERALL', start, S.ratingToSat)).toBe(800);
    expect(estimatedTotal(start, start, S.ratingToSat)).toBe(800);
    expect(displayRating('MATH', S.rating.min, S.ratingToSat)).toBe(200);
    expect(displayRating('RW', S.rating.max, S.ratingToSat)).toBe(800);
    expect(titleFor(start, S.titles).name).toBe('Beginner');
  });

  it("yangi (provisional) o'quvchi savol qiyinligini yarim kuch bilan o'zgartiradi", () => {
    const fresh = eloUpdate({ userRating: 800, userGames: 0, questionRating: 1000, questionGames: 100, correct: true }, S.rating);
    const stable = eloUpdate({ userRating: 800, userGames: 100, questionRating: 1000, questionGames: 100, correct: true }, S.rating);
    expect(fresh.questionDelta).toBeLessThan(0);
    expect(fresh.questionDelta).toBeCloseTo(stable.questionDelta / 2);
    expect(fresh.userDelta).toBeGreaterThan(stable.userDelta); // o'quvchining o'zi esa tezroq ko'tariladi
  });

  it('taxminiy SAT = Math + R&W, ballar doim 0 bilan tugaydi', () => {
    // Math 758.5 -> 760, R&W 619 -> 620, jami 1380
    expect(estimatedTotal(1517, 1238, S.ratingToSat)).toBe(1380);
    for (let m = 400; m <= 1600; m += 37) {
      for (let r = 400; r <= 1600; r += 41) {
        const total = estimatedTotal(m, r, S.ratingToSat);
        expect(total % 10).toBe(0);
        expect(total).toBeGreaterThanOrEqual(400);
        expect(total).toBeLessThanOrEqual(1600);
        expect(total).toBe(displayRating('MATH', m, S.ratingToSat) + displayRating('RW', r, S.ratingToSat));
      }
    }
  });

  it('amaldagi qiyinlik: statistika yetarli bo‘lsa reyting bo‘yicha', () => {
    expect(effectiveDifficulty({ difficulty: 'EASY', rating: 1500, ratingGames: 5 }, S.difficulty)).toBe('EASY');
    expect(effectiveDifficulty({ difficulty: 'EASY', rating: 1500, ratingGames: 50 }, S.difficulty)).toBe('HARD');
  });

  it('XP darajasi', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(50).level).toBe(2);
    expect(levelFromXp(200).level).toBe(3);
  });
});

describe('Mastery', () => {
  it('xato pasaytiradi, to‘g‘ri oshiradi, 0..100 oralig‘ida', () => {
    expect(updateMastery(undefined, false, S.mastery)).toBe(30);
    expect(updateMastery(40, true, S.mastery)).toBe(49);
    let m = 50;
    for (let i = 0; i < 200; i++) m = updateMastery(m, true, S.mastery);
    expect(m).toBeLessThanOrEqual(100);
    for (let i = 0; i < 200; i++) m = updateMastery(m, false, S.mastery);
    expect(m).toBeGreaterThanOrEqual(0);
  });

  it('3 ta xatodan keyin ko‘nikma "zaif" bo‘ladi', () => {
    let m: number | undefined;
    for (let i = 0; i < 3; i++) m = updateMastery(m, false, S.mastery);
    expect(bucketOf(m!, S.mastery)).toBe('weak');
    expect(bucketOf(S.mastery.initial, S.mastery)).toBe('medium');
  });
});

describe('Spaced repetition', () => {
  const now = new Date('2026-01-10T10:00:00Z');
  const day = 86_400_000;

  it('xato — 1 kundan keyin takrorlash', () => {
    const r = srsNext(null, false, now, S.srs);
    expect(r).toEqual({ action: 'upsert', stage: 0, streak: 0, dueAt: new Date(now.getTime() + day) });
  });

  it("vaqti kelgan to'g'ri javob — keyingi bosqich (3, 7 kun)", () => {
    const r1 = srsNext({ stage: 0, streak: 0, dueAt: now }, true, now, S.srs);
    expect(r1).toEqual({ action: 'upsert', stage: 1, streak: 1, dueAt: new Date(now.getTime() + 3 * day) });
    const r2 = srsNext({ stage: 1, streak: 1, dueAt: now }, true, now, S.srs);
    expect(r2).toEqual({ action: 'upsert', stage: 2, streak: 2, dueAt: new Date(now.getTime() + 7 * day) });
  });

  it("ketma-ket 3 marta to'g'ri — navbatdan chiqadi", () => {
    expect(srsNext({ stage: 2, streak: 2, dueAt: now }, true, now, S.srs)).toEqual({ action: 'remove' });
  });

  it('vaqti kelmagan to‘g‘ri javob hisobga olinmaydi (force bo‘lmasa)', () => {
    const future = new Date(now.getTime() + 2 * day);
    expect(srsNext({ stage: 0, streak: 0, dueAt: future }, true, now, S.srs)).toEqual({ action: 'none' });
    expect(srsNext({ stage: 0, streak: 0, dueAt: future }, true, now, S.srs, true).action).toBe('upsert');
  });

  it('xato seriyani nolga tushiradi', () => {
    const r = srsNext({ stage: 2, streak: 2, dueAt: now }, false, now, S.srs);
    expect(r).toMatchObject({ action: 'upsert', stage: 0, streak: 0 });
  });
});

describe("Avtomatik test yig'ish", () => {
  const skills = ['S1', 'S2', 'S3', 'S4'];
  const templates: TemplateRef[] = skills.flatMap((s) =>
    Array.from({ length: 6 }, (_, i) => ({ id: `${s}-T${i}`, skillId: s, rating: 1100 + i * 40 })),
  );

  function shareOf(skill: string, mastery: Record<string, number>, due: string[] = []) {
    let hit = 0;
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const ids = assembleAdaptiveSet({
        count: 10,
        templates,
        mastery,
        dueReviewTemplateIds: due,
        ratios: S.autoTest,
        masteryCfg: S.mastery,
        rng: seeded(seed),
      });
      total += ids.length;
      hit += ids.filter((id) => id.startsWith(`${skill}-`)).length;
    }
    return hit / total;
  }

  it("bir skilldan 3 marta xato qilinsa, keyingi avto-testda shu skill ulushi oshadi", () => {
    const before = shareOf('S2', {});
    let m: number | undefined;
    for (let i = 0; i < 3; i++) m = updateMastery(m, false, S.mastery);
    const after = shareOf('S2', { S2: m! });
    expect(before).toBeGreaterThan(0.15);
    expect(before).toBeLessThan(0.35);
    expect(after).toBeGreaterThan(before + 0.2);
    expect(after).toBeGreaterThanOrEqual(0.5); // ~60% zaif ko'nikmaga
  });

  it("60/25/15 nisbat: zaif, o'rtacha, kuchli ko'nikmalar", () => {
    const mastery = { S1: 10, S2: 55, S3: 60, S4: 95 };
    const sh = { S1: shareOf('S1', mastery), mid: shareOf('S2', mastery) + shareOf('S3', mastery), S4: shareOf('S4', mastery) };
    expect(sh.S1).toBeCloseTo(0.6, 1);
    expect(sh.mid).toBeCloseTo(0.25, 1);
    expect(sh.S4).toBeCloseTo(0.15, 1);
  });

  it('vaqti kelgan takrorlash savollari birinchi bo‘lib kiradi (yangi seed bilan)', () => {
    const ids = assembleAdaptiveSet({
      count: 10,
      templates,
      mastery: {},
      dueReviewTemplateIds: ['S3-T1', 'S4-T2'],
      ratios: S.autoTest,
      masteryCfg: S.mastery,
      rng: seeded(7),
    });
    expect(ids).toContain('S3-T1');
    expect(ids).toContain('S4-T2');
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });

  it('allocate: bo‘sh guruh ulushi boshqalarga o‘tadi', () => {
    expect(allocate(10, S.autoTest, { weak: false, medium: true, strong: false })).toEqual({ weak: 0, medium: 10, strong: 0 });
    const a = allocate(10, S.autoTest, { weak: true, medium: true, strong: true });
    expect(a.weak + a.medium + a.strong).toBe(10);
    expect(a.weak).toBe(6);
  });

  it('"Men uchun": reyting ±150 atrofidagi savollar', () => {
    const many: TemplateRef[] = Array.from({ length: 60 }, (_, i) => ({ id: `T${i}`, skillId: 'S', rating: 800 + i * 20 }));
    const ids = pickForMe(many, 1300, 8, seeded(3), S.forMe);
    expect(ids).toHaveLength(8);
    for (const id of ids) {
      const r = many.find((t) => t.id === id)!.rating;
      expect(Math.abs(r - 1300)).toBeLessThanOrEqual(150);
    }
  });
});

describe('Ball va adaptiv modul', () => {
  it('2-modul yo‘nalishi chegaraga qarab', () => {
    expect(routeSecondModule(17, 27, 0.6)).toBe('HARD');
    expect(routeSecondModule(10, 27, 0.6)).toBe('EASY');
  });

  it('shkala jadvali va interpolatsiya', () => {
    const rows = [
      { raw: 0, scaled: 200 },
      { raw: 10, scaled: 400 },
      { raw: 20, scaled: 600 },
    ];
    expect(scaleScore(10, rows, 20, 'HARD')).toBe(400);
    expect(scaleScore(15, rows, 20, 'HARD')).toBe(500);
    expect(scaleScore(54, [], 54, 'HARD')).toBe(800);
    expect(scaleScore(54, [], 54, 'EASY')).toBe(640);
  });

  it('domen ulushlari bo‘yicha taqsimlash', () => {
    const d = distributeByWeight(22, [
      { id: 'A', weight: 0.35 },
      { id: 'B', weight: 0.35 },
      { id: 'C', weight: 0.15 },
      { id: 'D', weight: 0.15 },
    ]);
    expect(Object.values(d).reduce((s, x) => s + x, 0)).toBe(22);
  });
});

describe('Streak', () => {
  const base = { current: 0, best: 0, lastDate: null, freezeUsedAt: null };

  it('ketma-ket kunlar', () => {
    let s = applyDailyCompletion(base, '2026-03-01').state;
    s = applyDailyCompletion(s, '2026-03-02').state;
    s = applyDailyCompletion(s, '2026-03-03').state;
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(effectiveStreak(s, '2026-03-04')).toBe(3);
  });

  it('bitta kun o‘tkazib yuborilsa — freeze (haftasiga 1 marta)', () => {
    let s = applyDailyCompletion(base, '2026-03-01').state;
    s = applyDailyCompletion(s, '2026-03-02').state;
    const r = applyDailyCompletion(s, '2026-03-04');
    expect(r.freezeUsed).toBe(true);
    expect(r.state.current).toBe(3);
    const r2 = applyDailyCompletion(r.state, '2026-03-06'); // yana o'tkazib yubordi, freeze ishlatilgan
    expect(r2.freezeUsed).toBe(false);
    expect(r2.state.current).toBe(1);
  });

  it('Toshkent sanasi (UTC+5)', () => {
    expect(tashkentDate(new Date('2026-05-01T19:30:00Z'))).toBe('2026-05-02');
    expect(tashkentDate(new Date('2026-05-01T18:59:00Z'))).toBe('2026-05-01');
  });
});

describe('Yutuqlar va sozlamalar', () => {
  it('statistikaga qarab yutuqlar', () => {
    const stats: AchievementStats = {
      answered: 120,
      correct: 80,
      streakBest: 7,
      peakRating: 1410,
      rushBest: 5,
      duelWins: 0,
      perfectDaily: false,
      mockBest: 0,
      domainMastery: { MATH_ALG: { avg: 90, answered: 40 } },
    };
    const codes = earnedAchievements(stats);
    expect(codes).toEqual(expect.arrayContaining(['FIRST_STEP', 'Q100', 'STREAK7', 'R1400', 'ALGEBRA_MASTER']));
    expect(codes).not.toContain('DUEL_WIN');
  });

  it('deepMerge: bazadagi qiymatlar standartni almashtiradi', () => {
    const merged = deepMerge(S, { rating: { kStable: 16 }, srs: { intervalsDays: [1, 2] } });
    expect(merged.rating.kStable).toBe(16);
    expect(merged.rating.kProvisional).toBe(40);
    expect(merged.srs.intervalsDays).toEqual([1, 2]);
  });
});
