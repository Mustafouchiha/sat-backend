import { cleanNumber, nearlyEqual, toFraction, trimNumber } from './format';

export interface SprParse {
  valid: boolean;
  value?: number;
  normalized?: string;
  reason?: 'empty' | 'too_long' | 'format' | 'zero_division';
}

export const SPR_REASON_TEXT: Record<NonNullable<SprParse['reason']>, string> = {
  empty: 'Javob kiritilmagan',
  too_long: 'Juda uzun: musbat javob 5, manfiy javob 6 belgigacha',
  format: "Noto'g'ri format: faqat raqam, nuqta, / va - ishlatiladi",
  zero_division: "Maxraj 0 bo'lishi mumkin emas",
};

/** SAT qoidasi bo'yicha o'quvchi javobini o'qish: 3/4, 0.75, .75, -2, -1/3 */
export function parseSpr(raw: string | null | undefined): SprParse {
  const s = (raw ?? '')
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(',', '.');
  if (!s) return { valid: false, reason: 'empty' };
  // "1 1/2" kabi aralash sonlar SAT da qabul qilinmaydi (11/2 deb o'qilmasligi kerak)
  if (/\s/.test(s)) return { valid: false, reason: 'format' };
  const neg = s.startsWith('-');
  if (s.length > (neg ? 6 : 5)) return { valid: false, reason: 'too_long' };
  let value: number;
  if (/^-?\d+\/\d+$/.test(s)) {
    const [a, b] = s.replace('-', '').split('/').map(Number);
    if (b === 0) return { valid: false, reason: 'zero_division' };
    value = ((neg ? -1 : 1) * a) / b;
  } else if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) {
    value = Number(s);
  } else {
    return { valid: false, reason: 'format' };
  }
  return { valid: true, value, normalized: s };
}

export interface SprResult {
  correct: boolean;
  valid: boolean;
  reason?: SprParse['reason'];
}

/**
 * Teng qiymatli javoblarni qabul qilish. Takrorlanuvchi kasrlar uchun SAT kabi
 * to'liq kenglikdagi (5/6 belgi) kesilgan yoki yaxlitlangan o'nli kasr ham to'g'ri: 2/3 -> .6666, .6667, 0.666, 0.667
 */
export function checkSpr(raw: string | null | undefined, correct: number | number[]): SprResult {
  const p = parseSpr(raw);
  if (!p.valid || p.value === undefined || !p.normalized) return { correct: false, valid: false, reason: p.reason };
  const s = p.normalized;
  const targets = Array.isArray(correct) ? correct : [correct];
  for (const t of targets) {
    if (nearlyEqual(p.value, t)) return { correct: true, valid: true };
    if (s.includes('.')) {
      const neg = s.startsWith('-');
      const fullWidth = s.length === (neg ? 6 : 5);
      if (fullWidth) {
        const places = s.length - s.indexOf('.') - 1;
        const f = 10 ** places;
        const trunc = Math.trunc(cleanNumber(t * f)) / f;
        const round = Math.round(cleanNumber(t * f)) / f;
        if (nearlyEqual(p.value, trunc) || nearlyEqual(p.value, round)) return { correct: true, valid: true };
      }
    }
  }
  return { correct: false, valid: true };
}

/** To'g'ri javobning SAT formatidagi qabul qilinadigan ko'rinishlari: 0.75 -> ["3/4", ".75"] */
export function sprForms(x: number): string[] {
  x = cleanNumber(x);
  if (Number.isInteger(x)) return [String(x)];
  const neg = x < 0;
  const maxLen = neg ? 6 : 5;
  const forms: string[] = [];
  const f = toFraction(x, 9999);
  if (f) {
    const fs = `${f[0]}/${f[1]}`;
    if (fs.length <= maxLen) forms.push(fs);
  }
  const abs = Math.abs(x);
  const intPart = Math.trunc(abs);
  const intStr = intPart === 0 ? '' : String(intPart);
  const places = maxLen - (neg ? 1 : 0) - intStr.length - 1;
  const sign = neg ? '-' : '';
  if (places >= 1) {
    const scale = 10 ** places;
    const exact = Math.abs(Math.round(abs * scale) / scale - abs) < 1e-12;
    const toStr = (val: number, fixed: boolean) => {
      let dec = fixed ? val.toFixed(places) : trimNumber(val, places);
      if (dec.startsWith('0.')) dec = dec.slice(1);
      return sign + dec;
    };
    if (exact) {
      forms.push(toStr(abs, false));
    } else {
      const truncV = Math.trunc(cleanNumber(abs * scale)) / scale;
      const roundV = Math.round(cleanNumber(abs * scale)) / scale;
      forms.push(toStr(truncV, true));
      if (roundV !== truncV) forms.push(toStr(roundV, true));
    }
  }
  return forms.length ? [...new Set(forms)] : [trimNumber(x, 4)];
}
