import { TemplateError } from './errors';
import { gcd, nearlyEqual } from './format';
import type { Rng } from './rng';
import type { VariableDef } from './types';

export interface Sampled {
  value: number | string;
  n?: number;
  d?: number;
  parts?: string[];
  index?: number;
}

function decimalsOf(x: number | undefined): number | undefined {
  if (x === undefined) return undefined;
  const s = String(x);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return (s.split('.')[1] ?? '').length;
}

export function sampleVariable(v: VariableDef, rng: Rng): Sampled {
  switch (v.type) {
    case 'int': {
      const step = v.step ?? 1;
      const count = Math.floor((v.max - v.min) / step) + 1;
      if (count < 1) throw new TemplateError('SAMPLING', `${v.name}: min (${v.min}) max (${v.max}) dan katta`);
      const excl = new Set(v.exclude ?? []);
      for (let t = 0; t < 64; t++) {
        const val = v.min + rng.int(0, count - 1) * step;
        if (!excl.has(val)) return { value: val };
      }
      const allowed: number[] = [];
      for (let k = 0; k < count && allowed.length < 100000; k++) {
        const val = v.min + k * step;
        if (!excl.has(val)) allowed.push(val);
      }
      if (allowed.length === 0) throw new TemplateError('SAMPLING', `${v.name}: barcha qiymatlar istisno qilingan`);
      return { value: rng.pick(allowed) };
    }
    case 'decimal': {
      const places = v.places ?? decimalsOf(v.step) ?? 2;
      const step = v.step ?? 10 ** -places;
      const count = Math.floor((v.max - v.min) / step + 1e-9) + 1;
      if (count < 1) throw new TemplateError('SAMPLING', `${v.name}: min max dan katta`);
      const excl = v.exclude ?? [];
      for (let t = 0; t < 64; t++) {
        const val = Number((v.min + rng.int(0, count - 1) * step).toFixed(places));
        if (!excl.some((e) => nearlyEqual(e, val))) return { value: val };
      }
      throw new TemplateError('SAMPLING', `${v.name}: istisnolardan tashqari qiymat topilmadi`);
    }
    case 'fraction': {
      if (v.numMin > v.numMax || v.denMin > v.denMax) {
        throw new TemplateError('SAMPLING', `${v.name}: kasr diapazoni noto'g'ri`);
      }
      for (let t = 0; t < 200; t++) {
        const n = rng.int(v.numMin, v.numMax);
        const d = rng.int(v.denMin, v.denMax);
        if (d === 0) continue;
        const g = gcd(n, d) || 1;
        const rn = n / g;
        const rd = d / g;
        if (rd === 1 && !v.allowInteger) continue;
        return { value: rn / rd, n: rn, d: rd };
      }
      throw new TemplateError('SAMPLING', `${v.name}: butun bo'lmagan kasr yasab bo'lmadi (diapazonni kengaytiring)`);
    }
    case 'choice': {
      const index = rng.int(0, v.options.length - 1);
      const opt = v.options[index];
      const parts = String(opt)
        .split('|')
        .map((p) => p.trim());
      const first = parts[0];
      const num = typeof opt === 'number' ? opt : first !== '' && !Number.isNaN(Number(first)) ? Number(first) : null;
      return { value: num ?? first, parts, index };
    }
  }
}
