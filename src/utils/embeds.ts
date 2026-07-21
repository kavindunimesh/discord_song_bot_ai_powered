import { EmbedBuilder } from 'discord.js';
import type { Track } from '../music/track';

const ACCENT = 0x57f287;

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setDescription(message);
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(ACCENT).setDescription(message);
}

export function nowPlayingEmbed(track: Track): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('Now playing')
    .setDescription(`[${track.title}](${track.url})`)
    .addFields(
      { name: 'Duration', value: formatDuration(track.durationSec), inline: true },
      { name: 'Requested by', value: `<@${track.requestedById}>`, inline: true },
    );

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

export function queuedEmbed(track: Track, position: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('Added to queue')
    .setDescription(`[${track.title}](${track.url})`)
    .addFields(
      { name: 'Position', value: String(position), inline: true },
      { name: 'Duration', value: formatDuration(track.durationSec), inline: true },
      { name: 'Requested by', value: `<@${track.requestedById}>`, inline: true },
    );

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

export function queueEmbed(current: Track | null, upcoming: Track[]): EmbedBuilder {
  const lines: string[] = [];

  if (current) {
    lines.push(`**Now:** [${current.title}](${current.url}) — <@${current.requestedById}>`);
  }

  if (upcoming.length === 0) {
    lines.push(current ? '_Nothing else queued._' : '_Queue is empty._');
  } else {
    upcoming.slice(0, 15).forEach((track, i) => {
      lines.push(
        `**${i + 1}.** [${track.title}](${track.url}) \`${formatDuration(track.durationSec)}\` — <@${track.requestedById}>`,
      );
    });
    if (upcoming.length > 15) {
      lines.push(`_…and ${upcoming.length - 15} more_`);
    }
  }

  return new EmbedBuilder().setColor(ACCENT).setTitle('Queue').setDescription(lines.join('\n'));
}

function formatDuration(totalSec: number): string {
  if (!totalSec || totalSec < 0) return 'Unknown';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
