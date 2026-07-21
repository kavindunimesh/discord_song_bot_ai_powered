import { getSimilarSongsProvider } from '../ai';
import type { SimilarSong } from '../ai/types';

export type { SimilarSong };

export async function findSimilarSongs(
  song: string,
  artist?: string,
  limit = 8,
): Promise<SimilarSong[]> {
  const provider = getSimilarSongsProvider();
  if (!provider) {
    throw new Error('Similar songs provider is not configured.');
  }

  const result = await provider.findSimilar({ song, artist, limit });
  return result.similar;
}

/** Best-effort parse of "Artist - Title" style YouTube titles. */
export function splitTitleArtist(title: string): { song: string; artist?: string } {
  const cleaned = title
    .replace(/\s*[\(\[]?(official\s*)?(music\s*)?video[\)\]]?/gi, '')
    .replace(/\s*[\(\[]?lyrics?[\)\]]?/gi, '')
    .replace(/\s*[\(\[]?audio[\)\]]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const parts = cleaned.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), song: parts.slice(1).join(' - ').trim() };
  }
  return { song: cleaned };
}
