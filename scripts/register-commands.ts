/**
 * Registers slash commands with Discord from the command line.
 *
 * Run after adding or changing a command:   npm run discord:register
 *
 * The command definitions and the actual PUT to Discord live in
 * src/server/discord/commandDefs.ts — the SAME module the in-app first-run wizard
 * uses — so a buyer who deploys via the button and never opens a terminal still
 * gets their commands registered. This script is just the local/CLI wrapper that
 * reads credentials from the environment / .dev.vars / wrangler.jsonc.
 */

import { readFileSync } from 'node:fs';
import { registerGuildCommands } from '../src/server/discord/commandDefs';

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
const clientId = process.env.DISCORD_CLIENT_ID || wranglerVar('DISCORD_CLIENT_ID') || '';
const guildId = process.env.DISCORD_GUILD_ID || wranglerVar('DISCORD_GUILD_ID') || '';
const botToken = secrets.DISCORD_BOT_TOKEN || '';

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

  const result = await registerGuildCommands(clientId, guildId, botToken);
  if (!result.ok) {
    console.error(result.error);
    return 1;
  }
  console.log(`Registered ${result.count} command(s): ${result.names.map((n) => `/${n}`).join(', ')}`);
  return 0;
}

process.exitCode = await main();
