import {
  ChatInputCommandInteraction,
  Collection,
  REST,
  Routes,
  type Client,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandBuilder,
} from 'discord.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';

export type SlashCommand = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, SlashCommand>;
  }
}

export async function loadCommands(client: Client): Promise<SlashCommand[]> {
  client.commands = new Collection();
  const commandsDir = join(__dirname, 'commands');
  const files = readdirSync(commandsDir).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
  const commands: SlashCommand[] = [];

  for (const file of files) {
    const mod = require(join(commandsDir, file)) as { default?: SlashCommand } & SlashCommand;
    const command = mod.default ?? mod;
    if (!command?.data?.name || typeof command.execute !== 'function') {
      console.warn(`Skipping invalid command file: ${file}`);
      continue;
    }
    client.commands.set(command.data.name, command);
    commands.push(command);
  }

  return commands;
}

export async function registerCommands(commands: SlashCommand[]): Promise<void> {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`Registered ${body.length} guild commands for ${config.guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Registered ${body.length} global commands`);
  }
}
