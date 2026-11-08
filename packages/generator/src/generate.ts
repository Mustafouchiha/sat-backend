import { RejectSignal, TemplateError } from './errors';
import { nearlyEqual, type Value } from './format';
import { evaluate } from './math';
import { renderText, type RenderContext, type VarMeta } from './render';
import { Rng } from './rng';
import { sampleVariable } from './sample';
import { checkSpr, sprForms } from './spr';
import type { Choice, PublicQuestion, TemplateSpec, Variant } from './types';
import { questionTypeOf } from './types';

export const LABELS = ['A', 'B', 'C', 'D'] as const;
export const DEFAULT_MAX_ATTEMPTS = 200;

export interface GenerateOptions {
  maxAttempts?: number;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

function isTruthy(v: Value): boolean {
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  return v;
}

type AttemptResult = Omit<Variant, 'seed' | 'attempts' | 'rejections'>;

function attemptOnce(spec: TemplateSpec, rng: Rng): AttemptResult {
  const scope: Record<string, Value> = {};
  const meta: VarMeta = { fractionVars: new Set(), choiceParts: {} };

  // 1) tasodifiy o'zgaruvchilar
  for (const v of spec.variables) {
    const s = sampleVariable(v, rng);
    scope[v.name] = s.value;
    if (v.type === 'fraction') {
      meta.fractionVars.add(v.name);
      scope[`${v.name}_n`] = s.n ?? 0;
      scope[`${v.name}_d`] = s.d ?? 1;
    }
    if (v.type === 'choice') {
      const parts = s.parts ?? [];
      meta.choiceParts[v.name] = parts;
      scope[`${v.name}_i`] = s.index ?? 0;
      // "3|4|5" kabi variantlarning qismlari formulalarda: t_1 = 4, t_2 = 5
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        scope[`${v.name}_${i}`] = p !== '' && !Number.isNaN(Number(p)) ? Number(p) : p;
      }
    }
  }

  // 2) hosilaviy o'zgaruvchilar (tartib bilan)
  for (const d of spec.derived) {
    scope[d.name] = evaluate(d.expr, scope, `hosilaviy "${d.name}"`);
  }

  // 3) to'g'ri javob
  const ans = spec.answer;
  let correctValue: number | undefined;
  if (ans.kind === 'MCQ' || ans.kind === 'SPR') {
    const cv = evaluate(ans.correct, scope, 'javob formulasi');
    if (typeof cv !== 'number') {
      throw new TemplateError('EVAL', `Javob formulasi son qaytarishi kerak: "${ans.correct}"`);
    }
    correctValue = cv;
    scope.answer = cv;
  }

  // 4) cheklovlar
  for (const c of spec.constraints) {
    if (!isTruthy(evaluate(c, scope, 'cheklov'))) throw new RejectSignal(`constraint:${c}`);
  }

  const ctx: RenderContext = { scope, meta };

  // 5) javob variantlari
  let choices: Choice[] | undefined;
  let correctLabel: string | undefined;
  let correctDisplay = '';

  if (ans.kind === 'MCQ') {
    const cv = correctValue as number;
    const tpl = ans.choiceTemplate ?? `$${ans.format ? `{v|${ans.format}}` : '{v}'}$`;
    const renderChoice = (val: number) => renderText(tpl, { scope: { ...scope, v: val }, meta });
    const correctText = renderChoice(cv);
    const seenText = new Set([norm(correctText)]);
    const seenVals: number[] = [cv];
    const picked: Array<{ text: string; correct: boolean }> = [];
    for (const expr of rng.shuffle(ans.distractors)) {
      if (picked.length === 3) break;
      let val: Value;
      try {
        val = evaluate(expr, scope, "chalg'ituvchi");
      } catch (e) {
        if (e instanceof RejectSignal) continue;
        throw e;
      }
      if (typeof val !== 'number') {
        throw new TemplateError('EVAL', `Chalg'ituvchi formula son qaytarishi kerak: "${expr}"`);
      }
      if (seenVals.some((s) => nearlyEqual(s, val as number))) continue;
      const text = renderChoice(val);
      if (seenText.has(norm(text))) continue;
      seenText.add(norm(text));
      seenVals.push(val);
      picked.push({ text, correct: false });
    }
    if (picked.length < 3) throw new RejectSignal('duplicate_choices');
    const ordered = rng.shuffle([{ text: correctText, correct: true }, ...picked]);
    choices = ordered.map((c, i) => ({ label: LABELS[i], text: c.text }));
    correctLabel = LABELS[ordered.findIndex((c) => c.correct)];
    correctDisplay = correctLabel;
  } else if (ans.kind === 'MCQ_TEXT') {
    const texts = ans.choices.map((c) => renderText(c, ctx));
    if (new Set(texts.map(norm)).size !== texts.length) throw new RejectSignal('duplicate_choices');
    const correctIdx = ans.correctIndex ?? 0;
    const order = ans.shuffle === false ? [0, 1, 2, 3] : rng.shuffle([0, 1, 2, 3]);
    choices = order.map((idx, i) => ({ label: LABELS[i], text: texts[idx] }));
    correctLabel = LABELS[order.indexOf(correctIdx)];
    correctDisplay = correctLabel;
  } else {
    correctDisplay = sprForms(correctValue as number).join(', ');
  }

  // 6) matnlar
  const stem = renderText(spec.stem, ctx);
  const passage = spec.passage ? renderText(spec.passage, ctx) : undefined;
  const explanation = spec.explanation ? renderText(spec.explanation, ctx) : undefined;
  const svg = spec.svg ? renderText(spec.svg, ctx, false) : undefined;

  const values: Record<string, Value> = {};
  for (const v of spec.variables) values[v.name] = scope[v.name];
  for (const d of spec.derived) values[d.name] = scope[d.name];
  if (correctValue !== undefined) values.answer = correctValue;

  return {
    type: questionTypeOf(spec),
    stem,
    passage,
    svg,
    explanation,
    choices,
    correctLabel,
    correctValue,
    correctDisplay,
    values,
  };
}

/**
 * Shablon + seed => variant. Bir xil seed har doim bir xil variant beradi.
 * Cheklovlar bajarilmasa yangi qiymatlar bilan qayta urinadi (standart 200 marta).
 */
export function generateVariant(spec: TemplateSpec, seed: number, opts: GenerateOptions = {}): Variant {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const rng = new Rng(seed);
  const rejections: Record<string, number> = {};
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const v = attemptOnce(spec, rng);
      return { ...v, seed, attempts: attempt, rejections };
    } catch (e) {
      if (e instanceof RejectSignal) {
        rejections[e.reason] = (rejections[e.reason] ?? 0) + 1;
        continue;
      }
      throw e;
    }
  }
  const top = Object.entries(rejections)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => `${k} (${n})`)
    .join('; ');
  throw new TemplateError(
    'CONSTRAINTS',
    `Shablon noto'g'ri: ${maxAttempts} urinishda ham barcha cheklovlar bajarilmadi. Eng ko'p sabablar: ${top}`,
    { rejections },
  );
}

export function toPublicQuestion(v: Variant): PublicQuestion {
  return {
    type: v.type,
    stem: v.stem,
    passage: v.passage,
    svg: v.svg,
    choices: v.choices?.map((c) => ({ label: c.label, text: c.text })),
  };
}

/** Server tomonda javobni tekshirish. */
export function isAnswerCorrect(v: Variant, answer: string | null | undefined): boolean {
  if (answer === null || answer === undefined || answer === '') return false;
  if (v.type === 'MCQ') return answer.trim().toUpperCase() === v.correctLabel;
  if (v.correctValue === undefined) return false;
  return checkSpr(answer, v.correctValue).correct;
}
