/** Matndagi $...$ va $$...$$ formulalarning ichki (delimitersiz) oraliqlari. */
export interface MathRange {
  start: number;
  end: number;
  display: boolean;
}

export function findMathRanges(s: string): MathRange[] {
  const ranges: MathRange[] = [];
  let i = 0;
  let mode: 'text' | 'inline' | 'display' = 'text';
  let contentStart = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      i += 2; // \$ va boshqa escape belgilarni o'tkazib yuborish
      continue;
    }
    if (ch === '$') {
      const isDouble = s[i + 1] === '$';
      if (mode === 'text') {
        mode = isDouble ? 'display' : 'inline';
        i += isDouble ? 2 : 1;
        contentStart = i;
        continue;
      }
      if (mode === 'display' && isDouble) {
        ranges.push({ start: contentStart, end: i, display: true });
        mode = 'text';
        i += 2;
        continue;
      }
      if (mode === 'inline') {
        ranges.push({ start: contentStart, end: i, display: false });
        mode = 'text';
        i += 1;
        continue;
      }
    }
    i++;
  }
  return ranges; // yopilmagan $ — matn sifatida qoladi
}

export function isInRanges(index: number, ranges: MathRange[]): boolean {
  for (const r of ranges) {
    if (index >= r.start && index < r.end) return true;
    if (r.start > index) break;
  }
  return false;
}

/** Formula ichidagi ko'rinishni chiroyli qilish: "+ -3" -> "- 3", "1x" -> "x" */
export function tidyMath(src: string): string {
  let r = src;
  r = r.replace(/\+\s*-\s*/g, '- ');
  r = r.replace(/-\s*-\s*/g, '+ ');
  r = r.replace(/(^|[\s(=+\-{,<>])1(?=[a-zA-Z(])/g, '$1');
  return r;
}

export function cleanupMath(s: string): string {
  const ranges = findMathRanges(s);
  if (ranges.length === 0) return s;
  let out = '';
  let prev = 0;
  for (const r of ranges) {
    out += s.slice(prev, r.start) + tidyMath(s.slice(r.start, r.end));
    prev = r.end;
  }
  return out + s.slice(prev);
}
