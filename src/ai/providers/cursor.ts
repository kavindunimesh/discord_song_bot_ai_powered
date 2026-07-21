import { Agent, CursorAgentError } from '@cursor/sdk';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildSimilarSongsPrompt,
  clampLimit,
  extractJson,
  normalizeSimilarResult,
} from '../prompt';
import type { FindSimilarInput, SimilarSongsProvider, SimilarSongsResult } from '../types';

export type CursorProviderOptions = {
  apiKey: string;
  model: string;
  cwd?: string;
};

const requireFromSdk = createRequire(require.resolve('@cursor/sdk'));

function platformSdkPackage(): string | undefined {
  const key = `${process.platform}-${process.arch}`;
  const map: Record<string, string> = {
    'darwin-arm64': '@cursor/sdk-darwin-arm64',
    'darwin-x64': '@cursor/sdk-darwin-x64',
    'linux-x64': '@cursor/sdk-linux-x64',
    'linux-arm64': '@cursor/sdk-linux-arm64',
    'win32-x64': '@cursor/sdk-win32-x64',
  };
  return map[key];
}

/** Cursor local runtime needs an absolute ripgrep binary path. */
function ensureCursorRipgrep(): void {
  const existing = process.env.CURSOR_RIPGREP_PATH?.trim();
  if (existing && path.isAbsolute(existing) && fs.existsSync(existing)) return;

  const pkg = platformSdkPackage();
  if (!pkg) return;

  try {
    const rgName = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const rgPath = requireFromSdk.resolve(`${pkg}/bin/${rgName}`);
    if (fs.existsSync(rgPath)) {
      process.env.CURSOR_RIPGREP_PATH = rgPath;
    }
  } catch {
    /* optional platform package missing — SDK may still resolve rg itself */
  }
}

function agentWorkspace(cwd?: string): string {
  if (cwd) return cwd;
  const dir = path.join(os.tmpdir(), 'discord-song-bot-cursor');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createCursorProvider(options: CursorProviderOptions): SimilarSongsProvider {
  ensureCursorRipgrep();

  return {
    name: 'cursor',
    async findSimilar(input: FindSimilarInput): Promise<SimilarSongsResult> {
      ensureCursorRipgrep();

      const limit = clampLimit(input);
      const prompt = buildSimilarSongsPrompt({
        song: input.song,
        artist: input.artist,
        limit,
      });

      let result;
      try {
        result = await Agent.prompt(prompt, {
          apiKey: options.apiKey,
          model: { id: options.model },
          local: { cwd: agentWorkspace(options.cwd) },
        });
      } catch (err) {
        if (err instanceof CursorAgentError) {
          throw new Error(`Cursor agent failed to start: ${err.message}`);
        }
        throw err;
      }

      if (result.status === 'error') {
        throw new Error(`Cursor agent run failed (${result.id})`);
      }
      if (result.status === 'cancelled') {
        throw new Error('Cursor agent run was cancelled');
      }

      const text = result.result?.trim();
      if (!text) {
        throw new Error('Cursor AI returned an empty response');
      }

      return normalizeSimilarResult(extractJson(text), limit);
    },
  };
}
