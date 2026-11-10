import { describe, expect, it } from 'vitest';
import * as wl from './lib/loginHelpers';

describe('kompyuterda kirish: yordamchilar', () => {
  it('telefon raqamni bir xil ko\'rinishga keltiradi', () => {
    expect(wl.normalizePhone('+998 90 123-45-67')).toBe('998901234567');
    expect(wl.normalizePhone('998901234567')).toBe('998901234567');
    expect(wl.normalizePhone('90 123 45 67')).toBe('998901234567');
    expect(wl.normalizePhone('00998901234567')).toBe('998901234567');
    expect(wl.normalizePhone('+1 (415) 555-2671')).toBe('14155552671');
    expect(wl.normalizePhone('12345')).toBeNull();
    expect(wl.normalizePhone('abc')).toBeNull();
  });

  it('raqamni yashiradi', () => {
    expect(wl.maskPhone('998901234567')).toBe('+998 90 *** ** 67');
    expect(wl.maskPhone('14155552671')).toBe('+14155 **** 71');
    expect(wl.maskPhone(null)).toBeNull();
  });

  it('brauzer va tizimni aniqlaydi', () => {
    const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
    const edge = `${chromeWin} Edg/130.0`;
    const yandex = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 YaBrowser/24.10 Safari/537.36';
    const safariMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    const android = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
    const firefoxLinux = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
    expect(wl.deviceLabel(chromeWin)).toBe('Chrome · Windows');
    expect(wl.deviceLabel(edge)).toBe('Edge · Windows');
    expect(wl.deviceLabel(yandex)).toBe('Yandex · Windows');
    expect(wl.deviceLabel(safariMac)).toBe('Safari · macOS');
    expect(wl.deviceLabel(iphone)).toBe('Safari · iOS');
    expect(wl.deviceLabel(android)).toBe('Chrome · Android');
    expect(wl.deviceLabel(firefoxLinux)).toBe('Firefox · Linux');
    expect(wl.deviceLabel(undefined)).toBe("Brauzer · noma'lum tizim");
  });
});
