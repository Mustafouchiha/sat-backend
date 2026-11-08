import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { runChecks, validateSpec, type TemplateSpecInput, type VariableDef } from '@sat/generator';
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

const AiSuggestion = z.object({
  section: z.enum(['MATH', 'RW']),
  domainId: z.string().nullable(),
  skillId: z.string().nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  title: z.string(),
  stem: z.string().describe('Question text with {placeholders} and $...$ LaTeX'),
  passage: z.string().nullable(),
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
  notes: z.string().describe('Short notes for the operator in Uzbek: what was varied and what to double-check'),
});

export type AiSuggestionT = z.infer<typeof AiSuggestion>;

const SYSTEM = `You convert SAT-style questions into parameterized templates for a test-prep generator.
The generator substitutes random values into variables so every student gets the same question with different numbers.

TEMPLATE LANGUAGE
- Placeholders in text: {a}, {a|format}, {=expr|format} (inline math.js expression), {p.1} (2nd part of a choice option "Maria|she").
- Formats: coef (1 -> "", -1 -> "-"), signed ("+ 3"/"- 3"), signedcoef, frac (reduced LaTeX fraction), slash (p/q), d2 (fixed 2 decimals), r2 (round, trim zeros), comma (thousands), sqrt (simplified radical of the value), abs.
- Math must be in $...$ (KaTeX). Write currency as \\$ (escaped dollar).
- Expressions use math.js syntax: + - * / ^, sqrt(), abs(), round(x, n), floor, ceil, mod(a,b) or a % b, gcd, lcm, min, max, pi.
  Extra helpers: isInt(x), sind/cosd/tand (degrees), hyp(a,b).
- Variable types: int (min, max, optional exclude), decimal (min, max, places), choice (options list).
- "derived" variables are computed in order from earlier variables.
- "constraints" are boolean math.js expressions that must hold (e.g. "a != b", "isInt(answer)", "answer > 0"). The special name "answer" holds the computed correct answer.
- Prefer constructing the answer first (e.g. pick the solution x0, then derive the coefficients) so answers stay clean integers.
- Do not use reserved names: answer, v, e, i, pi, or any math.js function name (sum, max, mean, range, count, ...).

ANSWER KINDS
- MCQ: "correct" is an expression; give 3-5 distractor expressions that model real mistakes (sign error, forgot to divide, used wrong operation). They must differ from the correct answer for typical values.
- SPR: student-produced numeric answer; "correct" is an expression.
- MCQ_TEXT: for Reading & Writing — 4 text choices, the first one is correct; numbers usually cannot change, only small words via choice variables.

TAXONOMY (use these ids for domainId/skillId):
${TAXONOMY.map((d) => `${d.id} (${d.section}, ${d.name}): ${d.skills.map((s) => `${s.id}=${s.name}`).join('; ')}`).join('\n')}

Keep the mathematical structure and difficulty of the original. Ranges should keep numbers realistic for a calculator-optional SAT problem.`;

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
  return {
    version: 1,
    stem: s.stem,
    ...(s.passage ? { passage: s.passage } : {}),
    explanation: s.explanation,
    variables,
    derived: s.derived,
    constraints: s.constraints,
    answer,
  };
}

let client: Anthropic | null = null;

/**
 * Savol matnini Claude'ga yuborib, shablon taklifini oladi. Natija avtomatik saqlanmaydi —
 * operator ko'rib, tahrirlab, tasdiqlashi shart.
 */
export async function suggestTemplate(text: string, sectionHint?: 'MATH' | 'RW') {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(501, "AI yordamchi sozlanmagan: ANTHROPIC_API_KEY o'rnatilmagan", 'AI_DISABLED');
  }
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: env.anthropicModel,
      max_tokens: 16000,
      // Xavfsizlik klassifikatori rad etsa, server boshqa modelga avtomatik o'tadi
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: betaZodOutputFormat(AiSuggestion) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${sectionHint ? `Section hint: ${sectionHint}\n\n` : ''}Convert this question into a template:\n\n${text}`,
        },
      ],
    });
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
  const suggestion = response.parsed_output;
  if (!suggestion) throw new HttpError(502, "AI javobini o'qib bo'lmadi, qayta urinib ko'ring", 'AI_PARSE');

  const spec = toSpec(suggestion);
  const validation = validateSpec(spec);
  const report = validation.ok ? runChecks(validation.spec, 100) : null;
  return {
    suggestion,
    spec,
    meta: {
      title: suggestion.title,
      section: suggestion.section,
      domainId: suggestion.domainId,
      skillId: suggestion.skillId,
      difficulty: suggestion.difficulty,
    },
    validation: validation.ok ? { ok: true as const, errors: [] } : validation,
    report,
    model: response.model,
  };
}
