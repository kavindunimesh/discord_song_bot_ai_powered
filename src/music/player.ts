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
import { createTrackStream, type Track } from './track';

if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

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
      const next = this.queue.dequeue();
      if (!next) {
        this.current = null;
        this.player.stop(true);
        this.scheduleIdleLeave();
        return;
      }

      this.current = next;
      const { stream, type } = await createTrackStream(next);
      const resource = createAudioResource(stream, { inputType: type, inlineVolume: true });
      resource.volume?.setVolume(1);
      this.player.play(resource);

      if (announce && this.textChannel) {
        await this.textChannel.send({ embeds: [nowPlayingEmbed(next)] }).catch(() => undefined);
      }
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
    this.queue.clear();
    this.current = null;
    this.player.stop(true);
    this.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearIdleTimer();
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
