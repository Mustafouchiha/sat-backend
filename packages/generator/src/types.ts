import { z } from 'zod';

const identifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Nom faqat lotin harfi, raqam va _ dan iborat bo'lishi va harf bilan boshlanishi kerak");

export const intVarSchema = z.object({
  name: identifier,
  type: z.literal('int'),
  min: z.number().int(),
  max: z.number().int(),
  step: z.number().int().positive().optional(),
  exclude: z.array(z.number()).optional(),
});

export const decimalVarSchema = z.object({
  name: identifier,
  type: z.literal('decimal'),
  min: z.number(),
  max: z.number(),
  places: z.number().int().min(0).max(6).optional(),
  step: z.number().positive().optional(),
  exclude: z.array(z.number()).optional(),
});

export const fractionVarSchema = z.object({
  name: identifier,
  type: z.literal('fraction'),
  numMin: z.number().int(),
  numMax: z.number().int(),
  denMin: z.number().int().positive(),
  denMax: z.number().int().positive(),
  allowInteger: z.boolean().optional(),
});

export const choiceVarSchema = z.object({
  name: identifier,
  type: z.literal('choice'),
  options: z.array(z.union([z.string(), z.number()])).min(1),
});

export const variableSchema = z.discriminatedUnion('type', [
  intVarSchema,
  decimalVarSchema,
  fractionVarSchema,
  choiceVarSchema,
]);

export const derivedSchema = z.object({
  name: identifier,
  expr: z.string().min(1),
});

/**
 * Javob turlari:
 *  - MCQ: to'g'ri javob formulasi + chalg'ituvchi formulalar (sonli variantlar)
 *  - MCQ_TEXT: 4 ta matnli variant (R&W), birinchisi (yoki correctIndex) to'g'ri
 *  - SPR: o'quvchi o'zi kiritadigan javob (Student-Produced Response)
 */
export const answerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('MCQ'),
    correct: z.string().min(1),
    distractors: z.array(z.string().min(1)).min(3, 'Kamida 3 ta chalg\'ituvchi formula kerak'),
    format: z.string().optional(),
    choiceTemplate: z.string().optional(),
  }),
  z.object({
    kind: z.literal('MCQ_TEXT'),
    choices: z.array(z.string().min(1)).length(4, 'Aynan 4 ta variant kerak'),
    correctIndex: z.number().int().min(0).max(3).optional(),
    shuffle: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('SPR'),
    correct: z.string().min(1),
  }),
]);

export const templateSpecSchema = z.object({
  version: z.literal(1).default(1),
  stem: z.string().min(1, 'Savol matni bo\'sh'),
  passage: z.string().optional(),
  svg: z.string().optional(),
  explanation: z.string().optional(),
  variables: z.array(variableSchema).default([]),
  derived: z.array(derivedSchema).default([]),
  constraints: z.array(z.string().min(1)).default([]),
  answer: answerSchema,
});

export type IntVar = z.infer<typeof intVarSchema>;
export type DecimalVar = z.infer<typeof decimalVarSchema>;
export type FractionVar = z.infer<typeof fractionVarSchema>;
export type ChoiceVar = z.infer<typeof choiceVarSchema>;
export type VariableDef = z.infer<typeof variableSchema>;
export type DerivedDef = z.infer<typeof derivedSchema>;
export type AnswerSpec = z.infer<typeof answerSchema>;
/** Tekshirilgan (default qiymatlar to'ldirilgan) shablon. */
export type TemplateSpec = z.infer<typeof templateSpecSchema>;
/** Operator yozadigan ko'rinish (variables/derived/constraints ixtiyoriy). */
export type TemplateSpecInput = z.input<typeof templateSpecSchema>;

export type QuestionType = 'MCQ' | 'SPR';

export interface Choice {
  label: string;
  text: string;
}

export interface Variant {
  seed: number;
  type: QuestionType;
  stem: string;
  passage?: string;
  svg?: string;
  explanation?: string;
  choices?: Choice[];
  /** MCQ uchun to'g'ri harf (A–D) */
  correctLabel?: string;
  /** SPR / MCQ uchun to'g'ri sonli qiymat */
  correctValue?: number;
  /** Ko'rsatish uchun to'g'ri javob ("B" yoki "3/4, .75") */
  correctDisplay: string;
  values: Record<string, number | string | boolean>;
  attempts: number;
  rejections: Record<string, number>;
}

/** Test vaqtida frontendga yuboriladigan ko'rinish — javobsiz! */
export interface PublicQuestion {
  type: QuestionType;
  stem: string;
  passage?: string;
  svg?: string;
  choices?: Choice[];
}

export function questionTypeOf(spec: Pick<TemplateSpec, 'answer'>): QuestionType {
  return spec.answer.kind === 'SPR' ? 'SPR' : 'MCQ';
}
