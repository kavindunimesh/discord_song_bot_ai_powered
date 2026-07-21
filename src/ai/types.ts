export type SimilarSong = {
  name: string;
  artist: string;
  language?: string;
  reason?: string;
  vibeMatch?: number;
};

export type SimilarSongsResult = {
  query: SimilarSong & {
    vibe?: string;
  };
  similar: SimilarSong[];
};

export type FindSimilarInput = {
  song: string;
  artist?: string;
  limit?: number;
};

export interface SimilarSongsProvider {
  readonly name: string;
  findSimilar(input: FindSimilarInput): Promise<SimilarSongsResult>;
}

export type SimilarProviderId = 'cursor' | 'openai' | 'gemini' | 'custom';
