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

/** Secrets only. Public config lives in wrangler.jsonc. */
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

/**
 * Reads a var straight out of wrangler.jsonc. Matching the key directly avoids
 * having to strip JSONC comments, which JSON.parse would choke on.
 */
function wranglerVar(name: string): string | undefined {
  try {
    const source = readFileSync('wrangler.jsonc', 'utf8');
    return source.match(new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`))?.[1] || undefined;
  } catch {
    return undefined;
  }
}

const secrets = { ...loadDevVars(), ...process.env };

const clientId = process.env.DISCORD_CLIENT_ID || wranglerVar('DISCORD_CLIENT_ID');
const guildId = process.env.DISCORD_GUILD_ID || wranglerVar('DISCORD_GUILD_ID');
const botToken = secrets.DISCORD_BOT_TOKEN;

if (!clientId || !guildId) {
  console.error(
    'Missing DISCORD_CLIENT_ID or DISCORD_GUILD_ID.\n' +
      'Both live in the "vars" block of wrangler.jsonc. Run this from the project root.',
  );
  process.exit(1);
}

if (!botToken) {
  console.error(
    'Missing DISCORD_BOT_TOKEN.\n' +
      'Copy .dev.vars.example to .dev.vars and paste your bot token into it.\n' +
      '(.dev.vars is gitignored.)',
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
