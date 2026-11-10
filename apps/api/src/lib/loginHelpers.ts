/** Kompyuterda kirish uchun sof yordamchilar (bazaga bog'liq emas — testlarda tez yuklanadi). */

/** Faqat raqamlar, xalqaro ko'rinishda: "+998 90 123-45-67" → "998901234567"; 9 xonali — O'zbekiston raqami. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = `998${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

/** "998901234567" → "+998 90 *** ** 67" */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.length === 12 && phone.startsWith('998')) return `+998 ${phone.slice(3, 5)} *** ** ${phone.slice(10)}`;
  return `+${phone.slice(0, Math.max(1, phone.length - 6))} **** ${phone.slice(-2)}`;
}

/** User-Agent → "Chrome · Windows" (tasdiqlash xabarida qaysi qurilma kirayotgani ko'rinsin). */
export function deviceLabel(ua = ''): string {
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /YaBrowser\//.test(ua)
      ? 'Yandex'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Firefox\/|FxiOS\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Brauzer';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : "noma'lum tizim";
  return `${browser} · ${os}`;
}
