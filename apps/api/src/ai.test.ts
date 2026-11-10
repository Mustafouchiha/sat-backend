import { parseSpec } from '@sat/generator';
import { beforeAll, describe, expect, it } from 'vitest';

// env.ts DATABASE_URL va JWT_SECRET'ni talab qiladi — test uchun soxta qiymatlar (bazaga ulanilmaydi)
let ai: typeof import('./lib/ai');
beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://test@localhost:5432/test';
  process.env.JWT_SECRET ??= 'test-secret-0123456789';
  ai = await import('./lib/ai');
});

const LINEAR = parseSpec({
  stem: 'If ${a}x + {b} = {c}$, what is $x$?',
  variables: [
    { name: 'a', type: 'int', min: 2, max: 9 },
    { name: 'b', type: 'int', min: 1, max: 20 },
    { name: 'x0', type: 'int', min: -10, max: 10, exclude: [0] },
  ],
  derived: [{ name: 'c', expr: 'a*x0 + b' }],
  constraints: ['a != b'],
  answer: { kind: 'MCQ', correct: 'x0', distractors: ['(c + b) / a', 'c - b', '-x0'] },
});

const PYTH = parseSpec({
  stem: '$AC = {a}$, $BC = {b}$. Find $AB$.',
  variables: [
    { name: 't', type: 'choice', options: ['3|4|5', '5|12|13', '8|15|17'] },
    { name: 'k', type: 'int', min: 1, max: 3 },
  ],
  derived: [
    { name: 'a', expr: 'k * t' },
    { name: 'b', expr: 'k * t_1' },
    { name: 'c', expr: 'k * t_2' },
  ],
  answer: { kind: 'SPR', correct: 'c' },
});

const vals = (o: Record<string, string>) => Object.entries(o).map(([name, value]) => ({ name, value }));

describe('AI: asl savol bilan tekshiruv', () => {
  it("formula asl javobni bersa — mos keladi, muammo yo'q", () => {
    const r = ai.checkOriginal(LINEAR, { originalValues: vals({ a: '3', b: '7', x0: '5' }), originalAnswer: '5' });
    expect(r).toEqual({ answerMatches: true, expected: 5, got: 5, problems: [] });
  });

  it('noto\'g\'ri formula ushlanadi', () => {
    const wrong = parseSpec({ ...LINEAR, answer: { kind: 'SPR', correct: '(c + b) / a' } });
    const r = ai.checkOriginal(wrong, { originalValues: vals({ a: '3', b: '7', x0: '5' }), originalAnswer: '5' });
    expect(r?.answerMatches).toBe(false);
    expect(r?.got).toBeCloseTo(29 / 3);
  });

  it('diapazondan tashqari qiymat va bajarilmagan cheklov haqida ogohlantiradi', () => {
    const r = ai.checkOriginal(LINEAR, { originalValues: vals({ a: '12', b: '12', x0: '5' }), originalAnswer: '5' });
    expect(r?.answerMatches).toBe(true);
    expect(r?.problems.some((p) => p.includes('diapazondan'))).toBe(true);
    expect(r?.problems.some((p) => p.includes('a != b'))).toBe(true);
  });

  it('choice qismlari (t_1, t_2) va kasr ko\'rinishidagi javob', () => {
    const r = ai.checkOriginal(PYTH, { originalValues: vals({ t: '5|12|13', k: '2' }), originalAnswer: '26' });
    expect(r).toMatchObject({ answerMatches: true, got: 26 });
    const half = parseSpec({ ...PYTH, answer: { kind: 'SPR', correct: 'c / 4' } });
    expect(ai.checkOriginal(half, { originalValues: vals({ t: '5', k: '1' }), originalAnswer: '13/4' })?.answerMatches).toBe(true);
  });

  it("qiymat berilmasa yoki MCQ_TEXT bo'lsa", () => {
    expect(ai.checkOriginal(LINEAR, { originalValues: vals({ a: '3' }), originalAnswer: '5' })?.answerMatches).toBe(false);
    const text = parseSpec({ stem: 'Which?', answer: { kind: 'MCQ_TEXT', choices: ['a', 'b', 'c', 'd'] } });
    expect(ai.checkOriginal(text, { originalValues: [], originalAnswer: '' })).toBeNull();
  });

  it('structured output sxemasi yaratiladi (barcha maydonlar majburiy, figureBox null bo\'lishi mumkin)', async () => {
    const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');
    const f = betaZodOutputFormat(ai.AiSuggestion) as unknown as { schema: { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean } };
    expect(f.schema.additionalProperties).toBe(false);
    expect(f.schema.required.sort()).toEqual(Object.keys(f.schema.properties).sort());
    expect(JSON.stringify(f.schema.properties.figureBox)).toContain('null');
    expect(Object.keys(f.schema.properties)).toEqual(expect.arrayContaining(['svg', 'figureBox', 'transcript', 'originalValues', 'originalAnswer']));
  });

  it('SVG: oddiy chizma qoladi, xavfli qismlar tashlanadi', () => {
    const ok = '<svg viewBox="0 0 10 10" width="10"><line x1="0" y1="0" x2="{=k*2|int}" y2="5" stroke="currentColor"/></svg>';
    expect(ai.cleanSvg(ok)).toBe(ok);
    expect(ai.cleanSvg('<svg><script>alert(1)</script></svg>')).toBeUndefined();
    expect(ai.cleanSvg('<svg><rect onload="x()"/></svg>')).toBeUndefined();
    expect(ai.cleanSvg('<div>no</div>')).toBeUndefined();
    expect(ai.cleanSvg(null)).toBeUndefined();
  });
});
