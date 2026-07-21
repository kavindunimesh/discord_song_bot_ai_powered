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
  idleLeaveMs: 5 * 60 * 1000,
  playCooldownMs: 3000,
};
