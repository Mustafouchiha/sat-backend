import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Difficulty, Prisma, Section, TemplateStatus } from '@prisma/client';
import { parseSpr, runChecks, validateSpec, type TemplateSpec, type TemplateSpecInput } from '@sat/generator';
import { distributeByWeight, initialQuestionRating, TAXONOMY } from '@sat/shared';
import { createHash } from 'node:crypto';
// SDK zod helperi zod v4 sxemasini kutadi (zod 3.25 ichida "zod/v4" mavjud)
import { z } from 'zod/v4';
import { prisma } from '../db';
import { cleanSvg, SVG_EXAMPLE } from './ai';
import { aiClient, aiError, type Usage } from './aiClient';
import { HttpError } from './http';

// ───────────────────────── Sxemalar ─────────────────────────

export const GenQuestion = z.object({
  basedOn: z.number().int().nullable().describe('Sample mode: number of the sample question this one is modelled on (1-based); otherwise null'),
  skillId: z.string().describe('Skill id from the TAXONOMY list'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  title: z.string().describe('Short English title "<skill>: <what is tested>"'),
  passage: z.string().nullable().describe('Text, notes, table or data shown above the question; null if none'),
  stem: z.string().describe('The question itself'),
  answerType: z.enum(['MCQ', 'SPR']),
  choices: z.array(z.string()).describe('MCQ: exactly 4 answer choices, without letters; SPR: empty array'),
  correctIndex: z.number().int().nullable().describe('MCQ: 0-based index of the correct choice; SPR: null'),
  sprAnswer: z.string().nullable().describe('SPR: the exact answer, e.g. "12", "-3", "0.75", "7/2"; MCQ: null'),
  explanation: z.string().describe('Concise English solution shown to the student after answering'),
  svg: z.string().nullable().describe('Figure as SVG (see FIGURES) or null'),
});
export type GenQuestionT = z.infer<typeof GenQuestion>;

const GenOutput = z.object({
  topics: z.string().describe('Sample mode: the skills you identified in the sample, in Uzbek, one short line; otherwise an empty string'),
  questions: z.array(GenQuestion),
});

const VerifyOutput = z.object({
  results: z.array(
    z.object({
      number: z.number().int().describe('Question number as given'),
      answer: z.string().describe('MCQ: the letter (A-D) you found correct; SPR: your numeric answer'),
      sound: z.boolean().describe('true only if exactly one answer is correct and the question has no error or ambiguity'),
      issue: z.string().describe('If not sound: what is wrong, one short sentence in Uzbek; otherwise an empty string'),
    }),
  ),
});
export type Verdict = z.infer<typeof VerifyOutput>['results'][number];

// ───────────────────────── Ko'rsatmalar (Math va English alohida) ─────────────────────────

const taxonomyFor = (section: Section) =>
  TAXONOMY.filter((d) => d.section === section)
    .map((d) => `${d.id} (${d.name}): ${d.skills.map((s) => `${s.id}=${s.name}`).join('; ')}`)
    .join('\n');

const FIGURES = `FIGURES
- Geometry diagrams, coordinate graphs, scatterplots, number lines and bar charts are drawn as SVG in "svg":
  root <svg viewBox="0 0 W H" width="W" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"> with W at most 340 and H at most 300;
  shapes use stroke="currentColor" fill="none" stroke-width="2" (thin helper lines 1.5, dashed: stroke-dasharray="5 4"); text uses fill="currentColor" font-size="13"; shading uses fill="currentColor" fill-opacity="0.15";
  no colors, <style>, <script>, <image>, <foreignObject>, links or classes; every label inside the viewBox, labels never overlap.
  Example (right triangle with legs 6 and 8): ${SVG_EXAMPLE.replace('{a}', '6').replace('{b}', '8')}
- A table goes into "passage" as display math: $$\\begin{array}{|c|c|}\\hline x & y \\\\ \\hline 1 & 5 \\\\ \\hline 2 & 9 \\\\ \\hline\\end{array}$$
- No figure needed: "svg" is null. Never refer to a figure or table that you did not provide.`;

const MATH_SYSTEM = `You are a senior Digital SAT Math item writer. You write ORIGINAL practice questions for a test-prep center. Students rely on them to prepare for the real exam, so every question must be mathematically correct, unambiguous, and match the style of official Digital SAT Math questions (College Board, Bluebook).

WHAT TO WRITE
- English only. Stems are short and precise, as on the SAT: "What is the value of $x$?", "Which equation represents this relationship?", "How many ...?".
- Follow the requested skill and difficulty. EASY: one or two routine steps. MEDIUM: several steps or a context to translate into math. HARD: multi-step reasoning, an unfamiliar setup or a common trap, like the hardest second-module questions.
- "MCQ": exactly 4 choices and exactly one correct. Distractors come from real mistakes (sign error, wrong operation, solving for the wrong quantity, stopping one step early, misreading the graph), never random numbers. Numeric choices in increasing order; equations and expressions in a natural order.
- "SPR" (student-produced response), about one question in four, only when the answer is one number. The answer must fit the SAT answer box: at most 5 characters if positive, 6 if negative (the slash and the minus sign count). Write it as an integer, a terminating decimal or a fraction like 7/2 — no units, commas, mixed numbers, π or radicals. Choose numbers so the answer is clean.
- Realistic, culturally neutral contexts with consistent units.
- Never copy an existing question. When you work from a sample, keep its skill, structure and difficulty but change the context, numbers and wording so it is a genuinely new question.
- Solve every question yourself before you write it down and double-check the arithmetic and that only one choice is correct.

FORMAT
- Math in $...$ (KaTeX): \\dfrac{a}{b}, \\le, \\ge, \\cdot, x^{2}, \\sqrt{x}. Money: write the dollar sign escaped as \\$ (for example \\$12.50).
- "passage" holds a table, data or a long context when the question needs it; otherwise null.
- "explanation": a concise solution in English (2–6 sentences) with the key steps in $...$; name the trap behind the most tempting wrong choice when there is one.
- "title": "<short skill name>: <what is tested>", e.g. "Linear equations: variables on both sides".

${FIGURES}

TAXONOMY — "skillId" must be one of these Math skills:
${taxonomyFor('MATH')}`;

const RW_SYSTEM = `You are a senior Digital SAT Reading and Writing item writer. You write ORIGINAL practice questions for a test-prep center. Students rely on them to prepare for the real exam, so every question must have exactly one defensibly correct answer and match the style of official Digital SAT Reading and Writing questions (College Board, Bluebook).

WHAT TO WRITE (as on the Digital SAT)
- English only. Every question has its own short passage in "passage" (25–150 words). Topics rotate among science, history and social studies, the humanities and literature. Write the passages yourself: invent plausible researchers, studies, artists and places, never quote real copyrighted texts, and never attribute invented findings to real people.
- Cross-Text Connections: two short texts in "passage", labelled "Text 1" and "Text 2" and separated by a blank line.
- Rhetorical Synthesis: "passage" is a student's notes as bullet lines starting with "• ".
- Command of Evidence (Quantitative): the data comes from a table in "passage" or a bar chart / graph in "svg".
- A blank in the passage is exactly ______ (six underscores). The sentence the question asks about ("the underlined sentence" on the real test) is marked with **double asterisks** and called "the sentence in bold".
- Use the standard SAT question wording for the skill, for example:
  Words in Context — "Which choice completes the text with the most logical and precise word or phrase?"
  Text Structure and Purpose — "Which choice best states the main purpose of the text?" / "Which choice best describes the function of the sentence in bold in the text as a whole?"
  Cross-Text Connections — "Based on the texts, how would the author of Text 2 most likely respond to the claim in Text 1?"
  Central Ideas and Details — "Which choice best states the main idea of the text?"
  Command of Evidence (Textual) — "Which finding, if true, would most directly support the researcher's claim?"
  Command of Evidence (Quantitative) — "Which choice most effectively uses data from the table to complete the statement?"
  Inferences — "Which choice most logically completes the text?"
  Boundaries / Form, Structure, and Sense — "Which choice completes the text so that it conforms to the conventions of Standard English?"
  Transitions — "Which choice completes the text with the most logical transition?"
  Rhetorical Synthesis — "The student wants to <goal>. Which choice most effectively uses relevant information from the notes to accomplish this goal?"
- "answerType" is always "MCQ" with exactly 4 choices. Choices are parallel in form and similar in length; exactly one is correct, and each wrong choice is wrong for a clear reason (contradicts the text, too broad, too narrow, unsupported, illogical transition, grammatically incorrect).
- Difficulty: EASY — common vocabulary and a direct relationship; MEDIUM — typical SAT; HARD — dense academic prose, a subtle difference between the two best choices, less common vocabulary.
- Never copy an existing question. When you work from a sample, keep its skill, question type and difficulty but write a new passage on a different topic.
- Answer every question yourself before you write it down and make sure that only one choice can be defended.

FORMAT
- "explanation": concise English explanation (2–5 sentences): why the correct choice is right and why the most tempting wrong choice is wrong.
- "title": "<skill>: <short topic>", e.g. "Transitions: coral reef study".
- "svg" is null unless the question needs a chart or graph.

${FIGURES}

TAXONOMY — "skillId" must be one of these Reading and Writing skills:
${taxonomyFor('RW')}`;

export const generatorSystem = (section: Section) => (section === 'MATH' ? MATH_SYSTEM : RW_SYSTEM);

const VERIFY_SYSTEM = `You are an expert Digital SAT tutor checking new practice questions before students see them. You are NOT given the answer key. Solve every question independently and carefully, then report your answer and whether the question is sound.

A question is NOT sound when: no choice is correct, more than one choice can be defended, information is missing or ambiguous, there is a factual, mathematical or grammatical error, the figure or table contradicts the text, the text refers to a figure that is not there, or (Reading and Writing) the passage does not clearly support the correct answer.
Be strict: if in doubt, mark it not sound and say why in one short sentence in Uzbek.
SVG markup, when present, is the figure the student sees; read its labels and coordinates.`;

// ───────────────────────── Yordamchilar ─────────────────────────

/** Faqat Opus/Sonnet uchun: xavfsizlik klassifikatori rad etsa, server boshqa modelga o'tadi. */
export function fallbackOpts(model: string): { betas?: string[]; fallbacks?: 'default' } {
  return /opus|sonnet/.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
}

const LETTERS = ['A', 'B', 'C', 'D'];

export interface QuestionText {
  passage?: string | null;
  stem: string;
  choices?: string[] | null;
  svg?: string | null;
  spr?: boolean;
}

/** Savolni matn ko'rinishida (AI tekshiruvchi va AI ustoz uchun). */
export function questionAsText(q: QuestionText): string {
  const parts: string[] = [];
  if (q.passage) parts.push(`Passage:\n${q.passage}`);
  if (q.svg) parts.push(`Figure (SVG):\n${q.svg}`);
  parts.push(`Question: ${q.stem}`);
  if (q.choices?.length) parts.push(q.choices.map((c, i) => `${LETTERS[i] ?? i + 1}) ${c}`).join('\n'));
  else if (q.spr) parts.push('(Student-produced response: the student types a number.)');
  return parts.join('\n\n');
}

export type Slot = { skillId: string; difficulty: Difficulty };

/** Mavzular bo'yicha reja: ko'nikmalar navbatma-navbat, aralash qiyinlik ~30/40/30. */
export function planSlots(skillIds: string[], difficulty: Difficulty | 'MIXED', count: number, rnd: () => number = Math.random): Slot[] {
  if (!skillIds.length || count <= 0) return [];
  let diffs: Difficulty[];
  if (difficulty === 'MIXED') {
    const d = distributeByWeight(count, [
      { id: 'EASY', weight: 0.3 },
      { id: 'MEDIUM', weight: 0.4 },
      { id: 'HARD', weight: 0.3 },
    ]);
    diffs = (['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).flatMap((x) => Array.from({ length: d[x] ?? 0 }, () => x));
    for (let i = diffs.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [diffs[i], diffs[j]] = [diffs[j], diffs[i]];
    }
  } else {
    diffs = Array.from({ length: count }, () => difficulty);
  }
  return diffs.map((d, i) => ({ skillId: skillIds[i % skillIds.length], difficulty: d }));
}

export const skillById = (id: string) => {
  for (const d of TAXONOMY) {
    const s = d.skills.find((x) => x.id === id);
    if (s) return { ...s, domainId: d.id, domainName: d.name, section: d.section as Section };
  }
  return null;
};

export function skillsOf(section: Section, domainId?: string | null): string[] {
  return TAXONOMY.filter((d) => d.section === section && (!domainId || d.id === domainId)).flatMap((d) => d.skills.map((s) => s.id));
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Bankdagi shu mavzudagi savollarning qisqa matni — AI ularni takrorlamasligi uchun. */
export async function existingStems(section: Section, skillIds: string[], limit = 25): Promise<string[]> {
  const rows = await prisma.questionTemplate.findMany({
    where: { section, skillId: { in: skillIds }, status: { not: 'ARCHIVED' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { spec: true },
  });
  return rows.map((r) => {
    const s = r.spec as { stem?: string; passage?: string };
    return short(`${s.passage ?? ''} ${s.stem ?? ''}`.replace(/\s+/g, ' ').trim(), 200);
  });
}

// ───────────────────────── Generatsiya ─────────────────────────

export type SampleMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
export interface SampleFile {
  mime: SampleMime;
  /** base64 (data: prefiksisiz) */
  data: string;
  name?: string;
}

export interface BatchInput {
  section: Section;
  model: string;
  count: number;
  /** Mavzu rejimi: har bir savol uchun ko'nikma va qiyinlik */
  slots?: Slot[];
  /** Namuna rejimi: eski SAT testi (matn va/yoki rasm/PDF) */
  sample?: { text?: string; files?: SampleFile[]; usedBasedOn?: number[] };
  /** Admin izohi */
  note?: string;
  /** O'quvchining shu mavzudagi xatolari (noto'g'ri tushunchalarni nishonga olish uchun) */
  studentContext?: string;
  /** Takrorlanmasligi kerak bo'lgan mavjud savollar */
  avoid: string[];
}

export interface BatchResult {
  questions: GenQuestionT[];
  topics: string;
  usage: Usage;
  model: string;
}

export function batchInstructions(inp: BatchInput): string {
  const lines: string[] = [`Write exactly ${inp.count} new ${inp.section === 'MATH' ? 'Math' : 'Reading and Writing'} question${inp.count > 1 ? 's' : ''}.`];
  if (inp.sample) {
    const used = inp.sample.usedBasedOn?.length ? ` Sample questions already used as models: ${inp.sample.usedBasedOn.join(', ')} — prefer others.` : '';
    lines.push(
      `The SAMPLE above is from an earlier SAT test. Number its questions in order (1, 2, 3, ...), identify the skill and difficulty of each, then write new questions modelled on them: same skill, question type and difficulty, new context and numbers. Spread the new questions over different sample questions and set "basedOn".${used} If the sample contains questions from the other section, ignore them. Put the skills you identified, in Uzbek, into "topics".`,
    );
  }
  if (inp.slots?.length) {
    lines.push('Plan — one question per line, in this order:');
    inp.slots.forEach((s, i) => {
      const sk = skillById(s.skillId);
      lines.push(`${i + 1}. skillId=${s.skillId} (${sk?.name ?? s.skillId}), difficulty=${s.difficulty}`);
    });
  }
  if (inp.studentContext) {
    lines.push(`These questions are for a student who made the mistakes below. Target the same misconceptions (make the tempting wrong choices match them), but do not repeat these questions.\n${inp.studentContext}`);
  }
  if (inp.note?.trim()) lines.push(`Operator's note (may be in Uzbek): ${inp.note.trim()}`);
  if (inp.avoid.length) lines.push(`Questions already in the bank — do not repeat or closely paraphrase them:\n${inp.avoid.map((a) => `- ${a}`).join('\n')}`);
  return lines.join('\n\n');
}

function stopCheck(stop: string | null | undefined): void {
  if (stop === 'refusal') throw new HttpError(422, 'AI bu so\'rovni bajarishdan bosh tortdi', 'AI_REFUSAL');
  if (stop === 'max_tokens') throw new HttpError(502, "AI javobi juda uzun bo'lib ketdi — kamroq savol so'rab ko'ring", 'AI_TOO_LONG');
}

export async function generateBatch(inp: BatchInput): Promise<BatchResult> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (inp.sample) {
    for (const f of inp.sample.files ?? []) {
      content.push(
        f.mime === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } }
          : { type: 'image', source: { type: 'base64', media_type: f.mime, data: f.data } },
      );
    }
    // Namuna har bir partiyada bir xil — kesh (keyingi partiyalar arzonroq)
    content.push({
      type: 'text',
      text: `SAMPLE (earlier SAT test material):\n\n${inp.sample.text?.trim() || '(see the attached pages)'}`,
      cache_control: { type: 'ephemeral' },
    });
  }
  content.push({ type: 'text', text: batchInstructions(inp) });

  let res;
  try {
    res = await aiClient()
      .beta.messages.stream({
        model: inp.model,
        max_tokens: 32000,
        ...fallbackOpts(inp.model),
        output_config: { effort: 'high', format: betaZodOutputFormat(GenOutput) },
        system: [{ type: 'text', text: generatorSystem(inp.section), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }],
      })
      .finalMessage();
  } catch (e) {
    aiError(e);
  }
  stopCheck(res.stop_reason);
  const out = res.parsed_output;
  if (!out) throw new HttpError(502, "AI javobini o'qib bo'lmadi", 'AI_PARSE');
  return { questions: out.questions, topics: out.topics, usage: res.usage, model: res.model };
}

/** Javob kalitisiz: boshqa model savollarni mustaqil yechadi; javobi mos kelmasa yoki savolda xato topsa — rad etiladi. */
export async function verifyBatch(section: Section, qs: GenQuestionT[], model: string): Promise<{ verdicts: Map<number, Verdict>; usage: Usage; model: string }> {
  const body = qs
    .map((q, i) => `### Question ${i + 1} (${q.answerType === 'SPR' ? 'student-produced response' : 'multiple choice'})\n${questionAsText({ ...q, spr: q.answerType === 'SPR' })}`)
    .join('\n\n');
  let res;
  try {
    res = await aiClient()
      .beta.messages.stream({
        model,
        max_tokens: 24000,
        ...fallbackOpts(model),
        output_config: { effort: 'high', format: betaZodOutputFormat(VerifyOutput) },
        system: VERIFY_SYSTEM,
        messages: [{ role: 'user', content: `Section: ${section === 'MATH' ? 'Math' : 'Reading and Writing'}\n\n${body}` }],
      })
      .finalMessage();
  } catch (e) {
    aiError(e);
  }
  stopCheck(res.stop_reason);
  const out = res.parsed_output;
  if (!out) throw new HttpError(502, "AI tekshiruv javobini o'qib bo'lmadi", 'AI_PARSE');
  return { verdicts: new Map(out.results.map((r) => [r.number, r])), usage: res.usage, model: res.model };
}

// ───────────────────────── Tekshiruv va saqlash ─────────────────────────

const normChoice = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Javob matnidagi oxirgi son ("x = 7/2" -> 3.5). */
export function numberOf(s: string | null | undefined): number | null {
  const tokens = (s ?? '').replace(/[−–—]/g, '-').replace(/,/g, '').match(/-?\d*\.?\d+(?:\/-?\d*\.?\d+)?/g);
  if (!tokens?.length) return null;
  const t = tokens[tokens.length - 1];
  const [a, b] = t.split('/').map(Number);
  const v = b === undefined ? a : b === 0 ? NaN : a / b;
  return Number.isFinite(v) ? v : null;
}

export function answersMatch(q: Pick<GenQuestionT, 'answerType' | 'correctIndex' | 'sprAnswer'>, v: Pick<Verdict, 'answer'>): boolean {
  if (q.answerType === 'MCQ') {
    const letter = /\b([A-D])\b/.exec(v.answer.toUpperCase())?.[1];
    return !!letter && LETTERS.indexOf(letter) === q.correctIndex;
  }
  const a = numberOf(q.sprAnswer);
  const b = numberOf(v.answer);
  return a !== null && b !== null && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a));
}

export type CheckResult =
  | { ok: true; spec: TemplateSpec; domainId: string; skillId: string }
  | { ok: false; reason: string };

/** AI savolini tizim shabloniga aylantirish va tekshirish (o'zgaruvchisiz, bitta variant). */
export function checkGenerated(section: Section, q: GenQuestionT, fallbackSkillId?: string): CheckResult {
  let sk = skillById(q.skillId);
  if (!sk || sk.section !== section) sk = fallbackSkillId ? skillById(fallbackSkillId) : null;
  if (!sk || sk.section !== section) return { ok: false, reason: `Noma'lum ko'nikma: ${q.skillId}` };
  const stem = q.stem.trim();
  if (stem.length < 5) return { ok: false, reason: "Savol matni bo'sh" };
  if (section === 'RW' && q.answerType !== 'MCQ') return { ok: false, reason: 'R&W savoli faqat 4 variantli bo\'ladi' };
  if (section === 'RW' && !q.passage?.trim()) return { ok: false, reason: "R&W savolida matn (passage) yo'q" };

  let answer: TemplateSpecInput['answer'];
  if (q.answerType === 'MCQ') {
    const choices = q.choices.map((c) => c.trim());
    if (choices.length !== 4 || choices.some((c) => !c)) return { ok: false, reason: 'Aynan 4 ta variant kerak' };
    if (new Set(choices.map(normChoice)).size !== 4) return { ok: false, reason: 'Variantlar takrorlangan' };
    if (q.correctIndex === null || q.correctIndex < 0 || q.correctIndex > 3) return { ok: false, reason: "To'g'ri javob ko'rsatilmagan" };
    // R&W: variantlar aralashtiriladi (AI to'g'ri javobni ko'pincha bir joyga qo'yadi); Math: o'sish tartibi saqlanadi
    answer = { kind: 'MCQ_TEXT', choices, correctIndex: q.correctIndex, shuffle: section === 'RW' };
  } else {
    const p = parseSpr(q.sprAnswer ?? '');
    if (!p.valid || p.value === undefined) return { ok: false, reason: `SPR javobi SAT formatiga mos emas: ${q.sprAnswer ?? '—'}` };
    answer = { kind: 'SPR', correct: p.normalized ?? String(p.value) };
  }

  let svg: string | undefined;
  if (q.svg?.trim()) {
    svg = cleanSvg(q.svg);
    if (!svg) return { ok: false, reason: 'Chizma (SVG) yaroqsiz' };
  }
  const raw: TemplateSpecInput = {
    version: 1,
    stem,
    ...(q.passage?.trim() ? { passage: q.passage.trim() } : {}),
    ...(svg ? { svg } : {}),
    explanation: q.explanation.trim(),
    variables: [],
    derived: [],
    constraints: [],
    answer,
  };
  const v = validateSpec(raw);
  if (!v.ok) return { ok: false, reason: v.errors.join('; ') };
  const report = runChecks(v.spec, 5);
  if (!report.ok) return { ok: false, reason: report.errors[0] ?? "Avto-tekshiruvdan o'tmadi" };
  return { ok: true, spec: v.spec, domainId: sk.domainId, skillId: sk.id };
}

/** Bir xil savol ikki marta saqlanmasligi uchun barmoq izi. */
export function questionHash(q: Pick<GenQuestionT, 'passage' | 'stem' | 'choices'>): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return createHash('sha1')
    .update(norm(`${q.passage ?? ''} ${q.stem} ${q.choices.join(' ')}`))
    .digest('hex')
    .slice(0, 16);
}

export async function saveGenerated(
  q: GenQuestionT,
  checked: Extract<CheckResult, { ok: true }>,
  opts: { section: Section; status: TemplateStatus; createdById: string | null },
): Promise<{ id: string; version: number } | null> {
  const hash = questionHash(q);
  const dup = await prisma.questionTemplate.findFirst({ where: { tags: { has: `aih:${hash}` } }, select: { id: true } });
  if (dup) return null;
  const spec = checked.spec as unknown as Prisma.InputJsonValue;
  const t = await prisma.questionTemplate.create({
    data: {
      title: short(q.title.trim() || 'AI savol', 200),
      section: opts.section,
      domainId: checked.domainId,
      skillId: checked.skillId,
      difficulty: q.difficulty,
      status: opts.status,
      spec,
      rating: initialQuestionRating(q.difficulty),
      tags: ['ai', `aih:${hash}`],
      createdById: opts.createdById,
      updatedById: opts.createdById,
      revisions: { create: { version: 1, spec, createdById: opts.createdById } },
    },
    select: { id: true, version: true },
  });
  return t;
}
