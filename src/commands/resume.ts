import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { errorEmbed, successEmbed } from '../utils/embeds';
import { requireVoiceControl } from '../utils/permissions';

const resume: SlashCommand = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume the paused track'),

  async execute(interaction) {
    const result = requireVoiceControl(interaction, { needTrack: true });
    if ('error' in result) {
      await interaction.reply({ embeds: [errorEmbed(result.error)], ephemeral: true });
      return;
    }

    if (!result.manager.resume()) {
      await interaction.reply({ embeds: [errorEmbed('Nothing is paused.')], ephemeral: true });
      return;
    }

    await interaction.reply({ embeds: [successEmbed('Resumed.')] });
  },
};

export default resume;
