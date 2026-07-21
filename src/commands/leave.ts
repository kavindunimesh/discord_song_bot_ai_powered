import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { errorEmbed, successEmbed } from '../utils/embeds';
import { requireVoiceControl } from '../utils/permissions';

const leave: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from the voice channel'),

  async execute(interaction) {
    const result = requireVoiceControl(interaction);
    if ('error' in result) {
      await interaction.reply({ embeds: [errorEmbed(result.error)], ephemeral: true });
      return;
    }

    result.manager.leave();
    await interaction.reply({ embeds: [successEmbed('Left the voice channel.')] });
  },
};

export default leave;
