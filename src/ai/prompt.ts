import type { FindSimilarInput, SimilarSong, SimilarSongsResult } from './types';

export function buildSimilarSongsPrompt(input: {
  song: string;
  artist?: string;
  limit: number;
}): string {
  const seed = input.artist ? `"${input.song}" by ${input.artist}` : `"${input.song}"`;
  const pool = Math.min(input.limit + 8, 30);

  return [
    'You are an expert music curator who builds playlists that feel musically continuous.',
    'Do not edit files, run shell commands, or use tools.',
    'Reply with a single JSON object only — no markdown, no code fences, no commentary.',
    '',
    `Seed track: ${seed}`,
    '',
    'Step 1 — Detect the PRIMARY vocal language of the seed, then lock its vibe.',
    'Language examples: Sinhala, English, Hindi, Tamil, Korean, Japanese, Spanish, Arabic, etc.',
    'If the title/artist is clearly Sinhala (or romanized Sinhala pop), language = Sinhala.',
    'If Bollywood / Hindi film / Hindi pop, language = Hindi.',
    'If mainstream Western pop/rock with English lyrics, language = English.',
    'Mixed-language songs: use the dominant sung language.',
    '',
    'Also lock vibe (be specific):',
    '- tempo/energy (e.g. mid-tempo groove, high-energy dance)',
    '- mood/emotion (e.g. melancholic, euphoric, nocturnal, aggressive)',
    '- vocal character (e.g. breathy R&B, shouty rock, melodic rap)',
    '- production/instrumentation (e.g. synthwave pads, acoustic guitar, 808s, live drums)',
    '- era / scene if distinctive',
    '',
    `Step 2 — Recommend ${pool} REAL released songs that could sit NEXT TO the seed on the same playlist.`,
    '',
    'Hard rules (priority order):',
    "1. SAME LANGUAGE IS MANDATORY — every recommendation MUST be sung primarily in the seed's language.",
    '   - Sinhala seed → ONLY Sinhala songs. Never English/Hindi substitutes.',
    '   - English seed → ONLY English songs.',
    '   - Hindi seed → ONLY Hindi songs.',
    '   - Same for Tamil, Korean, Japanese, Spanish, etc.',
    '2. Same VIBE next — mood + energy + feel must match strongly. Genre alone is NOT enough.',
    '3. Prefer tracks a listener of the seed would actually like right after it.',
    "4. Diversify artists — at most 2 songs from the same artist (including the seed's artist).",
    '5. Prefer well-known official studio recordings (not live, karaoke, covers, or remixes of the seed).',
    '6. Never include the seed track itself.',
    "7. Reject weak links: only-same-decade or 'also popular' with a different feel.",
    '',
    'Score each recommendation vibeMatch from 0.0 to 1.0:',
    '- 0.90–1.00 = nearly interchangeable vibe',
    '- 0.80–0.89 = very strong same-vibe neighbors',
    '- below 0.80 = do NOT include',
    '',
    'Sort similar by vibeMatch descending.',
    'In reason, name the shared vibe traits in under 12 words.',
    '',
    'JSON shape:',
    '{',
    '  "query": { "name": string, "artist": string, "language": string, "vibe": string },',
    '  "similar": [ { "name": string, "artist": string, "language": string, "vibeMatch": number, "reason": string } ]',
    '}',
    '',
    `"similar" must contain exactly ${pool} items, all same language as query, all with vibeMatch >= 0.80.`,
    'Every similar[].language must exactly match query.language.',
    'Resolve the most likely artist for the query if artist was omitted.',
  ].join('\n');
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error('AI returned a non-JSON response');
}

function normalizeLanguage(value: unknown): string | undefined {
  const language = String(value ?? '').trim();
  return language || undefined;
}

function languagesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  return a.toLowerCase() === b.toLowerCase();
}

function normalizeSong(value: unknown): SimilarSong | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const name = String(obj.name ?? '').trim();
  const artist = String(obj.artist ?? '').trim();
  if (!name || !artist) return null;

  const reason = String(obj.reason ?? '').trim() || undefined;
  const language = normalizeLanguage(obj.language);
  const vibeMatchRaw = obj.vibeMatch ?? obj.vibe_match ?? obj.match;
  const vibeMatchNum =
    vibeMatchRaw === undefined || vibeMatchRaw === null ? undefined : Number(vibeMatchRaw);
  const vibeMatch = Number.isFinite(vibeMatchNum)
    ? Math.min(Math.max(vibeMatchNum as number, 0), 1)
    : undefined;

  return { name, artist, language, reason, vibeMatch };
}

function songKey(song: SimilarSong): string {
  return `${song.name.toLowerCase()}::${song.artist.toLowerCase()}`;
}

export function normalizeSimilarResult(raw: unknown, limit: number): SimilarSongsResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI returned an unexpected payload');
  }

  const obj = raw as Record<string, unknown>;
  const queryBase = normalizeSong(obj.query);
  if (!queryBase) {
    throw new Error('AI response missing a valid query song');
  }

  const queryMeta =
    obj.query && typeof obj.query === 'object' ? (obj.query as Record<string, unknown>) : {};
  const vibe = String(queryMeta.vibe ?? '').trim() || undefined;
  const language = queryBase.language || normalizeLanguage(queryMeta.language);
  const queryKey = songKey(queryBase);
  const similarRaw = Array.isArray(obj.similar) ? obj.similar : [];

  const seen = new Set<string>([queryKey]);
  const similar = similarRaw
    .map(normalizeSong)
    .filter((s): s is SimilarSong => s !== null)
    .filter((s) => songKey(s) !== queryKey)
    .filter((s) => languagesMatch(language, s.language))
    .filter((s) => (s.vibeMatch ?? 0) >= 0.8)
    .sort((a, b) => (b.vibeMatch ?? 0) - (a.vibeMatch ?? 0))
    .filter((s) => {
      const key = songKey(s);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);

  if (!similar.length) {
    throw new Error('AI returned no strong same-language same-vibe songs');
  }

  return {
    query: { ...queryBase, language, vibe },
    similar,
  };
}

export function clampLimit(input: FindSimilarInput): number {
  return Math.min(Math.max(input.limit ?? 10, 1), 25);
}
