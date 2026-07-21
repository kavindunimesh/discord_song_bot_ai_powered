import type { FindSimilarInput, SimilarSongsProvider, SimilarSongsResult } from '../types';
import { clampLimit, normalizeSimilarResult } from '../prompt';

export type CustomProviderOptions = {
  url: string;
  apiKey?: string;
};

/**
 * POSTs { song, artist, limit } to your endpoint.
 * Expects either SimilarSongsResult JSON or a raw { similar: [...] } payload.
 */
export function createCustomProvider(options: CustomProviderOptions): SimilarSongsProvider {
  const url = options.url.replace(/\/$/, '');

  return {
    name: 'custom',
    async findSimilar(input: FindSimilarInput): Promise<SimilarSongsResult> {
      const limit = clampLimit(input);
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (options.apiKey) {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          song: input.song,
          artist: input.artist,
          limit,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Custom similar API ${res.status}: ${body.slice(0, 300) || res.statusText}`);
      }

      const data = (await res.json()) as unknown;
      return normalizeSimilarResult(data, limit);
    },
  };
}
