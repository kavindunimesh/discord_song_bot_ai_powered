import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  VoiceBasedChannel,
} from 'discord.js';
import { getExistingMusicManager, type GuildMusicPlayer } from '../music/player';

export function getMemberVoiceChannel(
  interaction: ChatInputCommandInteraction,
): VoiceBasedChannel | null {
  if (!interaction.inGuild() || !(interaction.member instanceof GuildMember)) {
    return null;
  }
  return interaction.member.voice.channel ?? null;
}

export function assertSameVoiceChannel(
  interaction: ChatInputCommandInteraction,
  botChannelId: string | null | undefined,
): string | null {
  const memberChannel = getMemberVoiceChannel(interaction);
  if (!memberChannel) return 'Join a voice channel first.';
  if (botChannelId && memberChannel.id !== botChannelId) {
    return 'You must be in the same voice channel as the bot.';
  }
  return null;
}

export function botCanJoinChannel(channel: VoiceBasedChannel): string | null {
  const me = channel.guild.members.me;
  if (!me) return 'Bot member not found in this server.';

  const permissions = channel.permissionsFor(me);
  if (!permissions) return 'Cannot resolve bot permissions for that channel.';
  if (!permissions.has(PermissionFlagsBits.Connect)) {
    return 'I need the **Connect** permission in that voice channel.';
  }
  if (!permissions.has(PermissionFlagsBits.Speak)) {
    return 'I need the **Speak** permission in that voice channel.';
  }
  return null;
}

export function requireVoiceControl(
  interaction: ChatInputCommandInteraction,
  opts: { needTrack?: boolean } = {},
): { manager: GuildMusicPlayer } | { error: string } {
  if (!interaction.inGuild() || !interaction.guildId) {
    return { error: 'This command only works in a server.' };
  }

  const manager = getExistingMusicManager(interaction.guildId);
  if (!manager?.voiceChannelId) {
    return { error: 'I am not in a voice channel.' };
  }
  if (opts.needTrack && !manager.current) {
    return { error: 'Nothing is playing.' };
  }

  const sameChannelError = assertSameVoiceChannel(interaction, manager.voiceChannelId);
  if (sameChannelError) return { error: sameChannelError };

  return { manager };
}
