import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SimilarProviderId } from './ai/types';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveCookiesPath(): string | undefined {
  const fromEnv = process.env.YOUTUBE_COOKIES_PATH?.trim();
  const candidates = [
    fromEnv ? resolve(fromEnv) : undefined,
    // Prefer project root (works even when PM2 cwd is wrong)
    resolve(__dirname, '..', 'cookies.txt'),
    resolve(process.cwd(), 'cookies.txt'),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return undefined;
}

function providerId(raw: string | undefined): SimilarProviderId {
  const id = (raw ?? 'cursor').trim().toLowerCase();
  if (id === 'cursor' || id === 'openai' || id === 'gemini' || id === 'custom') {
    return id;
  }
  console.warn(`Unknown SIMILAR_PROVIDER "${raw}", falling back to cursor`);
  return 'cursor';
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
  youtubeCookiesPath: resolveCookiesPath(),
  maxQueueSize: 50,
  playCooldownMs: 3000,
  idleLeave: bool('IDLE_LEAVE', false),
  idleLeaveMs: int('IDLE_LEAVE_MS', 5 * 60 * 1000),

  autoSimilar: bool('AUTO_SIMILAR', true),
  similarProvider: providerId(process.env.SIMILAR_PROVIDER),

  cursorApiKey: process.env.CURSOR_API_KEY?.trim() || undefined,
  cursorModel: process.env.CURSOR_MODEL?.trim() || 'composer-2.5',

  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
  openaiModel: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
  openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,

  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',

  customSimilarUrl: process.env.CUSTOM_SIMILAR_URL?.trim() || undefined,
  customSimilarApiKey: process.env.CUSTOM_SIMILAR_API_KEY?.trim() || undefined,
};
