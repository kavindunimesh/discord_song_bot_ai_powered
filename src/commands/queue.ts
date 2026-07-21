import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { getExistingMusicManager } from '../music/player';
import { errorEmbed, queueEmbed } from '../utils/embeds';

const queue: SlashCommand = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the current music queue'),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ embeds: [errorEmbed('This command only works in a server.')], ephemeral: true });
      return;
    }

    const manager = getExistingMusicManager(interaction.guildId);
    if (!manager || (!manager.current && manager.queue.size === 0)) {
      await interaction.reply({ embeds: [errorEmbed('Queue is empty.')], ephemeral: true });
      return;
    }

    await interaction.reply({ embeds: [queueEmbed(manager.current, manager.queue.list)] });
  },
};

export default queue;
