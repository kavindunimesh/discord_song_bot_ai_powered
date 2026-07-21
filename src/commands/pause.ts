import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { errorEmbed, successEmbed } from '../utils/embeds';
import { requireVoiceControl } from '../utils/permissions';

const pause: SlashCommand = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current track'),

  async execute(interaction) {
    const result = requireVoiceControl(interaction, { needTrack: true });
    if ('error' in result) {
      await interaction.reply({ embeds: [errorEmbed(result.error)], ephemeral: true });
      return;
    }

    if (!result.manager.pause()) {
      await interaction.reply({ embeds: [errorEmbed('Already paused or not playing.')], ephemeral: true });
      return;
    }

    await interaction.reply({ embeds: [successEmbed('Paused.')] });
  },
};

export default pause;
