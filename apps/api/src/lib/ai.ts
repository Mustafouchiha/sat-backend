import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { evaluate, runChecks, validateSpec, type TemplateSpec, type TemplateSpecInput, type Value, type VariableDef } from '@sat/generator';
import { TAXONOMY } from '@sat/shared';
// SDK zod helperi zod v4 sxemasini kutadi (zod 3.25 ichida "zod/v4" mavjud)
import { z } from 'zod/v4';
import { env } from '../env';
import { HttpError } from './http';

const AiVariable = z.object({
  name: z.string().describe('Identifier: letters/digits/_ , must start with a letter. Not a math.js function name.'),
  type: z.enum(['int', 'decimal', 'choice']),
  min: z.number().nullable(),
  max: z.number().nullable(),
  places: z.number().int().nullable().describe('Decimal places for decimal variables, otherwise null'),
  exclude: z.array(z.number()).nullable(),
  options: z.array(z.string()).nullable().describe('Only for choice variables, e.g. ["Maria|she","John|he"]'),
});

export const AiSuggestion = z.object({
  transcript: z
    .string()
    .describe('The original question exactly as you read it (stem, answer choices, what the figure shows), plain text with $...$ math. Lets the operator verify your reading.'),
  section: z.enum(['MATH', 'RW']),
  domainId: z.string().nullable(),
  skillId: z.string().nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  title: z.string(),
  stem: z.string().describe('Question text with {placeholders} and $...$ LaTeX'),
  passage: z.string().nullable(),
  svg: z.string().nullable().describe('The figure redrawn as SVG with placeholders (see FIGURES), or null'),
  figureBox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable()
    .describe('Image input only, when the figure must be shown as a picture: pixel bounding box of the figure (without the question text) in the input image'),
  variables: z.array(AiVariable),
  derived: z.array(z.object({ name: z.string(), expr: z.string() })),
  constraints: z.array(z.string()),
  answerKind: z.enum(['MCQ', 'SPR', 'MCQ_TEXT']),
  correct: z.string().describe('math.js expression for the correct answer (MCQ/SPR); empty string for MCQ_TEXT'),
  distractors: z
    .array(z.object({ expr: z.string(), mistake: z.string() }))
    .describe('MCQ: 3-5 math.js expressions, each modelling a typical student mistake'),
  textChoices: z.array(z.string()).nullable().describe('MCQ_TEXT only: exactly 4 choices, the FIRST is correct'),
  explanation: z.string(),
  originalValues: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .describe('Value of every variable (not derived ones) that reproduces the original question; for a choice variable, the option used. Empty for MCQ_TEXT.'),
  originalAnswer: z
    .string()
    .describe('Correct answer of the ORIGINAL question as a number or math.js expression ("12", "3/4", "2*sqrt(3)"); empty string for MCQ_TEXT'),
  notes: z.string().describe('Short notes for the operator in Uzbek: what was varied and what to double-check'),
});

export type AiSuggestionT = z.infer<typeof AiSuggestion>;

export const SVG_EXAMPLE =
  '<svg viewBox="0 0 300 200" width="300" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">' +
  '<polygon points="50,170 260,170 50,40" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<polyline points="62,170 62,158 50,158" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<text x="40" y="44" font-size="13" fill="currentColor" text-anchor="end">A</text>' +
  '<text x="40" y="186" font-size="13" fill="currentColor" text-anchor="end">C</text>' +
  '<text x="266" y="186" font-size="13" fill="currentColor">B</text>' +
  '<text x="42" y="110" font-size="13" fill="currentColor" text-anchor="end">{a}</text>' +
  '<text x="155" y="190" font-size="13" fill="currentColor" text-anchor="middle">{b}</text></svg>';

const SYSTEM = `You convert SAT-style questions into parameterized templates for a test-prep generator.
The generator substitutes random values into variables so every student gets the same question with different numbers.

TEMPLATE LANGUAGE
- Placeholders in text: {a}, {a|format}, {=expr|format} (inline math.js expression), {p.1} (2nd part of a choice option "Maria|she").
- Formats: coef (1 -> "", -1 -> "-"), signed ("+ 3"/"- 3"), signedcoef, frac (reduced LaTeX fraction), slash (p/q), d2 (fixed 2 decimals), r2 (round, trim zeros), comma (thousands), sqrt (simplified radical of the value), abs, int (round to an integer).
- Math must be in $...$ (KaTeX). Write currency as \\$ (escaped dollar).
- Expressions use math.js syntax: + - * / ^, sqrt(), abs(), round(x, n), floor, ceil, mod(a,b) or a % b, gcd, lcm, min, max, pi, and the ternary c ? x : y.
  Extra helpers: isInt(x), sind/cosd/tand (degrees), hyp(a,b).
- In expressions, the parts of a choice option "3|4|5" are t (= 3), t_1 (= 4), t_2 (= 5).
- Variable types: int (min, max, optional exclude), decimal (min, max, places), choice (options list).
- "derived" variables are computed in order from earlier variables.
- "constraints" are boolean math.js expressions that must hold (e.g. "a != b", "isInt(answer)", "answer > 0"). The special name "answer" holds the computed correct answer.
- Prefer constructing the answer first (e.g. pick the solution x0, then derive the coefficients) so answers stay clean integers.
- Do not use reserved names: answer, v, e, i, pi, or any math.js function name (sum, max, mean, range, count, ...).

ANSWER KINDS
- MCQ: "correct" is an expression; give 3-5 distractor expressions that model real mistakes (sign error, forgot to divide, used wrong operation). They must differ from the correct answer for typical values.
- SPR: student-produced numeric answer; "correct" is an expression.
- MCQ_TEXT: for Reading & Writing — 4 text choices, the first one is correct; numbers usually cannot change, only small words via choice variables.

IMAGE INPUT
- The operator may send a photo or screenshot of a question. Read everything in it: passage, stem, answer choices, and the figure with all its labels. Write what you read into "transcript".
- Solve the original question yourself. Build the template so that the original question is one of its variants: fill "originalValues" with the value of every variable for the original question and "originalAnswer" with its correct answer. The server recomputes your formula with these values to catch mistakes.
- Do not copy long texts word for word: rephrase the math stem in your own words, and for Reading & Writing write a new original passage of similar length and difficulty that tests the same skill.

FIGURES
- If the question has a figure (geometry drawing, graph, number line, table, chart), redraw it as SVG in "svg" so the numbers in it change together with the variables. Rules:
  root <svg viewBox="0 0 W H" width="W" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"> with W at most 340 and H at most 300;
  shapes use stroke="currentColor" fill="none" stroke-width="2" (thin helper lines 1.5, dashed: stroke-dasharray="5 4"); text uses fill="currentColor" font-size="13"; shading uses fill="currentColor" fill-opacity="0.15";
  no colors, <style>, <script>, <image>, <foreignObject>, links or classes;
  labels may contain placeholders (<text ...>{a} cm</text>) and coordinates may be expressions (x="{=150 + 20*k|int}");
  the drawing may be "not to scale", but labels must stay inside the viewBox and must not overlap for any variant.
  Example, a right triangle with legs {a} and {b}:
  ${SVG_EXAMPLE}
- Only if the figure cannot be redrawn reasonably (a photo, a very detailed chart): set "svg" to null, give "figureBox" — the bounding box of the figure alone, in pixel coordinates of the input image — and keep every number that appears in the figure fixed (not a variable), because the picture will not change.
- No figure: "svg" and "figureBox" are both null.

TAXONOMY (use these ids for domainId/skillId):
${TAXONOMY.map((d) => `${d.id} (${d.section}, ${d.name}): ${d.skills.map((s) => `${s.id}=${s.name}`).join('; ')}`).join('\n')}

Keep the mathematical structure and difficulty of the original. Ranges should keep numbers realistic for a calculator-optional SAT problem.`;

/** SVG faqat oddiy chizma bo'lishi kerak; aks holda tashlab yuboriladi (frontend baribir DOMPurify bilan tozalaydi). */
export function cleanSvg(svg: string | null): string | undefined {
  const s = svg?.trim();
  if (!s || !s.startsWith('<svg') || !s.endsWith('</svg>') || s.length > 30_000) return undefined;
  if (/<(script|foreignObject|style|image|iframe)\b|\bon\w+\s*=|javascript:/i.test(s)) return undefined;
  return s;
}

function toSpec(s: AiSuggestionT): TemplateSpecInput {
  const variables: VariableDef[] = s.variables.map((v) => {
    if (v.type === 'choice') return { name: v.name, type: 'choice', options: v.options?.length ? v.options : ['?'] };
    if (v.type === 'decimal') {
      return {
        name: v.name,
        type: 'decimal',
        min: v.min ?? 0,
        max: v.max ?? 10,
        places: v.places ?? 1,
        ...(v.exclude?.length ? { exclude: v.exclude } : {}),
      };
    }
    return {
      name: v.name,
      type: 'int',
      min: Math.round(v.min ?? 1),
      max: Math.round(v.max ?? 10),
      ...(v.exclude?.length ? { exclude: v.exclude } : {}),
    };
  });
  const answer: TemplateSpecInput['answer'] =
    s.answerKind === 'MCQ_TEXT'
      ? { kind: 'MCQ_TEXT', choices: (s.textChoices ?? []).slice(0, 4) }
      : s.answerKind === 'SPR'
        ? { kind: 'SPR', correct: s.correct }
        : { kind: 'MCQ', correct: s.correct, distractors: s.distractors.map((d) => d.expr) };
  const svg = cleanSvg(s.svg);
  return {
    version: 1,
    stem: s.stem,
    ...(s.passage ? { passage: s.passage } : {}),
    ...(svg ? { svg } : {}),
    explanation: s.explanation,
    variables,
    derived: s.derived,
    constraints: s.constraints,
    answer,
  };
}

export interface OriginalCheck {
  /** Formulaning asl qiymatlardagi javobi AI aytgan asl javobga tengmi */
  answerMatches: boolean;
  expected: number | null;
  got: number | null;
  /** Diapazondan tashqari qiymatlar, bajarilmagan cheklovlar va h.k. */
  problems: string[];
}

const numOrStr = (p: string): number | string => (p !== '' && !Number.isNaN(Number(p)) ? Number(p) : p);
const truthy = (v: Value) => (typeof v === 'number' ? v !== 0 && !Number.isNaN(v) : typeof v === 'string' ? v.length > 0 : v);

/**
 * AI aytgan asl qiymatlarni shablonga qo'yib, javob formulasini qayta hisoblaydi.
 * Shablon asl savolni to'g'ri ifodalayaptimi — operator uchun mustaqil tekshiruv.
 */
export function checkOriginal(spec: TemplateSpec, s: Pick<AiSuggestionT, 'originalValues' | 'originalAnswer'>): OriginalCheck | null {
  const ans = spec.answer;
  if (ans.kind === 'MCQ_TEXT' || !s.originalAnswer.trim()) return null;
  const given = new Map(s.originalValues.map((v) => [v.name.trim(), v.value.trim()]));
  const problems: string[] = [];
  const scope: Record<string, Value> = {};
  try {
    for (const v of spec.variables) {
      const raw = given.get(v.name);
      if (raw === undefined || raw === '') {
        return { answerMatches: false, expected: null, got: null, problems: [`AI "${v.name}" uchun asl qiymatni bermadi`] };
      }
      if (v.type === 'choice') {
        const idx = v.options.findIndex((o) => String(o) === raw || String(o).split('|')[0].trim() === raw);
        if (idx < 0) problems.push(`"${v.name}" = ${raw} variantlar ro'yxatida yo'q`);
        const opt = idx >= 0 ? v.options[idx] : raw;
        const parts = String(opt).split('|').map((p) => p.trim());
        scope[v.name] = typeof opt === 'number' ? opt : numOrStr(parts[0]);
        scope[`${v.name}_i`] = Math.max(idx, 0);
        parts.slice(1).forEach((p, i) => (scope[`${v.name}_${i + 1}`] = numOrStr(p)));
        continue;
      }
      const n = evaluate(raw, {}, `"${v.name}" asl qiymati`);
      if (typeof n !== 'number') throw new Error(`"${v.name}" asl qiymati son emas: ${raw}`);
      scope[v.name] = n;
      if (v.type === 'fraction') {
        problems.push(`"${v.name}" kasr o'zgaruvchi — diapazon tekshirilmadi`);
        continue;
      }
      if (n < v.min || n > v.max) problems.push(`"${v.name}" = ${n} diapazondan tashqarida (${v.min}…${v.max}) — asl savol variantlar orasida chiqmaydi`);
      if (v.exclude?.includes(n)) problems.push(`"${v.name}" = ${n} istisnolar ro'yxatida`);
    }
    for (const d of spec.derived) scope[d.name] = evaluate(d.expr, scope, `hosilaviy "${d.name}"`);
    const got = evaluate(ans.correct, scope, 'javob formulasi');
    const expected = evaluate(s.originalAnswer, {}, 'asl javob');
    if (typeof got !== 'number' || typeof expected !== 'number') {
      return { answerMatches: false, expected: null, got: null, problems: [...problems, 'Javob son emas'] };
    }
    scope.answer = got;
    for (const c of spec.constraints) {
      let ok = false;
      try {
        ok = truthy(evaluate(c, scope, 'cheklov'));
      } catch {
        ok = false;
      }
      if (!ok) problems.push(`Asl qiymatlarda cheklov bajarilmaydi: ${c}`);
    }
    const answerMatches = Math.abs(got - expected) <= 1e-6 * Math.max(1, Math.abs(expected));
    return { answerMatches, expected, got, problems };
  } catch (e) {
    return { answerMatches: false, expected: null, got: null, problems: [...problems, `Asl qiymatlar bilan hisoblab bo'lmadi: ${(e as Error).message}`] };
  }
}

export type AiImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface AiInput {
  /** Savol matni yoki rasmga qo'shimcha izoh */
  text?: string;
  /** Savol rasmi (skrinshot yoki foto), base64 */
  image?: { mime: AiImageMime; data: string };
  section?: 'MATH' | 'RW';
}

let client: Anthropic | null = null;

/**
 * Savol matni yoki rasmini Claude'ga yuborib, shablon taklifini oladi. Natija avtomatik saqlanmaydi —
 * operator ko'rib, tahrirlab, tasdiqlashi shart.
 */
export async function suggestTemplate(input: AiInput) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(501, "AI yordamchi sozlanmagan: ANTHROPIC_API_KEY o'rnatilmagan", 'AI_DISABLED');
  }
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const text = input.text?.trim() ?? '';
  const hint = input.section ? `Section hint: ${input.section}\n\n` : '';
  const prompt = input.image
    ? `${hint}Convert the question in this image into a template.${text ? `\n\nOperator's note: ${text}` : ''}`
    : `${hint}Convert this question into a template:\n\n${text}`;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.image) content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mime, data: input.image.data } });
  content.push({ type: 'text', text: prompt });

  let response;
  try {
    // Rasm + chizma bilan javob uzun bo'lishi mumkin — oqim (stream) HTTP vaqt chegarasiga tushmaydi
    response = await client.beta.messages
      .stream({
        model: env.anthropicModel,
        max_tokens: 64000,
        // Xavfsizlik klassifikatori rad etsa, server boshqa modelga avtomatik o'tadi
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high', format: betaZodOutputFormat(AiSuggestion) },
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      })
      .finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AI so'rovlar limiti tugadi, birozdan keyin urinib ko'ring", 'AI_RATE_LIMIT');
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, "ANTHROPIC_API_KEY noto'g'ri", 'AI_AUTH');
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(502, `AI so'rov xatosi: ${e.message}`, 'AI_BAD_REQUEST');
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `AI xizmati xatosi (${e.status ?? '?'})`, 'AI_ERROR');
    throw e;
  }
  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'AI bu savolni qayta ishlashdan bosh tortdi', 'AI_REFUSAL');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new HttpError(502, "AI javobi juda uzun bo'lib ketdi — savolni qisqaroq qilib qayta urinib ko'ring", 'AI_TOO_LONG');
  }
  const suggestion = response.parsed_output;
  if (!suggestion) throw new HttpError(502, "AI javobini o'qib bo'lmadi, qayta urinib ko'ring", 'AI_PARSE');

  const spec = toSpec(suggestion);
  const validation = validateSpec(spec);
  const report = validation.ok ? runChecks(validation.spec, 100) : null;
  const original = validation.ok ? checkOriginal(validation.spec, suggestion) : null;
  const box = input.image && !spec.svg ? suggestion.figureBox : null;
  return {
    suggestion: {
      notes: suggestion.notes,
      transcript: suggestion.transcript,
      distractors: suggestion.distractors,
      svgDropped: Boolean(suggestion.svg) && !spec.svg,
    },
    spec,
    meta: {
      title: suggestion.title,
      section: suggestion.section,
      domainId: suggestion.domainId,
      skillId: suggestion.skillId,
      difficulty: suggestion.difficulty,
    },
    figureBox: box && box.width > 4 && box.height > 4 ? box : null,
    original,
    validation: validation.ok ? { ok: true as const, errors: [] } : validation,
    report,
    model: response.model,
  };
}
