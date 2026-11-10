/**
 * Seed shablonlari uchun SVG yordamchilari.
 * Ranglar currentColor — rasm kunduzgi va tungi rejimda ham ko'rinadi.
 * {=ifoda|int} — generator har bir variantda hisoblab, butun songa yaxlitlaydi.
 */

export const MID = 'text-anchor="middle"';
export const END = 'text-anchor="end"';
const S = 'stroke="currentColor"';
export const DASH = 'stroke-width="1.5" stroke-dasharray="5 4"';

/** SVG ildizi: kenglik viewBox bilan bir xil (1 birlik = 1 px). */
export function svg(w: number, h: number, body: string): string {
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${body}</svg>`;
}

/** Matn; x va y son yoki {=...} ifoda bo'lishi mumkin. */
export function txt(x: number | string, y: number | string, s: string, extra = '', size = 13): string {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="currentColor"${extra ? ` ${extra}` : ''}>${s}</text>`;
}

export function seg(x1: number | string, y1: number | string, x2: number | string, y2: number | string, extra = 'stroke-width="2"'): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${S} ${extra}/>`;
}

export function poly(points: string, extra = ''): string {
  return `<polygon points="${points}" fill="none" ${S} stroke-width="2"${extra ? ` ${extra}` : ''}/>`;
}

/** To'g'ri burchak belgisi: uch (x, y), oyoqlar dx va dy yo'nalishida. */
export function rightMark(x: number, y: number, dx: number, dy: number, s = 12): string {
  return `<polyline points="${x + dx * s},${y} ${x + dx * s},${y + dy * s} ${x},${y + dy * s}" fill="none" ${S} stroke-width="1.5"/>`;
}

// ───────────── Koordinata tekisligi (−6..6) ─────────────

export const G = { ox: 150, oy: 150, u: 20 };
/** x koordinatani pikselga (ifoda). */
export const gx = (e: string) => `{=${G.ox} + ${G.u}*(${e})|int}`;
/** y koordinatani pikselga; ys — y o'qining bir katakdagi qiymati. */
export const gy = (e: string, ys = 1) => `{=${G.oy} - ${G.u}*(${e})/${ys}|int}`;

/** Koordinata tekisligi: to'r har birlikda, raqamlar har 2 birlikda (y raqamlari ys ga ko'paytiriladi). 300×290 */
export function coordPlane(body: string, ys = 1): string {
  const { ox, oy, u } = G;
  const p: string[] = [];
  for (let i = -6; i <= 6; i++) {
    p.push(`<line x1="${ox + i * u}" y1="${oy - 6 * u}" x2="${ox + i * u}" y2="${oy + 6 * u}" ${S} stroke-opacity="0.15"/>`);
    p.push(`<line x1="${ox - 6 * u}" y1="${oy - i * u}" x2="${ox + 6 * u}" y2="${oy - i * u}" ${S} stroke-opacity="0.15"/>`);
  }
  p.push(`<line x1="${ox - 6 * u - 6}" y1="${oy}" x2="${ox + 6 * u + 6}" y2="${oy}" ${S} stroke-width="1.5"/>`);
  p.push(`<line x1="${ox}" y1="${oy - 6 * u - 6}" x2="${ox}" y2="${oy + 6 * u + 6}" ${S} stroke-width="1.5"/>`);
  p.push(txt(ox + 6 * u + 10, oy + 4, 'x', 'font-style="italic"'));
  p.push(txt(ox + 7, oy - 6 * u - 8, 'y', 'font-style="italic"'));
  for (let i = -6; i <= 6; i += 2) {
    if (i === 0) continue;
    p.push(txt(ox + i * u, oy + 14, String(i), MID, 10));
    p.push(txt(ox - 5, oy - i * u + 4, String(i * ys), END, 10));
  }
  p.push(txt(ox - 5, oy + 13, 'O', END, 10));
  return svg(300, 290, p.join('') + body);
}

/**
 * y = m·x + c to'g'ri chizig'ining tekislik ichidagi uchlari (−6..6 kvadrati bilan kesilgan).
 * Hosilaviy o'zgaruvchilar: {p}xa, {p}ya, {p}xb, {p}yb. m ≠ 0 bo'lishi kerak.
 */
export function clipLine(m: string, c: string, p: string): Array<{ name: string; expr: string }> {
  return [
    { name: `${p}xa`, expr: `(${m}) > 0 ? max(-6, (-6 - (${c})) / (${m})) : max(-6, (6 - (${c})) / (${m}))` },
    { name: `${p}xb`, expr: `(${m}) > 0 ? min(6, (6 - (${c})) / (${m})) : min(6, (-6 - (${c})) / (${m}))` },
    { name: `${p}ya`, expr: `(${m}) * ${p}xa + (${c})` },
    { name: `${p}yb`, expr: `(${m}) * ${p}xb + (${c})` },
  ];
}

export function plotLine(p: string): string {
  return seg(gx(`${p}xa`), gy(`${p}ya`), gx(`${p}xb`), gy(`${p}yb`), 'stroke-width="2.5"');
}

export function gdot(x: string, y: string, ys = 1): string {
  return `<circle cx="${gx(x)}" cy="${gy(y, ys)}" r="4" fill="currentColor"/>`;
}

// ───────────── Diagrammalar va jadvallar ─────────────

/** Ustunli diagramma (300 kenglik). values — o'zgaruvchi nomlari; max — o'q chegarasi. */
export function barChart(o: {
  cats: string[];
  values: string[];
  max: number;
  step: number;
  labelStep?: number;
  title: string;
  xTitle?: string;
  valueLabels?: boolean;
  unit?: string;
}): string {
  const x0 = 52;
  const x1 = 290;
  const yb = 190;
  const k = 150 / o.max;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const ls = o.labelStep ?? o.step;
  const p: string[] = [];
  for (let v = 0; v <= o.max + 1e-9; v += o.step) {
    const y = r1(yb - v * k);
    p.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" ${S} stroke-opacity="${v === 0 ? 1 : 0.18}"/>`);
    if (Math.abs(v / ls - Math.round(v / ls)) < 1e-9) p.push(txt(x0 - 6, r1(y + 4), String(v), END, 11));
  }
  p.push(`<line x1="${x0}" y1="${yb - 158}" x2="${x0}" y2="${yb}" ${S} stroke-width="1.5"/>`);
  const slot = (x1 - x0) / o.cats.length;
  o.cats.forEach((c, i) => {
    const bx = r1(x0 + i * slot + slot * 0.2);
    const bw = r1(slot * 0.6);
    const v = o.values[i];
    p.push(
      `<rect x="${bx}" y="{=${yb} - ${k}*(${v})|int}" width="${bw}" height="{=${k}*(${v})|int}" fill="currentColor" fill-opacity="0.3" ${S} stroke-width="1.5"/>`,
    );
    if (o.valueLabels) p.push(txt(r1(bx + bw / 2), `{=${yb} - ${k}*(${v}) - 6|int}`, `{${v}}${o.unit ?? ''}`, MID, 11));
    p.push(txt(r1(x0 + i * slot + slot / 2), yb + 16, c, MID, 11));
  });
  p.push(txt(8, 18, o.title, '', 12));
  if (o.xTitle) p.push(txt(r1((x0 + x1) / 2), 226, o.xTitle, MID, 12));
  return svg(300, o.xTitle ? 234 : 214, p.join(''));
}

/** Jadval: rows[0] — sarlavha qatori, birinchi ustun — qator nomlari (qalin). */
export function table(rows: string[][], widths: number[], rowH = 30): string {
  const W = widths.reduce((a, b) => a + b, 0);
  const H = rows.length * rowH;
  const p: string[] = [];
  p.push(`<rect x="1" y="1" width="${W}" height="${rowH}" fill="currentColor" fill-opacity="0.08"/>`);
  p.push(`<rect x="1" y="1" width="${W}" height="${H}" fill="none" ${S} stroke-width="1.5"/>`);
  for (let r = 1; r < rows.length; r++) {
    p.push(`<line x1="1" y1="${1 + r * rowH}" x2="${1 + W}" y2="${1 + r * rowH}" ${S} stroke-opacity="0.6"/>`);
  }
  let x = 1;
  for (let i = 0; i < widths.length - 1; i++) {
    x += widths[i];
    p.push(`<line x1="${x}" y1="1" x2="${x}" y2="${1 + H}" ${S} stroke-opacity="0.6"/>`);
  }
  rows.forEach((row, r) => {
    let cx = 1;
    row.forEach((cell, i) => {
      const bold = r === 0 || i === 0 ? ' font-weight="bold"' : '';
      p.push(txt(cx + widths[i] / 2, 1 + r * rowH + rowH / 2 + 4, cell, MID + bold, 12));
      cx += widths[i];
    });
  });
  return svg(W + 2, H + 2, p.join(''));
}

/** Ikki guruhning nuqtali diagrammasi bir rasmda, bir xil o'q bilan (har qiymatda eng ko'pi 6 ta nuqta). 300×270 */
export function dotPlotPair(o: { a: string[]; b: string[]; labels: string[]; names: [string, string]; title: string }): string {
  const x0 = 50;
  const step = 200 / (o.labels.length - 1);
  const block = (counts: string[], top: number, name: string) => {
    const base = top + 99;
    const p: string[] = [txt(8, top + 12, name, 'font-weight="bold"', 12), seg(x0 - 25, base, x0 + 225, base, 'stroke-width="1.5"')];
    o.labels.forEach((lab, i) => {
      const x = x0 + i * step;
      p.push(seg(x, base, x, base + 5, 'stroke-width="1.5"'));
      p.push(txt(x, base + 17, lab, MID, 11));
      for (let j = 0; j < 6; j++) {
        p.push(`<circle cx="${x}" cy="${base - 9 - j * 13}" r="5" fill="currentColor" fill-opacity="{=(${counts[i]}) > ${j} ? 1 : 0}"/>`);
      }
    });
    return p.join('');
  };
  return svg(300, 270, block(o.a, 0, o.names[0]) + block(o.b, 125, o.names[1]) + txt(150, 262, o.title, MID, 12));
}

/** Nuqtali diagramma (dot plot): har qiymat ustida counts[i] ta nuqta (eng ko'pi maxDots). */
export function dotPlot(o: { counts: string[]; labels: string[]; maxDots: number; title: string }): string {
  const x0 = 40;
  const x1 = 260;
  const base = 170;
  const step = (x1 - x0) / (o.counts.length - 1);
  const p: string[] = [];
  p.push(`<line x1="${x0 - 20}" y1="${base}" x2="${x1 + 20}" y2="${base}" ${S} stroke-width="1.5"/>`);
  o.labels.forEach((lab, i) => {
    const x = x0 + i * step;
    p.push(`<line x1="${x}" y1="${base}" x2="${x}" y2="${base + 6}" ${S} stroke-width="1.5"/>`);
    p.push(txt(x, base + 21, lab, MID, 12));
    for (let j = 0; j < o.maxDots; j++) {
      p.push(`<circle cx="${x}" cy="${base - 12 - j * 17}" r="6.5" fill="currentColor" fill-opacity="{=(${o.counts[i]}) > ${j} ? 1 : 0}"/>`);
    }
  });
  p.push(txt(150, base + 44, o.title, MID, 12));
  return svg(300, base + 52, p.join(''));
}
