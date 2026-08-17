/**
 * The bot's slash-command definitions — the single source of truth.
 *
 * Both the CLI (`npm run discord:register`, scripts/register-commands.ts) and the
 * in-app first-run wizard register from this same list, so a button-deploy buyer
 * who never touches a terminal still ends up with a working set of commands.
 *
 * Guild commands (what we register) appear in the server instantly; global
 * commands can take up to an hour to propagate, which makes them painful to
 * iterate on — so everything here is registered per-guild.
 */

const OptionType = { STRING: 3, INTEGER: 4, USER: 6 } as const;

/** A member-lookup option shared by the several "look up this member" commands. */
const memberOption = (description: string) => ({
  name: 'member',
  description,
  type: OptionType.USER,
  required: true,
});

export interface CommandDefinition {
  name: string;
  description: string;
  options?: { name: string; description: string; type: number; required?: boolean }[];
}

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  { name: 'whois', description: 'Look up a member’s rank, roles, and medals', options: [memberOption('The member to look up')] },
  { name: 'roster', description: 'Show the clan roster broken down by rank' },
  { name: 'promote', description: 'Promote a member one step up the rank ladder', options: [memberOption('The member to promote')] },
  { name: 'event', description: 'Show the next few upcoming events' },
  { name: 'tournament', description: 'Show the active and upcoming tournaments' },
  { name: 'medals', description: 'List a member’s medals', options: [memberOption('The member to look up')] },
  { name: 'rank', description: 'Show a member’s current rank', options: [memberOption('The member to look up')] },
];

/** Structured outcome so both the CLI and the wizard can report/handle it. */
export type RegisterResult =
  | { ok: true; count: number; names: string[] }
  | { ok: false; status?: number; error: string };

/**
 * Wholesale-replace this app's guild commands with COMMAND_DEFINITIONS (a PUT, so
 * commands removed from the list are removed in Discord too). Never throws —
 * returns a structured result the caller can surface. `fetch` is available in
 * both the Worker runtime and Node 18+, so this runs unchanged in either.
 */
export async function registerGuildCommands(
  clientId: string,
  guildId: string,
  botToken: string,
): Promise<RegisterResult> {
  if (!clientId || !guildId) return { ok: false, error: 'Missing Discord Client ID or Server (Guild) ID.' };
  if (!botToken) return { ok: false, error: 'Missing Discord bot token.' };

  let res: Response;
  try {
    res = await fetch(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`, {
      method: 'PUT', // wholesale replace — drops commands deleted from the list
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(COMMAND_DEFINITIONS),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach Discord: ${(e as Error).message}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: explain(res.status, body) };
  }

  const registered = (await res.json().catch(() => [])) as { name: string }[];
  return { ok: true, count: registered.length, names: registered.map((r) => r.name) };
}

/** Turn Discord's terser error codes into something a non-developer can act on. */
export function explain(status: number, body: string): string {
  if (body.includes('50001')) {
    return 'The bot isn’t in this server with the applications.commands scope yet. Use the “Invite the bot” link (it already asks for the right scope), pick your server, then try again.';
  }
  if (status === 401) {
    return 'Discord rejected the bot token. Reset it in the Developer Portal (Bot tab) and paste the new one.';
  }
  if (body.includes('50035')) {
    return 'Discord rejected a command definition (a name or description was invalid).';
  }
  return `Registration failed (HTTP ${status})${body ? `: ${body.slice(0, 200)}` : ''}.`;
}
