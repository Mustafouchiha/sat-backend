import { RejectSignal, TemplateError } from './errors';

export type Value = number | string | boolean;

/** Suzuvchi nuqta xatolarini tozalash: 0.1+0.2 -> 0.3, 2.9999999999996 -> 3, -0 -> 0 */
export function cleanNumber(x: number): number {
  if (!Number.isFinite(x)) return x;
  if (Number.isInteger(x)) return x === 0 ? 0 : x;
  const r = parseFloat(x.toPrecision(12));
  return r === 0 ? 0 : r;
}

export function nearlyEqual(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Davomli kasrlar orqali x ni p/q ko'rinishiga keltirish (q <= maxDen). Topilmasa null. */
export function toFraction(x: number, maxDen = 10000): [number, number] | null {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  const v = Math.abs(x);
  if (Number.isInteger(v)) return [sign * v, 1];
  let h1 = 1;
  let h0 = 0;
  let k1 = 0;
  let k0 = 1;
  let b = v;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
    if (Math.abs(v - h1 / k1) < 1e-9 * Math.max(1, v)) return [sign * h1, k1];
    const frac = b - a;
    if (frac < 1e-12) break;
    b = 1 / frac;
  }
  return null;
}

/** Ortiqcha nollarsiz o'nli kasr: 2.50 -> "2.5" */
export function trimNumber(x: number, maxPlaces = 4): string {
  const r = Number(x.toFixed(maxPlaces));
  return String(r === 0 ? 0 : r);
}

function fracParts([n, d]: [number, number], inMath: boolean, display = false): string {
  if (d === 1) return String(n);
  if (!inMath) return `${n}/${d}`;
  return `${n < 0 ? '-' : ''}\\${display ? 'dfrac' : 'frac'}{${Math.abs(n)}}{${d}}`;
}

/** Aqlli format: butun -> butun, chekli o'nli -> o'nli, takrorlanuvchi -> kasr */
export function fmtAuto(x: number, inMath: boolean): string {
  if (Number.isInteger(x)) return String(x);
  const r4 = Math.round(x * 1e4) / 1e4;
  if (Math.abs(r4 - x) < 1e-9) return trimNumber(r4, 4);
  const f = toFraction(x, 1000);
  if (f) return fracParts(f, inMath);
  return trimNumber(x, 4);
}

export function fmtFrac(x: number, inMath: boolean, display = false): string {
  const f = toFraction(x, 100000);
  if (!f) return trimNumber(x, 4);
  return fracParts(f, inMath, display);
}

/** Ildizni soddalashtirish: 12 -> 2\sqrt{3}, 16 -> 4 */
export function fmtRadical(x: number, inMath: boolean): string {
  if (x < 0) return fmtAuto(x, inMath);
  if (Number.isInteger(x)) {
    let k = 1;
    for (let i = Math.floor(Math.sqrt(x)); i >= 2; i--) {
      if (x % (i * i) === 0) {
        k = i;
        break;
      }
    }
    const rest = x / (k * k);
    if (rest === 1) return String(k);
    const root = inMath ? `\\sqrt{${rest}}` : `√${rest}`;
    return k === 1 ? root : `${k}${root}`;
  }
  return inMath ? `\\sqrt{${fmtAuto(x, true)}}` : `√(${fmtAuto(x, false)})`;
}

export interface FormatContext {
  inMath: boolean;
  isFraction: boolean;
}

const TRANSFORMS: Record<string, (x: number) => number> = {
  abs: Math.abs,
  neg: (x) => -x,
};

export const FORMAT_NAMES = [
  'auto', 'int', 'frac', 'dfrac', 'slash', 'd', 'r', 'coef', 'signed', 'signedcoef', 'comma', 'sqrt',
  'abs', 'neg', 'cap', 'upper', 'lower',
] as const;

export function isFormatToken(s: string): boolean {
  const m = /^([a-z]+)(\d*)$/.exec(s.trim());
  return !!m && (FORMAT_NAMES as readonly string[]).includes(m[1]);
}

export function formatNumber(x: number, fmt: string, ctx: FormatContext): string {
  const m = /^([a-z]+)(\d*)$/.exec(fmt);
  const name = m ? m[1] : fmt;
  const digits = m && m[2] ? Number(m[2]) : undefined;
  const base = (y: number) => (ctx.isFraction ? fmtFrac(y, ctx.inMath) : fmtAuto(y, ctx.inMath));
  switch (name) {
    case 'auto':
      return base(x);
    case 'int':
      return String(Math.round(x));
    case 'frac':
      return fmtFrac(x, ctx.inMath);
    case 'dfrac':
      return fmtFrac(x, ctx.inMath, true);
    case 'slash':
      return fmtFrac(x, false);
    case 'd':
      return x.toFixed(digits ?? 2);
    case 'r':
      return trimNumber(x, digits ?? 2);
    case 'coef':
      if (x === 1) return '';
      if (x === -1) return '-';
      return base(x);
    case 'signed':
      return (x < 0 ? '- ' : '+ ') + base(Math.abs(x));
    case 'signedcoef':
      return (x < 0 ? '- ' : '+ ') + (Math.abs(x) === 1 ? '' : base(Math.abs(x)));
    case 'comma':
      return x.toLocaleString('en-US', { maximumFractionDigits: digits ?? 4 });
    case 'sqrt':
      return fmtRadical(x, ctx.inMath);
    default:
      throw new TemplateError('FORMAT', `Noma'lum format: "${fmt}"`);
  }
}

/** Qiymatni formatlar zanjiri bilan matnga aylantirish: {x|abs|frac} */
export function formatValue(v: Value, fmts: string[], ctx: FormatContext): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') {
    let s = v;
    for (const f of fmts) {
      if (f === 'cap') s = s.charAt(0).toUpperCase() + s.slice(1);
      else if (f === 'upper') s = s.toUpperCase();
      else if (f === 'lower') s = s.toLowerCase();
    }
    return s;
  }
  let x = v;
  let final: string | undefined;
  for (const f of fmts) {
    const t = TRANSFORMS[f];
    if (t) x = t(x);
    else if (f === 'cap' || f === 'upper' || f === 'lower') continue;
    else final = f;
  }
  if (!Number.isFinite(x)) throw new RejectSignal('nan');
  return formatNumber(cleanNumber(x), final ?? 'auto', ctx);
}
