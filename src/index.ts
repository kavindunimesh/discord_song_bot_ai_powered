import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { loadCommands } from './loadCommands';
import { errorEmbed } from './utils/embeds';

async function main(): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  const commands = await loadCommands(client);
  console.log(`Loaded ${commands.length} commands`);

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({
        embeds: [errorEmbed('Unknown command.')],
        ephemeral: true,
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error running /${interaction.commandName}:`, err);
      const payload = {
        embeds: [errorEmbed('Something went wrong while running that command.')],
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => undefined);
      } else {
        await interaction.reply(payload).catch(() => undefined);
      }
    }
  });

  await client.login(config.token);
}

main().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
