import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../loadCommands';
import { successEmbed } from '../utils/embeds';

const ping: SlashCommand = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check if the bot is online'),

  async execute(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      embeds: [successEmbed(`Pong — ${latency}ms (WS ${interaction.client.ws.ping}ms)`)],
    });
  },
};

export default ping;
