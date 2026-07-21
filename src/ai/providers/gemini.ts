import {
  buildSimilarSongsPrompt,
  clampLimit,
  extractJson,
  normalizeSimilarResult,
} from '../prompt';
import type { FindSimilarInput, SimilarSongsProvider, SimilarSongsResult } from '../types';

export type GeminiProviderOptions = {
  apiKey: string;
  model: string;
};

export function createGeminiProvider(options: GeminiProviderOptions): SimilarSongsProvider {
  return {
    name: 'gemini',
    async findSimilar(input: FindSimilarInput): Promise<SimilarSongsResult> {
      const limit = clampLimit(input);
      const prompt = buildSimilarSongsPrompt({
        song: input.song,
        artist: input.artist,
        limit,
      });

      const url = new URL(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,
      );
      url.searchParams.set('key', options.apiKey);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300) || res.statusText}`);
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim();
      if (!text) {
        throw new Error('Gemini returned an empty response');
      }

      return normalizeSimilarResult(extractJson(text), limit);
    },
  };
}
