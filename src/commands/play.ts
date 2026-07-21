import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { config } from '../config';
import { getMusicManager } from '../music/player';
import { resolveTrack } from '../music/track';
import { errorEmbed, nowPlayingEmbed, queuedEmbed } from '../utils/embeds';
import {
  assertSameVoiceChannel,
  botCanJoinChannel,
  getMemberVoiceChannel,
} from '../utils/permissions';

const lastPlayAt = new Map<string, number>();

const play: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('YouTube URL or search query').setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed('This command only works in a server.')], ephemeral: true });
      return;
    }

    const voiceChannel = getMemberVoiceChannel(interaction);
    if (!voiceChannel) {
      await interaction.reply({ embeds: [errorEmbed('Join a voice channel first.')], ephemeral: true });
      return;
    }

    const joinError = botCanJoinChannel(voiceChannel);
    if (joinError) {
      await interaction.reply({ embeds: [errorEmbed(joinError)], ephemeral: true });
      return;
    }

    const manager = getMusicManager(interaction.guild);
    const sameChannelError = assertSameVoiceChannel(interaction, manager.voiceChannelId);
    if (sameChannelError && manager.voiceChannelId) {
      await interaction.reply({ embeds: [errorEmbed(sameChannelError)], ephemeral: true });
      return;
    }

    const now = Date.now();
    const prev = lastPlayAt.get(interaction.user.id) ?? 0;
    if (now - prev < config.playCooldownMs) {
      await interaction.reply({
        embeds: [errorEmbed('Slow down — wait a moment before requesting another track.')],
        ephemeral: true,
      });
      return;
    }
    lastPlayAt.set(interaction.user.id, now);

    const query = interaction.options.getString('query', true);
    await interaction.deferReply();

    try {
      const track = await resolveTrack(query, interaction.user);
      await manager.ensureConnected(voiceChannel);

      if (interaction.channel?.isTextBased()) {
        manager.textChannel = interaction.channel;
      }

      const wasIdle = !manager.current && !manager.isPlaying && !manager.isPaused && manager.queue.size === 0;
      const position = manager.enqueue(track);

      if (wasIdle) {
        await manager.startIfIdle(false);
        await interaction.editReply({ embeds: [nowPlayingEmbed(track)] });
      } else {
        await interaction.editReply({ embeds: [queuedEmbed(track, position)] });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to play that track.';
      await interaction.editReply({ embeds: [errorEmbed(message)] });
    }
  },
};

export default play;
