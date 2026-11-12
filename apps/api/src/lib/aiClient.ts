import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS } from '@sat/shared';
import { env } from '../env';
import { HttpError } from './http';

let client: Anthropic | null = null;

/** ANTHROPIC_API_KEY Railway'da o'rnatilganmi. */
export const aiConfigured = (): boolean => !!env.ANTHROPIC_API_KEY;

export function aiClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(501, "AI sozlanmagan: Railway'da ANTHROPIC_API_KEY o'rnatilmagan", 'AI_DISABLED');
  }
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 3 });
  return client;
}

/** SDK xatolarini foydalanuvchiga tushunarli HttpError'ga aylantirish. */
export function aiError(e: unknown): never {
  if (e instanceof HttpError) throw e;
  if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AI so'rovlar limiti tugadi, birozdan keyin urinib ko'ring", 'AI_RATE_LIMIT');
  if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, "ANTHROPIC_API_KEY noto'g'ri yoki o'chirilgan", 'AI_AUTH');
  if (e instanceof Anthropic.PermissionDeniedError) throw new HttpError(502, "AI hisobida ruxsat yo'q (balansni tekshiring)", 'AI_AUTH');
  if (e instanceof Anthropic.BadRequestError) throw new HttpError(502, `AI so'rov xatosi: ${e.message}`, 'AI_BAD_REQUEST');
  if (e instanceof Anthropic.APIError) throw new HttpError(502, `AI xizmati vaqtincha ishlamayapti (${e.status ?? '?'})`, 'AI_ERROR');
  throw e;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Taxminiy narx (USD): kesh yozish 1.25×, kesh o'qish arzon. Noma'lum model — Opus narxida (yuqori baho). */
export function usageCost(model: string, u: Usage): number {
  const p = AI_MODELS.find((m) => model.startsWith(m.id)) ?? AI_MODELS[0];
  const write = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  return (u.input_tokens * p.inUsd + write * p.inUsd * 1.25 + read * p.cacheReadUsd + u.output_tokens * p.outUsd) / 1_000_000;
}

export const totalIn = (u: Usage) => u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
