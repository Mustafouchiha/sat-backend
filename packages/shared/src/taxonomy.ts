export type SectionCode = 'RW' | 'MATH';

export interface DomainDef {
  id: string;
  section: SectionCode;
  name: string;
  /** Real SAT moduli bo'yicha taxminiy ulush */
  weight: number;
  skills: Array<{ id: string; name: string }>;
}

/** Digital SAT taksonomiyasi: domenlar va ko'nikmalar. */
export const TAXONOMY: DomainDef[] = [
  {
    id: 'MATH_ALG',
    section: 'MATH',
    name: 'Algebra',
    weight: 0.35,
    skills: [
      { id: 'MATH_ALG_LIN1', name: 'Linear equations in one variable' },
      { id: 'MATH_ALG_LINF', name: 'Linear functions' },
      { id: 'MATH_ALG_LIN2', name: 'Linear equations in two variables' },
      { id: 'MATH_ALG_SYS', name: 'Systems of two linear equations' },
      { id: 'MATH_ALG_INEQ', name: 'Linear inequalities' },
    ],
  },
  {
    id: 'MATH_ADV',
    section: 'MATH',
    name: 'Advanced Math',
    weight: 0.35,
    skills: [
      { id: 'MATH_ADV_FUNC', name: 'Nonlinear functions' },
      { id: 'MATH_ADV_EQ', name: 'Nonlinear equations and systems' },
      { id: 'MATH_ADV_EXPR', name: 'Equivalent expressions' },
    ],
  },
  {
    id: 'MATH_PSDA',
    section: 'MATH',
    name: 'Problem-Solving & Data Analysis',
    weight: 0.15,
    skills: [
      { id: 'MATH_PSDA_RATIO', name: 'Ratios, rates, proportions, units' },
      { id: 'MATH_PSDA_PCT', name: 'Percentages' },
      { id: 'MATH_PSDA_STAT1', name: 'One-variable data: center and spread' },
      { id: 'MATH_PSDA_STAT2', name: 'Two-variable data: models and scatterplots' },
      { id: 'MATH_PSDA_PROB', name: 'Probability and conditional probability' },
      { id: 'MATH_PSDA_INFER', name: 'Inference and margin of error' },
      { id: 'MATH_PSDA_CLAIMS', name: 'Evaluating statistical claims' },
    ],
  },
  {
    id: 'MATH_GEO',
    section: 'MATH',
    name: 'Geometry & Trigonometry',
    weight: 0.15,
    skills: [
      { id: 'MATH_GEO_AREA', name: 'Area and volume' },
      { id: 'MATH_GEO_LINES', name: 'Lines, angles, and triangles' },
      { id: 'MATH_GEO_TRIG', name: 'Right triangles and trigonometry' },
      { id: 'MATH_GEO_CIRC', name: 'Circles' },
    ],
  },
  {
    id: 'RW_CS',
    section: 'RW',
    name: 'Craft & Structure',
    weight: 0.28,
    skills: [
      { id: 'RW_CS_WIC', name: 'Words in Context' },
      { id: 'RW_CS_TSP', name: 'Text Structure and Purpose' },
      { id: 'RW_CS_CTC', name: 'Cross-Text Connections' },
    ],
  },
  {
    id: 'RW_II',
    section: 'RW',
    name: 'Information & Ideas',
    weight: 0.26,
    skills: [
      { id: 'RW_II_CID', name: 'Central Ideas and Details' },
      { id: 'RW_II_COE_T', name: 'Command of Evidence: Textual' },
      { id: 'RW_II_COE_Q', name: 'Command of Evidence: Quantitative' },
      { id: 'RW_II_INF', name: 'Inferences' },
    ],
  },
  {
    id: 'RW_SEC',
    section: 'RW',
    name: 'Standard English Conventions',
    weight: 0.26,
    skills: [
      { id: 'RW_SEC_BOUND', name: 'Boundaries' },
      { id: 'RW_SEC_FSS', name: 'Form, Structure, and Sense' },
    ],
  },
  {
    id: 'RW_EOI',
    section: 'RW',
    name: 'Expression of Ideas',
    weight: 0.2,
    skills: [
      { id: 'RW_EOI_SYN', name: 'Rhetorical Synthesis' },
      { id: 'RW_EOI_TRANS', name: 'Transitions' },
    ],
  },
];

/** Real Digital SAT tuzilishi */
export const SAT_STRUCTURE = {
  RW: { questionsPerModule: 27, minutesPerModule: 32 },
  MATH: { questionsPerModule: 22, minutesPerModule: 35 },
  breakMinutes: 10,
} as const;

/** N ta savolni domen ulushlari bo'yicha taqsimlash (largest remainder). */
export function distributeByWeight(n: number, domains: Array<{ id: string; weight: number }>): Record<string, number> {
  const total = domains.reduce((s, d) => s + d.weight, 0) || 1;
  const parts = domains.map((d) => {
    const v = (n * d.weight) / total;
    return { id: d.id, n: Math.floor(v), rem: v - Math.floor(v) };
  });
  let left = n - parts.reduce((s, p) => s + p.n, 0);
  for (const p of [...parts].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    p.n++;
    left--;
  }
  return Object.fromEntries(parts.map((p) => [p.id, p.n]));
}
