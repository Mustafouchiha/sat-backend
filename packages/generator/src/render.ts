import { formatValue, isFormatToken, type Value } from './format';
import { cleanupMath, findMathRanges, isInRanges } from './latex';
import { evaluate } from './math';

export interface VarMeta {
  fractionVars: Set<string>;
  choiceParts: Record<string, string[]>;
}

export interface RenderContext {
  scope: Record<string, Value>;
  meta: VarMeta;
}

export const PLACEHOLDER_RE = /\{(=?)([^{}]+?)\}/g;
const NAME_RE = /^([A-Za-z_][A-Za-z0-9_]*)(?:\.(\d+))?$/;

/** "a*b|frac|abs" -> { expr: "a*b", fmts: ["frac","abs"] } (faqat ma'lum format nomlari ajratiladi) */
export function splitFormats(inner: string): { expr: string; fmts: string[] } {
  const parts = inner.split('|');
  let cut = parts.length;
  while (cut > 1 && isFormatToken(parts[cut - 1])) cut--;
  return {
    expr: parts.slice(0, cut).join('|').trim(),
    fmts: parts.slice(cut).map((p) => p.trim()),
  };
}

/**
 * Shablon matnini to'ldirish.
 *  {a}          — o'zgaruvchi qiymati (faqat e'lon qilingan nomlar; qolgan {..} LaTeX sifatida qoladi)
 *  {a|coef}     — format bilan
 *  {p.1}        — choice variantining 2-qismi ("Maria|she|her")
 *  {=a*b+1|frac} — ichki ifoda
 */
export function renderText(tpl: string, ctx: RenderContext, cleanup = true): string {
  const ranges = findMathRanges(tpl);
  const out = tpl.replace(PLACEHOLDER_RE, (full: string, eq: string, inner: string, offset: number) => {
    const inMath = isInRanges(offset, ranges);
    const { expr, fmts } = splitFormats(inner);
    if (eq) {
      const v = evaluate(expr, ctx.scope, `matn ichidagi ifoda {=${expr}}`);
      return formatValue(v, fmts, { inMath, isFraction: false });
    }
    const m = NAME_RE.exec(expr);
    if (!m) return full;
    const base = m[1];
    if (!(base in ctx.scope)) return full;
    let v: Value = ctx.scope[base];
    if (m[2] !== undefined) {
      const parts = ctx.meta.choiceParts[base];
      if (!parts) return full;
      v = parts[Number(m[2])] ?? '';
    }
    return formatValue(v, fmts, { inMath, isFraction: ctx.meta.fractionVars.has(base) });
  });
  return cleanup ? cleanupMath(out) : out;
}

/** Matndagi barcha {=...} ichki ifodalarni topish (oldindan sintaksis tekshiruvi uchun). */
export function inlineExpressions(tpl: string): string[] {
  const res: string[] = [];
  for (const m of tpl.matchAll(PLACEHOLDER_RE)) {
    if (m[1] === '=') res.push(splitFormats(m[2]).expr);
  }
  return res;
}
