/**
 * Registers slash commands with Discord.
 *
 * Run after adding or changing a command:   npm run discord:register
 *
 * Guild commands (what this uses) appear instantly. Global commands can take
 * up to an hour to propagate, which makes them painful to iterate on.
 *
 * Reads DISCORD_CLIENT_ID / DISCORD_GUILD_ID / DISCORD_BOT_TOKEN from the
 * environment, falling back to .dev.vars so local setup needs no extra steps.
 */

import { readFileSync } from 'node:fs';

const OptionType = { STRING: 3, INTEGER: 4, USER: 6 } as const;

const COMMANDS = [
  {
    name: 'whois',
    description: 'Look up a member’s rank, roles, and medals',
    options: [
      {
        name: 'member',
        description: 'The member to look up',
        type: OptionType.USER,
        required: true,
      },
    ],
  },
  {
    name: 'roster',
    description: 'Show the clan roster broken down by rank',
  },
  {
    name: 'promote',
    description: 'Promote a member one step up the rank ladder',
    options: [
      {
        name: 'member',
        description: 'The member to promote',
        type: OptionType.USER,
        required: true,
      },
    ],
  },
];

function loadDevVars(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
      if (match) out[match[1]!] = match[2]!.trim();
    }
    return out;
  } catch {
    return {};
  }
}

const vars = { ...loadDevVars(), ...process.env };

const clientId = vars.DISCORD_CLIENT_ID;
const guildId = vars.DISCORD_GUILD_ID;
const botToken = vars.DISCORD_BOT_TOKEN;

if (!clientId || !guildId || !botToken) {
  console.error(
    'Missing config. Set DISCORD_CLIENT_ID and DISCORD_GUILD_ID in wrangler.jsonc,\n' +
      'and DISCORD_BOT_TOKEN in .dev.vars (or the environment).',
  );
  process.exit(1);
}

const res = await fetch(
  `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`,
  {
    method: 'PUT', // wholesale replace — removes commands deleted from COMMANDS
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS),
  },
);

if (!res.ok) {
  console.error(`Registration failed (${res.status}):`, await res.text());
  process.exit(1);
}

const registered = (await res.json()) as { name: string }[];
console.log(`Registered ${registered.length} command(s): ${registered.map((c) => `/${c.name}`).join(', ')}`);
