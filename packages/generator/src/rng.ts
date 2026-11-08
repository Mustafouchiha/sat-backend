/** FNV-1a 32-bit hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mixSeed(...parts: Array<number | string>): number {
  return hashString(parts.join(':'));
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomSource {
  float(): number;
}

/** Deterministik tasodifiy sonlar: bir xil seed => har doim bir xil ketma-ketlik. */
export class Rng implements RandomSource {
  private readonly next: () => number;

  constructor(seed: number | string) {
    this.next = mulberry32(typeof seed === 'number' ? mixSeed('sat', seed) : hashString(seed));
  }

  float(): number {
    return this.next();
  }

  /** [min, max] oralig'ida butun son (ikkala chegara ham kiradi). */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("pick: bo'sh ro'yxat");
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Kriptografik tasodifiy seed: 1..2^31-1 (Postgres INT ga sig'adi). */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] % 2147483646) + 1;
}

/** Math.random asosidagi oddiy manba (testlar va tanlov uchun). */
export const defaultRandom: RandomSource = { float: () => Math.random() };

export function shuffleWith<T>(arr: readonly T[], rnd: RandomSource): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd.float() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function weightedPick<T>(items: readonly T[], weight: (t: T) => number, rnd: RandomSource): T | undefined {
  if (items.length === 0) return undefined;
  const weights = items.map((t) => Math.max(0, weight(t)));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[Math.floor(rnd.float() * items.length)];
  let r = rnd.float() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
