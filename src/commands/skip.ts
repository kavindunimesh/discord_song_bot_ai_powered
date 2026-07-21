import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { errorEmbed, successEmbed } from '../utils/embeds';
import { requireVoiceControl } from '../utils/permissions';

const skip: SlashCommand = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),

  async execute(interaction) {
    const result = requireVoiceControl(interaction, { needTrack: true });
    if ('error' in result) {
      await interaction.reply({ embeds: [errorEmbed(result.error)], ephemeral: true });
      return;
    }

    const skipped = result.manager.skip();
    await interaction.reply({
      embeds: [successEmbed(skipped ? `Skipped **${skipped.title}**` : 'Skipped.')],
    });
  },
};

export default skip;
