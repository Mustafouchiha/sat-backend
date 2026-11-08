import { ZodError } from 'zod';
import { TemplateError } from './errors';
import { generateVariant } from './generate';
import { compileExpr, reservedNameReason } from './math';
import { inlineExpressions } from './render';
import { templateSpecSchema, type TemplateSpec, type Variant } from './types';

function zodMessages(e: ZodError): string[] {
  return e.issues.map((i) => `${i.path.join('.') || 'shablon'}: ${i.message}`);
}

/** Shablonning tuzilishi va ifodalar sintaksisini tekshiradi (variant yasamasdan). */
export function validateSpec(raw: unknown): { ok: true; spec: TemplateSpec } | { ok: false; errors: string[] } {
  const parsed = templateSpecSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: zodMessages(parsed.error) };
  const spec = parsed.data;
  const errors: string[] = [];
  const names = new Set<string>();

  const declare = (name: string, where: string) => {
    if (names.has(name)) errors.push(`${where}: "${name}" nomi takrorlangan`);
    const reason = reservedNameReason(name);
    if (reason) errors.push(`${where}: ${reason}`);
    names.add(name);
  };

  for (const v of spec.variables) {
    declare(v.name, "O'zgaruvchi");
    if (v.type === 'int' && v.min > v.max) errors.push(`${v.name}: min max dan katta`);
    if (v.type === 'decimal' && v.min > v.max) errors.push(`${v.name}: min max dan katta`);
    if (v.type === 'fraction') {
      if (v.numMin > v.numMax) errors.push(`${v.name}: surat diapazoni noto'g'ri`);
      if (v.denMin > v.denMax) errors.push(`${v.name}: maxraj diapazoni noto'g'ri`);
      names.add(`${v.name}_n`);
      names.add(`${v.name}_d`);
    }
    if (v.type === 'choice') names.add(`${v.name}_i`);
  }
  for (const d of spec.derived) declare(d.name, 'Hosilaviy');

  const exprs: Array<[string, string]> = [];
  spec.derived.forEach((d) => exprs.push([d.expr, `hosilaviy ${d.name}`]));
  spec.constraints.forEach((c) => exprs.push([c, 'cheklov']));
  if (spec.answer.kind === 'MCQ') {
    exprs.push([spec.answer.correct, 'javob']);
    spec.answer.distractors.forEach((d) => exprs.push([d, "chalg'ituvchi"]));
  } else if (spec.answer.kind === 'SPR') {
    exprs.push([spec.answer.correct, 'javob']);
  }
  const texts = [spec.stem, spec.passage, spec.explanation, spec.svg];
  if (spec.answer.kind === 'MCQ_TEXT') texts.push(...spec.answer.choices);
  if (spec.answer.kind === 'MCQ' && spec.answer.choiceTemplate) texts.push(spec.answer.choiceTemplate);
  for (const t of texts) if (t) inlineExpressions(t).forEach((e) => exprs.push([e, 'matn ichidagi ifoda']));

  for (const [e, where] of exprs) {
    try {
      compileExpr(e);
    } catch (err) {
      errors.push(`${where}: ${(err as Error).message}`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, spec };
}

/** validateSpec + xato bo'lsa TemplateError tashlaydi. */
export function parseSpec(raw: unknown): TemplateSpec {
  const r = validateSpec(raw);
  if (!r.ok) throw new TemplateError('SCHEMA', r.errors.join('\n'), { errors: r.errors });
  return r.spec;
}

export interface CheckReport {
  ok: boolean;
  runs: number;
  successes: number;
  failures: number;
  avgAttempts: number;
  maxAttemptsUsed: number;
  uniqueVariants: number;
  rejections: Record<string, number>;
  divisionByZeroOrNaN: number;
  duplicateChoiceRejections: number;
  constraintRejections: number;
  answerDistribution: Record<string, number>;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

/**
 * Avto-tekshiruv: N ta (standart 500) variant generatsiya qilib, cheklovlar, takroriy javob
 * variantlari, nolga bo'lish va boshqa muammolar bo'yicha hisobot beradi.
 */
export function runChecks(spec: TemplateSpec, runs = 500, seedBase = 1): CheckReport {
  const t0 = Date.now();
  const report: CheckReport = {
    ok: false,
    runs,
    successes: 0,
    failures: 0,
    avgAttempts: 0,
    maxAttemptsUsed: 0,
    uniqueVariants: 0,
    rejections: {},
    divisionByZeroOrNaN: 0,
    duplicateChoiceRejections: 0,
    constraintRejections: 0,
    answerDistribution: {},
    errors: [],
    warnings: [],
    durationMs: 0,
  };
  const unique = new Set<string>();
  const failureReasons = new Map<string, number>();
  let attemptsSum = 0;

  for (let i = 0; i < runs; i++) {
    const seed = ((seedBase + i * 7919) % 2147483646) + 1;
    try {
      const v = generateVariant(spec, seed);
      report.successes++;
      attemptsSum += v.attempts;
      report.maxAttemptsUsed = Math.max(report.maxAttemptsUsed, v.attempts);
      for (const [k, n] of Object.entries(v.rejections)) report.rejections[k] = (report.rejections[k] ?? 0) + n;
      unique.add(`${v.stem}|${v.passage ?? ''}|${(v.choices ?? []).map((c) => c.text).join('|')}`);
      const key = v.correctLabel ?? 'SPR';
      report.answerDistribution[key] = (report.answerDistribution[key] ?? 0) + 1;
    } catch (e) {
      report.failures++;
      const msg = (e as Error).message;
      failureReasons.set(msg, (failureReasons.get(msg) ?? 0) + 1);
      if (e instanceof TemplateError && e.code !== 'CONSTRAINTS') {
        report.errors.push(msg);
        break; // tuzilish xatosi — davom etishdan foyda yo'q
      }
      if (e instanceof TemplateError && e.details?.rejections) {
        for (const [k, n] of Object.entries(e.details.rejections as Record<string, number>)) {
          report.rejections[k] = (report.rejections[k] ?? 0) + n;
        }
      }
    }
  }

  for (const [k, n] of Object.entries(report.rejections)) {
    if (k === 'nan' || k.startsWith('error:')) report.divisionByZeroOrNaN += n;
    else if (k === 'duplicate_choices') report.duplicateChoiceRejections += n;
    else if (k.startsWith('constraint:')) report.constraintRejections += n;
  }
  for (const [msg, n] of failureReasons) {
    if (!report.errors.includes(msg)) report.errors.push(`${msg} (${n} marta)`);
  }

  report.uniqueVariants = unique.size;
  report.avgAttempts = report.successes ? Math.round((attemptsSum / report.successes) * 100) / 100 : 0;

  if (report.successes > 0) {
    if (report.avgAttempts > 25) {
      report.warnings.push(
        `Generator sekin: bitta variant uchun o'rtacha ${report.avgAttempts} urinish. Diapazon yoki cheklovlarni yumshating.`,
      );
    }
    const minUnique = Math.min(30, Math.floor(runs * 0.1));
    if (spec.variables.length > 0 && report.uniqueVariants < minUnique) {
      report.warnings.push(`Variantlar soni kam: ${runs} ta urinishdan faqat ${report.uniqueVariants} ta har xil variant.`);
    }
    if (spec.answer.kind !== 'SPR' && report.successes >= 40) {
      for (const l of ['A', 'B', 'C', 'D']) {
        const share = (report.answerDistribution[l] ?? 0) / report.successes;
        if (share < 0.1) report.warnings.push(`To'g'ri javob "${l}" juda kam tushyapti (${Math.round(share * 100)}%).`);
      }
    }
    if (report.duplicateChoiceRejections > runs) {
      report.warnings.push(
        `Javob variantlari tez-tez bir xil chiqyapti (${report.duplicateChoiceRejections} marta qayta urinildi). Chalg'ituvchilarni o'zgartiring.`,
      );
    }
  }

  report.ok = report.failures === 0 && report.errors.length === 0 && report.successes === runs;
  report.durationMs = Date.now() - t0;
  return report;
}

/** Operatorga ko'rsatish uchun N ta tasodifiy variant (to'g'ri javob bilan). */
export function previewVariants(spec: TemplateSpec, count = 10, seedBase?: number): Variant[] {
  const base = seedBase ?? Math.floor(Math.random() * 1_000_000_000);
  const out: Variant[] = [];
  for (let i = 0; i < count; i++) out.push(generateVariant(spec, ((base + i * 104729) % 2147483646) + 1));
  return out;
}
