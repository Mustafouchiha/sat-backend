import { DEFAULT_SETTINGS, deepMerge, type AppSettings, type SettingsKey } from '@sat/shared';
import { prisma } from '../db';

let cache: { at: number; value: AppSettings } | null = null;
const TTL = 30_000;

/** Standart sozlamalar + bazadagi (admin tahrirlagan) qiymatlar. */
export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await prisma.setting.findMany();
  const value: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) {
      const k = r.key as SettingsKey;
      (value as unknown as Record<string, unknown>)[k] = deepMerge(DEFAULT_SETTINGS[k], r.value);
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateSettings(): void {
  cache = null;
}

export function isSettingsKey(k: string): k is SettingsKey {
  return k in DEFAULT_SETTINGS;
}
