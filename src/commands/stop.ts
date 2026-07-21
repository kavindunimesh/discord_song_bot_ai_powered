import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { errorEmbed, successEmbed } from '../utils/embeds';
import { requireVoiceControl } from '../utils/permissions';

const stop: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue, and leave the voice channel'),

  async execute(interaction) {
    const result = requireVoiceControl(interaction);
    if ('error' in result) {
      await interaction.reply({ embeds: [errorEmbed(result.error)], ephemeral: true });
      return;
    }

    result.manager.leave();
    await interaction.reply({ embeds: [successEmbed('Stopped and left the voice channel.')] });
  },
};

export default stop;
