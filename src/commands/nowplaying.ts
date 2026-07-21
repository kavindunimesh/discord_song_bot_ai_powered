import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { getExistingMusicManager } from '../music/player';
import { errorEmbed, nowPlayingEmbed } from '../utils/embeds';

const nowplaying: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the track that is currently playing'),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ embeds: [errorEmbed('This command only works in a server.')], ephemeral: true });
      return;
    }

    const manager = getExistingMusicManager(interaction.guildId);
    if (!manager?.current) {
      await interaction.reply({ embeds: [errorEmbed('Nothing is playing.')], ephemeral: true });
      return;
    }

    await interaction.reply({ embeds: [nowPlayingEmbed(manager.current)] });
  },
};

export default nowplaying;
