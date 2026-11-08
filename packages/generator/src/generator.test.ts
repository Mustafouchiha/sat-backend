import { describe, expect, it } from 'vitest';
import {
  checkSpr,
  findNumbers,
  generateVariant,
  isAnswerCorrect,
  parseSpec,
  previewVariants,
  runChecks,
  sprForms,
  templatize,
  TemplateError,
  toPublicQuestion,
  validateSpec,
  type TemplateSpecInput,
} from './index';

const linear: TemplateSpecInput = {
  stem: 'If ${a}x + {b} = {c}$, what is the value of $x$?',
  variables: [
    { name: 'a', type: 'int', min: 2, max: 9 },
    { name: 'b', type: 'int', min: 1, max: 20 },
    { name: 'x0', type: 'int', min: -10, max: 10, exclude: [0] },
  ],
  derived: [{ name: 'c', expr: 'a*x0 + b' }],
  constraints: ['a != b', 'isInt(answer)'],
  answer: { kind: 'MCQ', correct: 'x0', distractors: ['(c + b) / a', 'c - b', '-x0'] },
  explanation: 'Subtract {b}: ${a}x = {=c-b}$, so $x = {x0}$.',
};

describe('seed takrorlanuvchanligi', () => {
  it('bir xil seed — aynan bir xil variant', () => {
    const spec = parseSpec(linear);
    const a = generateVariant(spec, 12345);
    const b = generateVariant(spec, 12345);
    expect(a).toEqual(b);
  });

  it('har xil seedlar — har xil variantlar', () => {
    const spec = parseSpec(linear);
    const stems = new Set<string>();
    for (let s = 1; s <= 60; s++) stems.add(generateVariant(spec, s).stem);
    expect(stems.size).toBeGreaterThan(40);
  });
});

describe('cheklovlar', () => {
  it('barcha variantlarda cheklovlar bajariladi', () => {
    const spec = parseSpec(linear);
    for (let s = 1; s <= 300; s++) {
      const v = generateVariant(spec, s);
      expect(v.values.a).not.toBe(v.values.b);
      expect(Number.isInteger(v.values.answer)).toBe(true);
      expect(v.values.x0).not.toBe(0);
    }
  });

  it("bajarib bo'lmaydigan cheklov — 200 urinishdan keyin xato", () => {
    const spec = parseSpec({
      stem: 'x = {a}',
      variables: [{ name: 'a', type: 'int', min: 1, max: 5 }],
      constraints: ['a > 10'],
      answer: { kind: 'SPR', correct: 'a' },
    });
    try {
      generateVariant(spec, 1);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateError);
      expect((e as TemplateError).code).toBe('CONSTRAINTS');
      expect((e as TemplateError).message).toContain('200');
    }
  });

  it("nolga bo'lish rad etiladi va qayta urinadi", () => {
    const spec = parseSpec({
      stem: 'y = {y}',
      variables: [{ name: 'a', type: 'int', min: 2, max: 4 }],
      derived: [{ name: 'y', expr: '6 / (a - 3)' }],
      answer: { kind: 'SPR', correct: 'y' },
    });
    for (let s = 1; s <= 50; s++) {
      const v = generateVariant(spec, s);
      expect(v.values.a).not.toBe(3);
    }
    const report = runChecks(spec, 200);
    expect(report.ok).toBe(true);
    expect(report.divisionByZeroOrNaN).toBeGreaterThan(0);
  });

  it('sintaksis xatosi darhol aniqlanadi', () => {
    const r = validateSpec({ stem: 'x', answer: { kind: 'SPR', correct: '2 + * 3' } });
    expect(r.ok).toBe(false);
  });

  it("noma'lum o'zgaruvchi — TemplateError", () => {
    const spec = parseSpec({ stem: 'x', answer: { kind: 'SPR', correct: 'zzz + 1' } });
    expect(() => generateVariant(spec, 1)).toThrow(TemplateError);
  });

  it('band nomlar rad etiladi', () => {
    const r = validateSpec({
      stem: 'x',
      variables: [{ name: 'sqrt', type: 'int', min: 1, max: 2 }],
      answer: { kind: 'SPR', correct: '1' },
    });
    expect(r.ok).toBe(false);
  });
});

describe('MCQ javob variantlari', () => {
  it('4 ta, takrorlanmaydi, to‘g‘ri harf to‘g‘ri qiymatga ishora qiladi', () => {
    const spec = parseSpec(linear);
    for (let s = 1; s <= 300; s++) {
      const v = generateVariant(spec, s);
      expect(v.choices).toHaveLength(4);
      expect(v.choices!.map((c) => c.label)).toEqual(['A', 'B', 'C', 'D']);
      expect(new Set(v.choices!.map((c) => c.text)).size).toBe(4);
      const correct = v.choices!.find((c) => c.label === v.correctLabel)!;
      expect(correct.text).toBe(`$${v.values.x0}$`);
      expect(isAnswerCorrect(v, v.correctLabel!)).toBe(true);
    }
  });

  it('to‘g‘ri javob harflar bo‘yicha taxminan teng taqsimlanadi', () => {
    const report = runChecks(parseSpec(linear), 500);
    expect(report.ok).toBe(true);
    for (const l of ['A', 'B', 'C', 'D']) {
      expect(report.answerDistribution[l]).toBeGreaterThan(80);
    }
  });

  it("takroriy chalg'ituvchilar qayta urinish bilan hal qilinadi", () => {
    // a=1 bo'lsa "a*x0" va "x0" bir xil bo'ladi — generator boshqa qiymat tanlaydi
    const spec = parseSpec({
      stem: 'Find {x0}',
      variables: [
        { name: 'a', type: 'int', min: 1, max: 3 },
        { name: 'x0', type: 'int', min: 2, max: 9 },
      ],
      answer: { kind: 'MCQ', correct: 'x0', distractors: ['a*x0', 'x0+a', 'x0+2*a'] },
    });
    const report = runChecks(spec, 300);
    expect(report.ok).toBe(true);
    expect(report.duplicateChoiceRejections).toBeGreaterThan(0);
  });

  it("3 tadan ko'p chalg'ituvchi bo'lsa, faqat 3 tasi tanlanadi", () => {
    const spec = parseSpec({
      stem: '{n}',
      variables: [{ name: 'n', type: 'int', min: 10, max: 99 }],
      answer: { kind: 'MCQ', correct: 'n', distractors: ['n+1', 'n+2', 'n+3', 'n+4', 'n+5'] },
    });
    const v = generateVariant(spec, 7);
    expect(v.choices).toHaveLength(4);
  });

  it('MCQ_TEXT: aralashtiriladi va to‘g‘ri javob kuzatiladi', () => {
    const spec = parseSpec({
      stem: '{name} wrote the report.',
      variables: [{ name: 'name', type: 'choice', options: ['Maria|she', 'John|he'] }],
      answer: { kind: 'MCQ_TEXT', choices: ['correct {name.1}', 'wrong one', 'wrong two', 'wrong three'] },
    });
    const labels = new Set<string>();
    for (let s = 1; s <= 80; s++) {
      const v = generateVariant(spec, s);
      const c = v.choices!.find((x) => x.label === v.correctLabel)!;
      expect(c.text === 'correct she' || c.text === 'correct he').toBe(true);
      expect(v.stem.startsWith('Maria') ? c.text === 'correct she' : c.text === 'correct he').toBe(true);
      labels.add(v.correctLabel!);
    }
    expect(labels.size).toBe(4);
  });

  it('public savolda javob va izoh yo‘q', () => {
    const v = generateVariant(parseSpec(linear), 3);
    const pub = toPublicQuestion(v) as unknown as Record<string, unknown>;
    expect(pub.correctLabel).toBeUndefined();
    expect(pub.explanation).toBeUndefined();
    expect(pub.values).toBeUndefined();
  });
});

describe('SPR javob tengligi', () => {
  it('3/4, 0.75, .75, 6/8 — barchasi to‘g‘ri', () => {
    for (const a of ['3/4', '0.75', '.75', '6/8', ' 0,75 ']) expect(checkSpr(a, 0.75).correct).toBe(true);
    expect(checkSpr('0.7', 0.75).correct).toBe(false);
    expect(checkSpr('4/3', 0.75).correct).toBe(false);
  });

  it('takrorlanuvchi kasr: to‘liq kenglikdagi kesish/yaxlitlash qabul qilinadi', () => {
    const t = 2 / 3;
    for (const a of ['2/3', '.6666', '.6667', '0.666', '0.667']) expect(checkSpr(a, t).correct).toBe(true);
    for (const a of ['.66', '0.67', '.67', '0.6']) expect(checkSpr(a, t).correct).toBe(false);
  });

  it('manfiy javoblar (6 belgigacha)', () => {
    expect(checkSpr('-3/4', -0.75).correct).toBe(true);
    expect(checkSpr('-.6666', -2 / 3).correct).toBe(true);
    expect(checkSpr('-0.667', -2 / 3).correct).toBe(true);
    expect(checkSpr('-12345', -12345).correct).toBe(true);
  });

  it('noto‘g‘ri formatlar rad etiladi', () => {
    expect(checkSpr('0.66666', 2 / 3).valid).toBe(false); // 6 belgi musbat
    expect(checkSpr('1 1/2', 1.5).valid).toBe(false); // aralash son
    expect(checkSpr('3/0', 1).valid).toBe(false);
    expect(checkSpr('abc', 1).valid).toBe(false);
    expect(checkSpr('', 1).valid).toBe(false);
  });

  it('to‘g‘ri javob ko‘rinishlari', () => {
    expect(sprForms(0.75)).toEqual(['3/4', '.75']);
    expect(sprForms(2 / 3)).toEqual(['2/3', '.6666', '.6667']);
    expect(sprForms(-2)).toEqual(['-2']);
    expect(sprForms(2.5)).toEqual(['5/2', '2.5']);
  });

  it('SPR shablon: variantning javobi o‘zi bilan tekshiriladi', () => {
    const spec = parseSpec({
      stem: '$\\frac{x}{{d}} = {f}$. Find $x$.',
      variables: [
        { name: 'd', type: 'int', min: 2, max: 9 },
        { name: 'f', type: 'fraction', numMin: 1, numMax: 9, denMin: 2, denMax: 9 },
      ],
      answer: { kind: 'SPR', correct: 'd * f' },
    });
    for (let s = 1; s <= 100; s++) {
      const v = generateVariant(spec, s);
      expect(v.type).toBe('SPR');
      const first = v.correctDisplay.split(', ')[0];
      expect(isAnswerCorrect(v, first)).toBe(true);
    }
  });
});

describe('formatlash', () => {
  const run = (stem: string, vars: TemplateSpecInput['variables'], derived: TemplateSpecInput['derived'] = []) =>
    generateVariant(parseSpec({ stem, variables: vars, derived, answer: { kind: 'SPR', correct: '1' } }), 1).stem;

  it('1*x -> x, -1*x -> -x', () => {
    expect(run('${a|coef}x$', [{ name: 'a', type: 'int', min: 1, max: 1 }])).toBe('$x$');
    expect(run('${a|coef}x$', [{ name: 'a', type: 'int', min: -1, max: -1 }])).toBe('$-x$');
    expect(run('${a}x$', [{ name: 'a', type: 'int', min: 1, max: 1 }])).toBe('$x$');
  });

  it('+ -3 -> - 3', () => {
    expect(run('$x + {b}$', [{ name: 'b', type: 'int', min: -3, max: -3 }])).toBe('$x - 3$');
    expect(run('$x - {b}$', [{ name: 'b', type: 'int', min: -3, max: -3 }])).toBe('$x + 3$');
    expect(run('$x {b|signed}$', [{ name: 'b', type: 'int', min: -3, max: -3 }])).toBe('$x - 3$');
    expect(run('$x^2 {b|signedcoef}x$', [{ name: 'b', type: 'int', min: 1, max: 1 }])).toBe('$x^2 + x$');
  });

  it('kasrlar qisqartiriladi', () => {
    expect(run('${=6/8|frac}$', [])).toBe('$\\frac{3}{4}$');
    expect(run('{=6/8|frac}', [])).toBe('3/4');
    expect(run('${=-6/8|frac}$', [])).toBe('$-\\frac{3}{4}$');
    expect(run('${f}$', [{ name: 'f', type: 'fraction', numMin: 6, numMax: 6, denMin: 8, denMax: 8 }])).toBe(
      '$\\frac{3}{4}$',
    );
  });

  it('ildiz soddalashtiriladi', () => {
    expect(run('${=12|sqrt}$', [])).toBe('$2\\sqrt{3}$');
    expect(run('${=16|sqrt}$', [])).toBe('$4$');
  });

  it("LaTeX qavslari va e'lon qilinmagan nomlar tegilmaydi", () => {
    expect(run('$\\frac{1}{2} + \\sqrt{y}$', [])).toBe('$\\frac{1}{2} + \\sqrt{y}$');
  });

  it('choice qismlari va ichki ifoda', () => {
    expect(run('{p} said {p.1} has {=n*2} apples.', [
      { name: 'p', type: 'choice', options: ['Aziz|he'] },
      { name: 'n', type: 'int', min: 3, max: 3 },
    ])).toBe('Aziz said he has 6 apples.');
  });

  it('choice qismlari formulalarda (Pifagor uchligi)', () => {
    const spec = parseSpec({
      stem: 'legs {a}, {b}',
      variables: [
        { name: 't', type: 'choice', options: ['3|4|5', '5|12|13'] },
        { name: 'k', type: 'int', min: 1, max: 3 },
      ],
      derived: [
        { name: 'a', expr: 'k * t' },
        { name: 'b', expr: 'k * t_1' },
        { name: 'c', expr: 'k * t_2' },
      ],
      constraints: ['a^2 + b^2 == c^2'],
      answer: { kind: 'SPR', correct: 'c' },
    });
    const report = runChecks(spec, 100);
    expect(report.ok).toBe(true);
    expect(report.rejections).toEqual({});
  });

  it('suzuvchi nuqta xatolari tozalanadi', () => {
    expect(run('{c}', [], [{ name: 'c', expr: '0.1 + 0.2' }])).toBe('0.3');
  });

  it('o‘nli kasrlar: d2 va comma', () => {
    expect(run('\\${p|d2}', [{ name: 'p', type: 'decimal', min: 3.5, max: 3.5, places: 1 }])).toBe('\\$3.50');
    expect(run('{n|comma}', [{ name: 'n', type: 'int', min: 12500, max: 12500 }])).toBe('12,500');
  });
});

describe('avto-tekshiruv va preview', () => {
  it('yaxshi shablon uchun hisobot ok', () => {
    const report = runChecks(parseSpec(linear), 500);
    expect(report.ok).toBe(true);
    expect(report.successes).toBe(500);
    expect(report.uniqueVariants).toBeGreaterThan(300);
    expect(report.errors).toHaveLength(0);
  });

  it('preview 10 ta variant beradi', () => {
    const vs = previewVariants(parseSpec(linear), 10, 42);
    expect(vs).toHaveLength(10);
    expect(vs.every((v) => v.correctLabel)).toBe(true);
  });
});

describe('tayyor testdan shablon yasash', () => {
  it('sonlarni topadi va almashtiradi', () => {
    const text = 'If 3x + 7 = 22, what is x?';
    const nums = findNumbers(text);
    expect(nums.map((n) => n.value)).toEqual([3, 7, 22]);
    const out = templatize(text, nums.map((n) => ({ index: n.index, length: n.length, name: n.suggestedName })));
    expect(out).toBe('If {a}x + {b} = {c}, what is x?');
  });
});
