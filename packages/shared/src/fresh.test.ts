import { describe, expect, it } from 'vitest';
import { assembleAdaptiveSet, DEFAULT_SETTINGS, freshFirst, pickForMe, type TemplateRef } from './index';

const rng = (seed = 1) => {
  let s = seed;
  return { float: () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 };
};

const t = (id: string, skillId = 'S1', rating = 1200): TemplateRef => ({ id, skillId, rating }) as TemplateRef;

describe("Bitta savol qaytib tushmasin", () => {
  it("freshFirst: avval ko'rilmaganlar, keyin eng uzoq vaqt oldin ko'rilganlar", () => {
    const items = [t('a'), t('b'), t('c'), t('d')];
    const seen = new Map([
      ['a', 300],
      ['c', 100],
    ]);
    const out = freshFirst(items, seen, rng()).map((x) => x.id);
    expect(out.slice(0, 2).sort()).toEqual(['b', 'd']);
    expect(out.slice(2)).toEqual(['c', 'a']);
    expect(freshFirst(items, undefined, rng())).toHaveLength(4);
  });

  it("pickForMe: ko'rilmaganlar yetarli bo'lsa faqat ulardan", () => {
    const items = Array.from({ length: 20 }, (_, i) => t(`q${i}`, 'S1', 1100 + i * 10));
    const seen = new Map(items.slice(0, 10).map((x, i) => [x.id, i]));
    for (let k = 0; k < 20; k++) {
      const ids = pickForMe(items, 1200, 5, rng(k + 1), DEFAULT_SETTINGS.forMe, seen);
      expect(ids).toHaveLength(5);
      expect(ids.every((id) => !seen.has(id))).toBe(true);
    }
  });

  it("pickForMe: yangilari kam — hammasi olinadi, qolgani eng eski ko'rilganlardan", () => {
    const items = Array.from({ length: 30 }, (_, i) => t(`q${i}`));
    const seen = new Map(items.slice(0, 28).map((x, i) => [x.id, i]));
    const ids = pickForMe(items, 1200, 5, rng(3), DEFAULT_SETTINGS.forMe, seen);
    expect(ids).toHaveLength(5);
    expect(ids).toContain('q28');
    expect(ids).toContain('q29');
    // qolgan 3 tasi eng eski 15 tadan (q0..q14)
    for (const id of ids.filter((x) => x !== 'q28' && x !== 'q29')) expect(Number(id.slice(1))).toBeLessThan(15);
  });

  it("assembleAdaptiveSet: avoid'dagi savollar yangilari bor ekan tanlanmaydi", () => {
    const templates = [t('a1', 'A'), t('a2', 'A'), t('a3', 'A'), t('b1', 'B'), t('b2', 'B'), t('b3', 'B')];
    const avoid = new Set(['a1', 'a2', 'b1']);
    for (let k = 0; k < 10; k++) {
      const exhausted = new Set<string>();
      const ids = assembleAdaptiveSet({
        count: 3,
        templates,
        mastery: { A: 20, B: 80 },
        dueReviewTemplateIds: [],
        ratios: DEFAULT_SETTINGS.autoTest,
        masteryCfg: DEFAULT_SETTINGS.mastery,
        rng: rng(k + 7),
        avoid,
        onExhausted: (s) => exhausted.add(s),
      });
      expect(ids.sort()).toEqual(['a3', 'b2', 'b3']);
      // zaif A mavzusida yangi savol tugadi — AI to'ldirishi uchun xabar
      expect([...exhausted]).toEqual(['A']);
    }
  });

  it("assembleAdaptiveSet: yangi savol umuman qolmasa — eng kam ko'rilganlardan to'ldiradi", () => {
    const templates = [t('a1', 'A'), t('a2', 'A')];
    const ids = assembleAdaptiveSet({
      count: 2,
      templates,
      mastery: {},
      dueReviewTemplateIds: [],
      ratios: DEFAULT_SETTINGS.autoTest,
      masteryCfg: DEFAULT_SETTINGS.mastery,
      rng: rng(2),
      avoid: new Set(['a1', 'a2']),
    });
    expect(ids.sort()).toEqual(['a1', 'a2']);
  });

  it("AI sozlamalari: standart modellar va cheklovlar", () => {
    expect(DEFAULT_SETTINGS.ai.chatModel).toBe('claude-sonnet-5-5');
    expect(DEFAULT_SETTINGS.ai.genModel).toBe('claude-opus-5-5');
    expect(DEFAULT_SETTINGS.ai.chatDailyLimit).toBeGreaterThan(0);
  });
});
