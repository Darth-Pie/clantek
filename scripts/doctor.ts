/**
 * Checks the Discord side of a ClanTek install and says what is wrong.
 *
 *   npm run doctor
 *
 * Runs entirely against your local .dev.vars — the bot token is never printed
 * and never leaves your machine.
 */

import { readFileSync } from 'node:fs';

const API = 'https://discord.com/api/v10';

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

const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => console.log(`  FAIL  ${m}`);
const note = (m: string) => console.log(`        ${m}`);

async function call(path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bot ${botToken}` } });
  return { res, body: await res.text() };
}

async function main(): Promise<number> {
  let failed = 0;

  console.log('\nConfiguration');
  if (clientId) ok(`application id ${clientId}`);
  else {
    bad('DISCORD_CLIENT_ID missing from wrangler.jsonc');
    failed++;
  }
  if (guildId) ok(`target guild   ${guildId}`);
  else {
    bad('DISCORD_GUILD_ID missing from wrangler.jsonc');
    failed++;
  }
  if (botToken) ok('bot token present in .dev.vars');
  else {
    bad('DISCORD_BOT_TOKEN missing from .dev.vars');
    return 1;
  }
  if (!clientId || !guildId) return 1;

  console.log('\nBot identity');
  const me = await call('/users/@me');
  if (!me.res.ok) {
    bad(`token rejected (${me.res.status}) — reset it on the Bot tab and update .dev.vars`);
    return 1;
  }
  const bot = JSON.parse(me.body) as { id: string; username: string };
  ok(`authenticated as ${bot.username} (${bot.id})`);
  if (bot.id !== clientId) {
    bad(`this token belongs to application ${bot.id}, but wrangler.jsonc says ${clientId}`);
    note('The bot token and the client id are from different Discord applications.');
    failed++;
  }

  console.log('\nGuild membership');
  const guilds = await call('/users/@me/guilds');
  if (!guilds.res.ok) {
    bad(`could not list guilds (${guilds.res.status}): ${guilds.body}`);
    return 1;
  }
  const list = JSON.parse(guilds.body) as { id: string; name: string }[];

  if (list.length === 0) {
    bad('the bot is not in ANY server');
    note('The invite was never completed. Open the URL below, pick your server,');
    note('and make sure you click through to the end:');
    note('');
    note(`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=268435456&scope=bot+applications.commands`);
    return 1;
  }

  console.log(`        bot is in ${list.length} server(s):`);
  for (const g of list) {
    console.log(`          ${g.id}  ${g.name}${g.id === guildId ? '   <-- target' : ''}`);
  }

  if (!list.some((g) => g.id === guildId)) {
    bad(`the bot is NOT in the configured guild ${guildId}`);
    note('Either it was invited to a different server, or DISCORD_GUILD_ID is wrong.');
    note('If one of the servers listed above is the right one, update');
    note('DISCORD_GUILD_ID in wrangler.jsonc to match and redeploy.');
    return 1;
  }
  ok('bot is in the configured guild');

  console.log('\nRole hierarchy');
  const roles = await call(`/guilds/${guildId}/roles`);
  const member = await call(`/guilds/${guildId}/members/${bot.id}`);
  if (!roles.res.ok || !member.res.ok) {
    bad('could not read roles — the bot may lack View Server permissions');
    return 1;
  }
  const all = JSON.parse(roles.body) as { id: string; name: string; position: number }[];
  const held = (JSON.parse(member.body) as { roles: string[] }).roles;

  const botTop = Math.max(...all.filter((r) => held.includes(r.id)).map((r) => r.position), 0);
  const above = all.filter((r) => r.position > botTop && r.name !== '@everyone');

  ok(`bot's highest role sits at position ${botTop}`);
  if (above.length) {
    bad(`${above.length} role(s) sit ABOVE the bot and cannot be managed:`);
    for (const r of above) note(`  ${r.name} (position ${r.position})`);
    note('');
    note('Server Settings -> Roles, drag the bot role above these.');
    note('Discord returns 50013 otherwise, even for an administrator bot.');
    failed++;
  } else {
    ok('bot outranks every other role');
  }

  console.log(
    failed === 0 ? '\nAll checks passed.\n' : `\n${failed} problem(s) found — see above.\n`,
  );
  return failed === 0 ? 0 : 1;
}

process.exitCode = await main();
