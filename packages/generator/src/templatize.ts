import { reservedNameReason } from './math';
import type { TemplateSpecInput, VariableDef } from './types';

export interface FoundNumber {
  index: number;
  length: number;
  raw: string;
  value: number;
  suggestedName: string;
}

const NAME_POOL = 'abcdfghkmnpqrstuwyz'.split('');

function nameFor(i: number): string {
  if (i < NAME_POOL.length) return NAME_POOL[i];
  return `n${i - NAME_POOL.length + 1}`;
}

/**
 * Tayyor savol matnidagi barcha sonlarni topadi (3.2-bosqich).
 * Harf, \ yoki raqamdan keyin turgan (x2, \frac emas) sonlar hisobga olinmaydi.
 */
export function findNumbers(text: string): FoundNumber[] {
  const re = /(?<![A-Za-z_\\\d.])\d+(?:\.\d+)?(?![\d])/g;
  const out: FoundNumber[] = [];
  let i = 0;
  for (const m of text.matchAll(re)) {
    let name = nameFor(i);
    while (reservedNameReason(name)) name = nameFor(++i);
    out.push({ index: m.index ?? 0, length: m[0].length, raw: m[0], value: Number(m[0]), suggestedName: name });
    i++;
  }
  return out;
}

export interface NumberPick {
  index: number;
  length: number;
  name: string;
}

/** Tanlangan sonlarni {nom} bilan almashtiradi (oxiridan boshlab, indekslar buzilmasligi uchun). */
export function templatize(text: string, picks: NumberPick[]): string {
  let out = text;
  for (const p of [...picks].sort((a, b) => b.index - a.index)) {
    out = `${out.slice(0, p.index)}{${p.name}}${out.slice(p.index + p.length)}`;
  }
  return out;
}

/** Asl son atrofida o'zgaruvchi diapazonini taklif qiladi. */
export function suggestVariable(name: string, value: number): VariableDef {
  if (Number.isInteger(value)) {
    const span = Math.max(2, Math.round(Math.abs(value) * 0.5));
    let min = value - span;
    const max = value + span;
    if (value > 0) min = Math.max(1, min);
    return { name, type: 'int', min, max };
  }
  const places = (String(value).split('.')[1] ?? '').length;
  const span = Math.abs(value) * 0.5 || 1;
  const round = (x: number) => Number(x.toFixed(places));
  return { name, type: 'decimal', min: round(Math.max(0, value - span)), max: round(value + span), places };
}

/** Matn + tanlangan sonlardan shablon qoralamasini yasaydi (javob formulasini operator yozadi). */
export function buildDraftSpec(text: string, picks: Array<NumberPick & { value: number }>): TemplateSpecInput {
  return {
    version: 1,
    stem: templatize(text, picks),
    variables: picks.map((p) => suggestVariable(p.name, p.value)),
    derived: [],
    constraints: [],
    answer: { kind: 'SPR', correct: picks[0]?.name ?? '0' },
  };
}
