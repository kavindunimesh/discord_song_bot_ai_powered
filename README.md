# Discord Song Bot

Plays YouTube tracks in Griffinzone Discord voice channels.

## Setup

```bash
cp .env.example .env
# set DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
pnpm install
pnpm deploy-commands
pnpm dev
```

Optional: drop a Netscape `cookies.txt` in the project root if YouTube blocks the server IP.

Invite (replace `CLIENT_ID`):

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=3148800&scope=bot%20applications.commands
```

Needs Connect, Speak, View Channel, Send Messages, Embed Links. Enable the Guild Voice States intent.

## Commands

| Command | Description |
|---------|-------------|
| `/play <query>` | Play a YouTube URL or search query |
| `/skip` | Skip current track |
| `/pause` / `/resume` | Pause / resume |
| `/stop` | Stop, clear queue, leave |
| `/queue` | Show queue |
| `/nowplaying` | Current track |
| `/leave` | Leave voice |
| `/ping` | Latency check |

Control commands require you to be in the same voice channel as the bot.

## Autoplay

When the queue is empty, the bot prefetches a similar track **while the current song plays**, then starts it when the track ends. Providers are built into the bot (no separate service).

```env
AUTO_SIMILAR=true
SIMILAR_PROVIDER=cursor   # cursor | openai | gemini | custom
CURSOR_API_KEY=...
```

Switch later with `SIMILAR_PROVIDER=openai` / `gemini` / `custom` and the matching API key. Manual `/play` always wins over autoplay.

## Scripts

- `pnpm dev` — hot reload
- `pnpm build` / `pnpm start` — production
- `pnpm deploy-commands` — register slash commands
