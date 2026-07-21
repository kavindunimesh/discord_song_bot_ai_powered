import {
  buildSimilarSongsPrompt,
  clampLimit,
  extractJson,
  normalizeSimilarResult,
} from '../prompt';
import type { FindSimilarInput, SimilarSongsProvider, SimilarSongsResult } from '../types';

export type OpenAiProviderOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export function createOpenAiProvider(options: OpenAiProviderOptions): SimilarSongsProvider {
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');

  return {
    name: 'openai',
    async findSimilar(input: FindSimilarInput): Promise<SimilarSongsResult> {
      const limit = clampLimit(input);
      const prompt = buildSimilarSongsPrompt({
        song: input.song,
        artist: input.artist,
        limit,
      });

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You return only valid JSON matching the requested schema.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 300) || res.statusText}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('OpenAI returned an empty response');
      }

      return normalizeSimilarResult(extractJson(text), limit);
    },
  };
}
