import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
  const candidate = resolve(fromEnv || 'cookies.txt');
  return existsSync(candidate) ? candidate : undefined;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
  youtubeCookiesPath: resolveCookiesPath(),
  maxQueueSize: 50,
  playCooldownMs: 3000,
  /** Leave voice after the queue has been empty for idleLeaveMs. */
  idleLeave: bool('IDLE_LEAVE', false),
  idleLeaveMs: int('IDLE_LEAVE_MS', 5 * 60 * 1000),
};
