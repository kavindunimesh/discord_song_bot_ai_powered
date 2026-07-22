import { spawn } from 'node:child_process';
import { PassThrough, type Readable } from 'node:stream';
import { StreamType } from '@discordjs/voice';
import youtubeDl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../config';

const ytdlpBin = require.resolve('youtube-dl-exec/bin/yt-dlp');
const YT_FORMAT = 'bestaudio*/best[height<=720]/best';
const JS_RUNTIME = 'node';

function extractorArgs(): string {
  return config.youtubeCookiesPath
    ? 'youtube:player_client=web,tv,mweb'
    : 'youtube:player_client=android,web,tv';
}

function cookieArgs(): string[] {
  return config.youtubeCookiesPath ? ['--cookies', config.youtubeCookiesPath] : [];
}

function cookieFlags(): Record<string, string> {
  return config.youtubeCookiesPath ? { cookies: config.youtubeCookiesPath } : {};
}

function commonYtdlpFlags(): Record<string, unknown> {
  return {
    noWarnings: true,
    noCheckCertificates: true,
    extractorArgs: extractorArgs(),
    format: YT_FORMAT,
    jsRuntimes: JS_RUNTIME,
    ...cookieFlags(),
  };
}

function commonYtdlpCliArgs(): string[] {
  return [
    '--format',
    YT_FORMAT,
    '--no-warnings',
    '--extractor-args',
    extractorArgs(),
    '--js-runtimes',
    JS_RUNTIME,
    ...cookieArgs(),
  ];
}

export type TrackRequester = {
  id: string;
  tag: string;
};

export type Track = {
  title: string;
  url: string;
  durationSec: number;
  thumbnail?: string;
  requestedById: string;
  requestedByTag: string;
  autoplay?: boolean;
};

type YtDlpInfo = {
  id?: string;
  title?: string;
  webpage_url?: string;
  original_url?: string;
  url?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url?: string }[];
  entries?: YtDlpInfo[];
  _type?: string;
};

const YT_VIDEO_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/i;
const YT_PLAYLIST_RE = /[?&]list=|youtube\.com\/playlist/i;

function isYouTubeVideoUrl(input: string): boolean {
  return YT_VIDEO_RE.test(input) && !YT_PLAYLIST_RE.test(input);
}

function isYouTubePlaylistUrl(input: string): boolean {
  return YT_PLAYLIST_RE.test(input);
}

function pickThumbnail(info: YtDlpInfo): string | undefined {
  if (info.thumbnail) return info.thumbnail;
  const thumbs = info.thumbnails?.filter((t) => t.url);
  return thumbs?.at(-1)?.url;
}

function toTrack(info: YtDlpInfo, requester: TrackRequester): Track {
  const url = info.webpage_url || info.original_url || info.url;
  if (!url) throw new Error('Could not resolve a playable URL.');

  return {
    title: info.title ?? 'Unknown title',
    url,
    durationSec: Math.floor(Number(info.duration) || 0),
    thumbnail: pickThumbnail(info),
    requestedById: requester.id,
    requestedByTag: requester.tag,
  };
}

async function fetchInfo(target: string): Promise<YtDlpInfo> {
  const info = (await youtubeDl(target, {
    dumpSingleJson: true,
    skipDownload: true,
    noPlaylist: true,
    ...commonYtdlpFlags(),
  } as never)) as YtDlpInfo;

  if (info.entries?.length) {
    const first = info.entries.find((e) => e && (e.id || e.url || e.webpage_url));
    if (!first) throw new Error('No results found for that query.');

    if (!first.title || !first.duration) {
      const videoUrl =
        first.webpage_url ||
        first.url ||
        (first.id ? `https://www.youtube.com/watch?v=${first.id}` : undefined);
      if (!videoUrl) throw new Error('No results found for that query.');
      return fetchInfo(videoUrl);
    }
    return first;
  }

  return info;
}

export async function resolveTrack(query: string, requester: TrackRequester): Promise<Track> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Provide a song name or URL.');

  if (isYouTubePlaylistUrl(trimmed) && !isYouTubeVideoUrl(trimmed)) {
    throw new Error('Playlists are not supported yet. Paste a single video URL or search by name.');
  }

  try {
    const target = isYouTubeVideoUrl(trimmed) ? trimmed : `ytsearch1:${trimmed}`;
    return toTrack(await fetchInfo(target), requester);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Playlists are not supported')) throw err;
    throw new Error(`Could not resolve track: ${friendlyYtdlpError(message)}`);
  }
}

function friendlyYtdlpError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("confirm you're not a bot") || lower.includes('sign in to confirm')) {
    if (!config.youtubeCookiesPath) {
      return (
        'YouTube blocked this server IP. Upload a fresh cookies.txt to the bot folder ' +
        '(export while logged into YouTube), then restart the bot.'
      );
    }
    return (
      'YouTube blocked this server IP even with cookies. Re-export a fresh cookies.txt ' +
      'while logged into youtube.com, upload it to the VPS, and restart the bot.'
    );
  }
  return message;
}

export async function createTrackStream(track: Track): Promise<{
  stream: Readable;
  type: StreamType;
}> {
  if (!ffmpegPath) throw new Error('ffmpeg binary not found (ffmpeg-static).');
  if (!ytdlpBin) throw new Error('yt-dlp binary not found (youtube-dl-exec).');

  const ytdlp = spawn(
    ytdlpBin,
    [track.url, '--quiet', '--no-playlist', ...commonYtdlpCliArgs(), '-o', '-'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const ffmpeg = spawn(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel', 'error',
      // Let ffmpeg probe enough of the yt-dlp stream (0 often breaks on VPS)
      '-probesize', '32M',
      '-analyzeduration', '10M',
      '-i', 'pipe:0',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  if (!ytdlp.stdout || !ffmpeg.stdin || !ffmpeg.stdout) {
    ytdlp.kill('SIGKILL');
    ffmpeg.kill('SIGKILL');
    throw new Error('Failed to create audio stream.');
  }

  let ytdlpErr = '';
  let ffmpegErr = '';
  let ytdlpBytes = 0;
  ytdlp.stderr?.on('data', (chunk: Buffer) => {
    ytdlpErr += chunk.toString();
  });
  ffmpeg.stderr?.on('data', (chunk: Buffer) => {
    ffmpegErr += chunk.toString();
  });

  // Wait for real audio bytes from yt-dlp before attaching ffmpeg (avoids empty/HTML pipe errors)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanupEarly();
      reject(
        new Error(
          friendlyYtdlpError(
            ytdlpErr.trim() || 'Timed out waiting for YouTube audio (yt-dlp produced no data).',
          ),
        ),
      );
    }, 45_000);

    const cleanupEarly = () => {
      clearTimeout(timeout);
      try {
        ytdlp.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      try {
        ffmpeg.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    };

    ytdlp.on('error', (err) => {
      cleanupEarly();
      reject(err);
    });

    ytdlp.on('close', (code) => {
      if (ytdlpBytes > 0) return;
      if (code && code !== 0) {
        clearTimeout(timeout);
        reject(
          new Error(
            friendlyYtdlpError(
              ytdlpErr.trim() || `yt-dlp failed (exit ${code})`,
            ),
          ),
        );
      }
    });

    ytdlp.stdout.once('data', (first: Buffer) => {
      clearTimeout(timeout);
      ytdlpBytes += first.length;
      if (!ffmpeg.stdin.write(first)) {
        ytdlp.stdout.pause();
        ffmpeg.stdin.once('drain', () => ytdlp.stdout.resume());
      }
      ytdlp.stdout.pipe(ffmpeg.stdin);
      resolve();
    });
  });

  const output = new PassThrough({ highWaterMark: 1 << 20 });

  const cleanup = () => {
    try {
      ytdlp.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    try {
      ffmpeg.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    if (!output.destroyed) output.destroy();
  };

  ytdlp.on('error', (err) => {
    cleanup();
    console.error('yt-dlp spawn error:', err);
  });

  ffmpeg.on('error', (err) => {
    cleanup();
    console.error('ffmpeg spawn error:', err);
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          friendlyYtdlpError(
            ytdlpErr.trim() || 'Timed out waiting for ffmpeg to decode audio.',
          ),
        ),
      );
    }, 45_000);

    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      reject(new Error(friendlyYtdlpError(message)));
    };

    ffmpeg.stdout.once('data', (chunk: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!output.destroyed) output.write(chunk);
      ffmpeg.stdout.on('data', (next: Buffer) => {
        if (!output.destroyed) output.write(next);
      });
      ffmpeg.stdout.on('end', () => {
        if (!output.destroyed) output.end();
      });
      ffmpeg.stdout.on('error', (err) => {
        if (!output.destroyed) output.destroy(err);
      });
      resolve();
    });

    ytdlp.on('close', (code) => {
      if (code && code !== 0 && !settled) {
        fail(ytdlpErr.trim() || `yt-dlp failed (exit ${code})`);
      }
    });

    ffmpeg.on('close', (code) => {
      if (code && code !== 0 && !settled) {
        const detail =
          ytdlpErr.trim() ||
          ffmpegErr.trim() ||
          `ffmpeg failed (exit ${code})`;
        fail(detail);
      }
    });
  });

  return { stream: output, type: StreamType.Raw };
}
