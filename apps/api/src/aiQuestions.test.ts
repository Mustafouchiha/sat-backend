import { generateVariant, isAnswerCorrect } from '@sat/generator';
import { beforeAll, describe, expect, it } from 'vitest';

// env.ts DATABASE_URL va JWT_SECRET'ni talab qiladi — soxta qiymatlar (bazaga ulanilmaydi)
let q: typeof import('./lib/aiQuestions');
let tutor: typeof import('./lib/aiTutor');
let catalog: typeof import('./lib/catalog');
let fresh: typeof import('./lib/fresh');
beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://test@localhost:5432/test';
  process.env.JWT_SECRET ??= 'test-secret-0123456789';
  q = await import('./lib/aiQuestions');
  tutor = await import('./lib/aiTutor');
  catalog = await import('./lib/catalog');
  fresh = await import('./lib/fresh');
}, 60_000);

type Gen = import('./lib/aiQuestions').GenQuestionT;

const rw = (over: Partial<Gen> = {}): Gen => ({
  basedOn: null,
  skillId: 'RW_EOI_TRANS',
  difficulty: 'MEDIUM',
  title: 'Transitions: coral study',
  passage: 'Coral reefs cover less than one percent of the ocean floor. ______ they support about a quarter of all marine species.',
  stem: 'Which choice completes the text with the most logical transition?',
  answerType: 'MCQ',
  choices: ['Nevertheless,', 'Therefore,', 'For example,', 'Similarly,'],
  correctIndex: 0,
  sprAnswer: null,
  explanation: 'The second sentence contrasts with the first, so "Nevertheless" fits.',
  svg: null,
  ...over,
});

const mathSpr = (over: Partial<Gen> = {}): Gen => ({
  basedOn: null,
  skillId: 'MATH_ALG_LIN1',
  difficulty: 'EASY',
  title: 'Linear equations: one step',
  passage: null,
  stem: 'If $2x + 3 = 10$, what is the value of $x$?',
  answerType: 'SPR',
  choices: [],
  correctIndex: null,
  sprAnswer: '7/2',
  explanation: 'Subtract 3 and divide by 2: $x = \\dfrac{7}{2}$.',
  svg: null,
  ...over,
});

describe('AI savol: tizim shabloniga aylantirish', () => {
  it("R&W savoli 4 variantli, aralashtiriladi va to'g'ri javob saqlanadi", () => {
    const c = q.checkGenerated('RW', rw());
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.domainId).toBe('RW_EOI');
    expect(c.spec.answer).toMatchObject({ kind: 'MCQ_TEXT', correctIndex: 0, shuffle: true });
    expect(c.spec.variables).toEqual([]);
    // har xil seedda ham to'g'ri javob "Nevertheless," bo'lib qoladi
    for (const seed of [1, 2, 3, 77, 1234]) {
      const v = generateVariant(c.spec, seed);
      const right = v.choices!.find((ch) => ch.label === v.correctLabel)!;
      expect(right.text).toBe('Nevertheless,');
      expect(isAnswerCorrect(v, v.correctLabel)).toBe(true);
    }
  });

  it("Math SPR: kasr javob qabul qilinadi (7/2 = 3.5)", () => {
    const c = q.checkGenerated('MATH', mathSpr());
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const v = generateVariant(c.spec, 5);
    expect(v.type).toBe('SPR');
    expect(isAnswerCorrect(v, '3.5')).toBe(true);
    expect(isAnswerCorrect(v, '7/2')).toBe(true);
    expect(isAnswerCorrect(v, '3')).toBe(false);
  });

  it("LaTeX qavslari ({x}) o'zgaruvchi deb tushunilmaydi", () => {
    const c = q.checkGenerated('MATH', mathSpr({ stem: 'If $\\sqrt{x} = 4$ and $y^{2} = x$, what is $\\dfrac{x}{2}$?', sprAnswer: '8' }));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(generateVariant(c.spec, 9).stem).toContain('\\sqrt{x}');
  });

  it('Math MCQ: variantlar tartibi saqlanadi (aralashtirilmaydi)', () => {
    const c = q.checkGenerated(
      'MATH',
      mathSpr({ answerType: 'MCQ', choices: ['$2$', '$3.5$', '$5$', '$6.5$'], correctIndex: 1, sprAnswer: null }),
    );
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.spec.answer).toMatchObject({ kind: 'MCQ_TEXT', shuffle: false });
    expect(generateVariant(c.spec, 3).correctLabel).toBe('B');
  });

  it('noto\'g\'ri savollar rad etiladi', () => {
    expect(q.checkGenerated('RW', rw({ choices: ['a', 'b', 'c'] }))).toMatchObject({ ok: false });
    expect(q.checkGenerated('RW', rw({ choices: ['same', 'Same', 'c', 'd'] }))).toMatchObject({ ok: false });
    expect(q.checkGenerated('RW', rw({ correctIndex: null }))).toMatchObject({ ok: false });
    expect(q.checkGenerated('RW', rw({ passage: null }))).toMatchObject({ ok: false });
    expect(q.checkGenerated('RW', rw({ answerType: 'SPR' }))).toMatchObject({ ok: false });
    // SAT katagiga sig'maydi (5 belgidan uzun)
    expect(q.checkGenerated('MATH', mathSpr({ sprAnswer: '123456' }))).toMatchObject({ ok: false });
    expect(q.checkGenerated('MATH', mathSpr({ sprAnswer: '1 1/2' }))).toMatchObject({ ok: false });
    // boshqa bo'limning ko'nikmasi
    expect(q.checkGenerated('MATH', mathSpr({ skillId: 'RW_EOI_TRANS' }))).toMatchObject({ ok: false });
    // xavfli SVG
    expect(q.checkGenerated('MATH', mathSpr({ svg: '<svg><script>alert(1)</script></svg>' }))).toMatchObject({ ok: false });
  });

  it("noma'lum ko'nikma — reja (slot) dagi ko'nikmaga tushadi", () => {
    const c = q.checkGenerated('MATH', mathSpr({ skillId: 'algebra' }), 'MATH_ALG_LIN1');
    expect(c).toMatchObject({ ok: true, skillId: 'MATH_ALG_LIN1' });
  });
});

describe('AI tekshiruvchi javobini solishtirish', () => {
  it('MCQ: harf bo\'yicha', () => {
    expect(q.answersMatch(rw(), { answer: 'A' })).toBe(true);
    expect(q.answersMatch(rw(), { answer: 'Choice A' })).toBe(true);
    expect(q.answersMatch(rw(), { answer: 'B' })).toBe(false);
    expect(q.answersMatch(rw(), { answer: '' })).toBe(false);
  });

  it('SPR: teng qiymatlar (7/2 = 3.5 = "x = 3.5")', () => {
    expect(q.answersMatch(mathSpr(), { answer: '3.5' })).toBe(true);
    expect(q.answersMatch(mathSpr(), { answer: 'x = 7/2' })).toBe(true);
    expect(q.answersMatch(mathSpr(), { answer: '3.4' })).toBe(false);
    expect(q.answersMatch(mathSpr({ sprAnswer: '-12' }), { answer: '−12' })).toBe(true);
    expect(q.numberOf('1,250')).toBe(1250);
    expect(q.numberOf('no number')).toBeNull();
  });
});

describe('AI reja va dublikatlar', () => {
  it("aralash qiyinlik ~30/40/30, ko'nikmalar navbatma-navbat", () => {
    const slots = q.planSlots(['A', 'B'], 'MIXED', 10, () => 0.42);
    expect(slots).toHaveLength(10);
    expect(slots.filter((s) => s.skillId === 'A')).toHaveLength(5);
    const count = (d: string) => slots.filter((s) => s.difficulty === d).length;
    expect(count('EASY')).toBe(3);
    expect(count('MEDIUM')).toBe(4);
    expect(count('HARD')).toBe(3);
    expect(q.planSlots(['A'], 'HARD', 3).every((s) => s.difficulty === 'HARD')).toBe(true);
    expect(q.planSlots([], 'MIXED', 3)).toEqual([]);
  });

  it("bir xil savolning barmoq izi bir xil (registr va tinish belgilari farq qilmaydi)", () => {
    expect(q.questionHash(rw())).toBe(q.questionHash(rw({ stem: 'which choice completes the text with the most logical transition' })));
    expect(q.questionHash(rw())).not.toBe(q.questionHash(rw({ choices: ['However,', 'Therefore,', 'For example,', 'Similarly,'] })));
  });

  it("ko'rsatma: reja, o'quvchi xatolari va mavjud savollar", () => {
    const text = q.batchInstructions({
      section: 'MATH',
      model: 'm',
      count: 2,
      slots: [
        { skillId: 'MATH_ALG_LIN1', difficulty: 'EASY' },
        { skillId: 'MATH_GEO_CIRC', difficulty: 'HARD' },
      ],
      studentContext: 'Mistake 1: chose 5 instead of 7',
      avoid: ['If 3x = 9, what is x?'],
    });
    expect(text).toContain('Write exactly 2 new Math questions');
    expect(text).toContain('skillId=MATH_GEO_CIRC (Circles), difficulty=HARD');
    expect(text).toContain('Mistake 1');
    expect(text).toContain('- If 3x = 9, what is x?');
    expect(q.generatorSystem('RW')).toContain('RW_EOI_TRANS=Transitions');
    expect(q.generatorSystem('RW')).not.toContain('MATH_ALG_LIN1');
    expect(q.generatorSystem('MATH')).not.toContain('RW_EOI_TRANS');
  });
});

describe('Bitta savol qaytib tushmasin (test pool)', () => {
  const item = (id: string, skillId = 'S1', difficulty: 'EASY' | 'MEDIUM' | 'HARD' = 'MEDIUM') => ({
    id,
    version: 1,
    section: 'MATH' as const,
    domainId: 'D1',
    skillId,
    difficulty,
    rating: 1200,
    ratingGames: 0,
  });

  it("avval ko'rilmagan savol (hatto boshqa qiyinlikda), keyin eng eskisi", () => {
    const items = [item('a'), item('b'), item('c', 'S1', 'HARD')];
    const seen = new Map([
      ['a', 100],
      ['b', 50],
    ]);
    const f = { section: 'MATH' as const, skillId: 'S1', difficulty: 'MEDIUM' as const };
    expect(catalog.pickFromPool(items, f, new Set(), () => 0, seen)?.id).toBe('c');
    // hammasi ko'rilgan: eng eski (b) birinchi
    expect(catalog.pickFromPool(items, f, new Set(['c']), () => 0, new Map([...seen, ['c', 1]]))?.id).toBe('b');
    // seen berilmasa — eski xulq
    expect(catalog.pickFromPool(items, f, new Set(), () => 0)?.id).toBe('a');
  });

  it("takror savollar mavzusi — AI to'ldirish uchun", () => {
    const seen = new Map([['a', 1]]);
    expect(fresh.shortagesOf([item('a'), item('b', 'S2'), item('a')], seen)).toEqual([{ section: 'MATH', skillId: 'S1', difficulty: 'MEDIUM' }]);
    expect(fresh.shortagesOf([item('b')], seen)).toEqual([]);
  });
});

describe('Telegram uchun matn', () => {
  it("LaTeX va Markdown oddiy matnga aylanadi", () => {
    expect(tutor.plainForTelegram('**Javob:** $x^{2} + \\dfrac{3}{4} \\le 5$')).toBe('Javob: x² + (3)/(4) ≤ 5');
    expect(tutor.plainForTelegram('- birinchi\n- ikkinchi')).toBe('• birinchi\n• ikkinchi');
    expect(tutor.plainForTelegram('$\\sqrt{16} \\cdot \\pi$')).toBe('√(16) · π');
  });

  it('uzun javob 4000 belgidan bo\'linadi', () => {
    const para = 'a'.repeat(1500);
    const text = [para, para, para, para].join('\n\n');
    const parts = tutor.splitMessage(text);
    expect(parts.length).toBe(2);
    expect(parts.every((p) => p.length <= 4000)).toBe(true);
    // paragraf chegarasidan bo'linadi — hech narsa yo'qolmaydi
    expect(parts.join('\n\n')).toBe(text);
    expect(tutor.splitMessage('qisqa')).toEqual(['qisqa']);
  });
});
