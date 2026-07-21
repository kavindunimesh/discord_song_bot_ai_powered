import { Client, GatewayIntentBits } from 'discord.js';
import { loadCommands, registerCommands } from './loadCommands';

async function main(): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const commands = await loadCommands(client);
  await registerCommands(commands);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to deploy commands:', err);
  process.exit(1);
});
