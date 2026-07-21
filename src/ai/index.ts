import { config } from '../config';
import { createCursorProvider } from './providers/cursor';
import { createCustomProvider } from './providers/custom';
import { createGeminiProvider } from './providers/gemini';
import { createOpenAiProvider } from './providers/openai';
import type { SimilarProviderId, SimilarSongsProvider } from './types';

export type { SimilarSong, SimilarSongsResult, SimilarSongsProvider, SimilarProviderId } from './types';

let cached: SimilarSongsProvider | null | undefined;

export function getSimilarSongsProvider(): SimilarSongsProvider | null {
  if (cached !== undefined) return cached;

  if (!config.autoSimilar) {
    cached = null;
    return cached;
  }

  const id = config.similarProvider;
  cached = buildProvider(id);
  return cached;
}

function buildProvider(id: SimilarProviderId): SimilarSongsProvider | null {
  switch (id) {
    case 'cursor': {
      if (!config.cursorApiKey) {
        console.warn('AUTO_SIMILAR is on but CURSOR_API_KEY is missing — similar autoplay disabled.');
        return null;
      }
      return createCursorProvider({
        apiKey: config.cursorApiKey,
        model: config.cursorModel,
      });
    }
    case 'openai': {
      if (!config.openaiApiKey) {
        console.warn('AUTO_SIMILAR is on but OPENAI_API_KEY is missing — similar autoplay disabled.');
        return null;
      }
      return createOpenAiProvider({
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
        baseUrl: config.openaiBaseUrl,
      });
    }
    case 'gemini': {
      if (!config.geminiApiKey) {
        console.warn('AUTO_SIMILAR is on but GEMINI_API_KEY is missing — similar autoplay disabled.');
        return null;
      }
      return createGeminiProvider({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
      });
    }
    case 'custom': {
      if (!config.customSimilarUrl) {
        console.warn('AUTO_SIMILAR is on but CUSTOM_SIMILAR_URL is missing — similar autoplay disabled.');
        return null;
      }
      return createCustomProvider({
        url: config.customSimilarUrl,
        apiKey: config.customSimilarApiKey,
      });
    }
    default: {
      console.warn(`Unknown SIMILAR_PROVIDER "${id as string}" — similar autoplay disabled.`);
      return null;
    }
  }
}
