import { generateVariant, isAnswerCorrect, parseSpec, runChecks } from '@sat/generator';
import { TAXONOMY } from '@sat/shared';
import { describe, expect, it } from 'vitest';
import { MATH_TEMPLATES } from '../prisma/seed-data/math';
import { RW_TEMPLATES } from '../prisma/seed-data/rw';

const ALL = [...MATH_TEMPLATES, ...RW_TEMPLATES];

describe('seed shablonlari', () => {
  it("har bir Math domenida kamida 5 ta, R&W da kamida 5 ta shablon", () => {
    for (const d of TAXONOMY.filter((x) => x.section === 'MATH')) {
      expect(MATH_TEMPLATES.filter((t) => t.domainId === d.id).length, d.id).toBeGreaterThanOrEqual(5);
    }
    expect(RW_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it("taksonomiya to'g'ri (ko'nikma domenga tegishli)", () => {
    for (const t of ALL) {
      const d = TAXONOMY.find((x) => x.id === t.domainId);
      expect(d, t.title).toBeTruthy();
      expect(d!.section).toBe(t.section);
      expect(d!.skills.some((s) => s.id === t.skillId), t.title).toBe(true);
    }
  });

  for (const t of ALL) {
    it(`500 ta variant tekshiruvi: ${t.title}`, () => {
      const spec = parseSpec(t.spec);
      const names = [...spec.variables.map((v) => v.name), ...spec.derived.map((d) => d.name)];
      // e'lon qilingan nom {nom} yoki {nom|format} ko'rinishida to'ldirilmay qolmasin (\begin{aligned} kabi LaTeX hisobga olinmaydi)
      const leftover = new RegExp(`\\{(${names.join('|') || '__none__'})(\\.\\d+)?(\\|[a-z0-9]+)*\\}`);
      const report = runChecks(spec, 500);
      if (!report.ok) console.error(t.title, report.errors, report.rejections);
      expect(report.ok, `${t.title}: ${report.errors.join('; ')}`).toBe(true);
      expect(report.successes).toBe(500);
      expect(report.avgAttempts).toBeLessThan(25);
      // to'g'ri javob o'zi bilan tekshiriladi
      for (let seed = 1; seed <= 30; seed++) {
        const v = generateVariant(spec, seed * 7919);
        const answer = v.type === 'MCQ' ? v.correctLabel! : v.correctDisplay.split(', ')[0];
        expect(isAnswerCorrect(v, answer), `${t.title} seed ${seed}`).toBe(true);
        for (const text of [v.stem, v.passage ?? '', v.explanation ?? '', ...(v.choices ?? []).map((c) => c.text)]) {
          expect(text, t.title).not.toMatch(leftover);
          expect(text).not.toContain('NaN');
          expect(text).not.toContain('{=');
        }
      }
    });
  }
});
