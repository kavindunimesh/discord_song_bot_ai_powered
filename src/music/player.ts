import {
  AudioPlayer,
  AudioPlayerStatus,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { Guild, GuildTextBasedChannel, VoiceBasedChannel } from 'discord.js';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../config';
import { errorEmbed, nowPlayingEmbed } from '../utils/embeds';
import { TrackQueue } from './queue';
import { findSimilarSongs, splitTitleArtist } from './similar';
import { createTrackStream, resolveTrack, type Track } from './track';
import { getSimilarSongsProvider } from '../ai';

if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const RECENT_LIMIT = 25;

export class GuildMusicPlayer {
  readonly guildId: string;
  readonly queue = new TrackQueue();
  readonly player: AudioPlayer;

  current: Track | null = null;
  textChannel: GuildTextBasedChannel | null = null;
  voiceChannelId: string | null = null;

  private connection: VoiceConnection | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  private starting = false;

  private prefetched: Track | null = null;
  private prefetchPromise: Promise<Track | null> | null = null;
  private prefetchSeedUrl: string | null = null;
  private recentUrls: string[] = [];

  constructor(guildId: string) {
    this.guildId = guildId;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      void this.onTrackEnd();
    });

    this.player.on('error', (err) => {
      console.error(`[guild:${this.guildId}] player error:`, err);
      void this.notify(`Playback error: ${err.message}`);
      void this.onTrackEnd();
    });
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  get isPlaying(): boolean {
    return (
      this.player.state.status === AudioPlayerStatus.Playing ||
      this.player.state.status === AudioPlayerStatus.Buffering
    );
  }

  get isPaused(): boolean {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  async ensureConnected(voiceChannel: VoiceBasedChannel): Promise<void> {
    const existing = getVoiceConnection(this.guildId);
    if (existing && this.voiceChannelId === voiceChannel.id) {
      this.connection = existing;
      existing.subscribe(this.player);
      return;
    }

    if (existing) existing.destroy();

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.on('error', (err) => {
      console.error(`[guild:${this.guildId}] connection error:`, err);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        try {
          connection.destroy();
        } catch {
          /* already destroyed */
        }
        this.resetVoiceState();
      }
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
      try {
        connection.destroy();
      } catch {
        /* ignore */
      }
      this.resetVoiceState();
      const detail = err instanceof Error ? err.message : 'unknown error';
      throw new Error(`Could not join voice: ${detail}`);
    }

    connection.subscribe(this.player);
    this.connection = connection;
    this.voiceChannelId = voiceChannel.id;
    this.clearIdleTimer();
  }

  enqueue(track: Track): number {
    if (this.queue.size >= config.maxQueueSize) {
      throw new Error(`Queue is full (max ${config.maxQueueSize}).`);
    }
    this.clearPrefetch();
    return this.queue.enqueue(track);
  }

  async startIfIdle(announce = true): Promise<void> {
    if (this.starting || this.current || this.isPlaying || this.isPaused) return;
    await this.playNext(announce);
  }

  async playNext(announce = true): Promise<void> {
    if (this.destroyed) return;
    this.starting = true;
    this.clearIdleTimer();

    try {
      let next = this.queue.dequeue() ?? (await this.takePrefetched()) ?? undefined;

      if (!next) {
        this.current = null;
        this.player.stop(true);
        this.scheduleIdleLeave();
        return;
      }

      this.current = next;
      this.rememberUrl(next.url);

      const { stream, type } = await createTrackStream(next);
      const resource = createAudioResource(stream, { inputType: type, inlineVolume: true });
      resource.volume?.setVolume(1);
      this.player.play(resource);

      if (announce && this.textChannel) {
        await this.textChannel.send({ embeds: [nowPlayingEmbed(next)] }).catch(() => undefined);
      }

      this.beginPrefetch(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[guild:${this.guildId}] failed to start track:`, err);
      await this.notify(`Could not play **${this.current?.title ?? 'track'}**: ${message}`);
      this.current = null;
      await this.playNext(announce);
    } finally {
      this.starting = false;
    }
  }

  skip(): Track | null {
    const skipped = this.current;
    this.player.stop(true);
    return skipped;
  }

  pause(): boolean {
    if (!this.isPlaying) return false;
    return this.player.pause(true);
  }

  resume(): boolean {
    if (!this.isPaused) return false;
    return this.player.unpause();
  }

  leave(): void {
    this.clearPrefetch();
    this.queue.clear();
    this.current = null;
    this.player.stop(true);
    this.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearIdleTimer();
    this.clearPrefetch();
    try {
      this.player.stop(true);
    } catch {
      /* ignore */
    }
    try {
      this.connection?.destroy();
    } catch {
      /* ignore */
    }
    this.resetVoiceState();
    musicManagers.delete(this.guildId);
  }

  private async onTrackEnd(): Promise<void> {
    if (this.destroyed || this.starting) return;
    if (this.player.state.status !== AudioPlayerStatus.Idle) return;
    this.current = null;
    await this.playNext();
  }

  private beginPrefetch(seed: Track): void {
    if (!config.autoSimilar || !getSimilarSongsProvider()) return;
    if (this.queue.size > 0) return;

    this.clearPrefetch();
    this.prefetchSeedUrl = seed.url;
    const seedUrl = seed.url;

    this.prefetchPromise = this.resolveSimilarTrack(seed)
      .then((track) => {
        if (this.destroyed || this.prefetchSeedUrl !== seedUrl) return null;
        this.prefetched = track;
        if (track) {
          console.log(`[guild:${this.guildId}] prefetched similar: ${track.title}`);
        }
        return track;
      })
      .catch((err) => {
        console.error(`[guild:${this.guildId}] similar prefetch failed:`, err);
        return null;
      });
  }

  private async takePrefetched(): Promise<Track | null> {
    if (!config.autoSimilar || !getSimilarSongsProvider()) return null;

    if (this.prefetched) {
      const track = this.prefetched;
      this.clearPrefetch();
      return track;
    }

    if (this.prefetchPromise) {
      const track = await this.prefetchPromise;
      this.clearPrefetch();
      return track;
    }

    return null;
  }

  private async resolveSimilarTrack(seed: Track): Promise<Track | null> {
    const { song, artist } = splitTitleArtist(seed.title);
    const suggestions = await findSimilarSongs(song, artist, 8);
    const requester = {
      id: seed.requestedById,
      tag: seed.requestedByTag,
    };

    for (const suggestion of suggestions) {
      if (this.destroyed) return null;
      const query = `${suggestion.name} ${suggestion.artist}`.trim();
      try {
        const track = await resolveTrack(query, requester);
        if (this.recentUrls.includes(track.url) || track.url === seed.url) continue;
        track.autoplay = true;
        return track;
      } catch (err) {
        console.warn(
          `[guild:${this.guildId}] could not resolve similar "${query}":`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return null;
  }

  private clearPrefetch(): void {
    this.prefetched = null;
    this.prefetchPromise = null;
    this.prefetchSeedUrl = null;
  }

  private rememberUrl(url: string): void {
    this.recentUrls.push(url);
    if (this.recentUrls.length > RECENT_LIMIT) {
      this.recentUrls.splice(0, this.recentUrls.length - RECENT_LIMIT);
    }
  }

  private scheduleIdleLeave(): void {
    if (!config.idleLeave) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.notify('Left the voice channel due to inactivity.');
      this.destroy();
    }, config.idleLeaveMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private resetVoiceState(): void {
    this.connection = null;
    this.voiceChannelId = null;
  }

  private async notify(message: string): Promise<void> {
    if (!this.textChannel) return;
    await this.textChannel.send({ embeds: [errorEmbed(message)] }).catch(() => undefined);
  }
}

const musicManagers = new Map<string, GuildMusicPlayer>();

export function getMusicManager(guild: Guild): GuildMusicPlayer {
  let manager = musicManagers.get(guild.id);
  if (!manager || manager.isDestroyed) {
    manager = new GuildMusicPlayer(guild.id);
    musicManagers.set(guild.id, manager);
  }
  return manager;
}

export function getExistingMusicManager(guildId: string): GuildMusicPlayer | undefined {
  const manager = musicManagers.get(guildId);
  if (!manager || manager.isDestroyed) return undefined;
  return manager;
}
