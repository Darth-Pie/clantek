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
  {
    name: 'event',
    description: 'Show the next few upcoming events',
  },
  {
    name: 'tournament',
    description: 'Show the active and upcoming tournaments',
  },
  {
    name: 'medals',
    description: 'List a member’s medals',
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
    name: 'rank',
    description: 'Show a member’s current rank',
    options: [
      {
        name: 'member',
        description: 'The member to look up',
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

/** Turns Discord's terser error codes into something actionable. */
function explain(status: number, body: string): string {
  if (body.includes('50001')) {
    return [
      'The bot is not authorized in this server yet.',
      '',
      'Guild command registration needs the applications.commands scope in the',
      'target guild. Invite the bot first, then re-run this:',
      '',
      `  https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=268435456&scope=bot+applications.commands`,
    ].join('\n');
  }
  if (status === 401) {
    return 'Bot token rejected. Check DISCORD_BOT_TOKEN in .dev.vars — reset it in the\nDeveloper Portal (Bot tab) if you are unsure it is current.';
  }
  if (body.includes('50035')) {
    return 'Discord rejected a command definition. Check names are lowercase and\ndescriptions are non-empty and under 100 characters.';
  }
  return '';
}

const secrets = { ...loadDevVars(), ...process.env };

const clientId = process.env.DISCORD_CLIENT_ID || wranglerVar('DISCORD_CLIENT_ID');
const guildId = process.env.DISCORD_GUILD_ID || wranglerVar('DISCORD_GUILD_ID');
const botToken = secrets.DISCORD_BOT_TOKEN;

// Setting exitCode and returning lets Node drain stdio and exit cleanly.
// process.exit() here trips a libuv assertion on Windows mid-flush.
async function main(): Promise<number> {
  if (!clientId || !guildId) {
    console.error(
      'Missing DISCORD_CLIENT_ID or DISCORD_GUILD_ID.\n' +
        'Both live in the "vars" block of wrangler.jsonc. Run this from the project root.',
    );
    return 1;
  }

  if (!botToken) {
    console.error(
      'Missing DISCORD_BOT_TOKEN.\n' +
        'Copy .dev.vars.example to .dev.vars and paste your bot token into it.\n' +
        '(.dev.vars is gitignored.)',
    );
    return 1;
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
    const body = await res.text();
    console.error(`Registration failed (${res.status}): ${body}`);
    const hint = explain(res.status, body);
    if (hint) console.error(`\n${hint}`);
    return 1;
  }

  const registered = (await res.json()) as { name: string }[];
  console.log(
    `Registered ${registered.length} command(s): ${registered.map((c) => `/${c.name}`).join(', ')}`,
  );
  return 0;
}

process.exitCode = await main();
