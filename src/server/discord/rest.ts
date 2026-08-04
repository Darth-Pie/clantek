/**
 * Bot-token calls against the Discord REST API.
 *
 * Two gotchas that will otherwise cost you an afternoon:
 *
 *  1. The bot needs the MANAGE_ROLES permission, and
 *  2. the bot's own role must sit ABOVE every role it manages in the guild's
 *     role list. Discord refuses (50013 Missing Permissions) otherwise, even
 *     for an administrator bot. Drag the bot's role to the top in
 *     Server Settings → Roles.
 */

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export interface GuildMember {
  roles: string[];
  /** When they joined the guild, unix seconds — or null if Discord omitted it. */
  joinedAt: number | null;
}

export interface TextChannel {
  id: string;
  name: string;
  position: number;
}

/** A minimal Discord embed — the shape createMessage accepts. */
export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  thumbnail?: { url: string };
  author?: { name: string; icon_url?: string };
  footer?: { text: string };
}

export class DiscordRest {
  constructor(
    private readonly botToken: string,
    private readonly guildId: string,
  ) {}

  private async call(path: string, init: RequestInit = {}, reason?: string): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bot ${this.botToken}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    // Shows up in the Discord server's own audit log — worth always sending.
    if (reason) headers['X-Audit-Log-Reason'] = reason.slice(0, 512);

    const res = await fetch(`${DISCORD_API}${path}`, { ...init, headers });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '1');
      throw new RateLimited(retryAfter);
    }
    return res;
  }

  async listRoles(): Promise<DiscordRole[]> {
    const res = await this.call(`/guilds/${this.guildId}/roles`);
    if (!res.ok) throw new DiscordError('listRoles', res.status, await res.text());
    return res.json();
  }

  /**
   * The full guild member: their roles and guild-join date. Returns null when
   * they're no longer in the server (404).
   */
  async getMember(discordUserId: string): Promise<GuildMember | null> {
    const res = await this.call(`/guilds/${this.guildId}/members/${discordUserId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new DiscordError('getMember', res.status, await res.text());
    const body = (await res.json()) as { roles: string[]; joined_at?: string };
    const parsed = body.joined_at ? Math.floor(Date.parse(body.joined_at) / 1000) : NaN;
    return { roles: body.roles, joinedAt: Number.isNaN(parsed) ? null : parsed };
  }

  async getMemberRoles(discordUserId: string): Promise<string[] | null> {
    const member = await this.getMember(discordUserId);
    return member ? member.roles : null;
  }

  async addRole(discordUserId: string, roleId: string, reason?: string): Promise<void> {
    const res = await this.call(
      `/guilds/${this.guildId}/members/${discordUserId}/roles/${roleId}`,
      { method: 'PUT' },
      reason,
    );
    if (!res.ok && res.status !== 204) {
      throw new DiscordError('addRole', res.status, await res.text());
    }
  }

  async removeRole(discordUserId: string, roleId: string, reason?: string): Promise<void> {
    const res = await this.call(
      `/guilds/${this.guildId}/members/${discordUserId}/roles/${roleId}`,
      { method: 'DELETE' },
      reason,
    );
    if (!res.ok && res.status !== 204) {
      throw new DiscordError('removeRole', res.status, await res.text());
    }
  }

  /**
   * Updates a guild role's name and/or colour in a single request. Colour is a
   * 24-bit integer (0 = no colour). Discord caps names at 100 characters. Same
   * hierarchy rule as membership changes: the bot's role must sit above the
   * target, or this returns 50013.
   */
  async updateRole(
    roleId: string,
    fields: { name?: string; color?: number },
    reason?: string,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (fields.name !== undefined) body.name = fields.name.slice(0, 100);
    if (fields.color !== undefined) body.color = fields.color;

    const res = await this.call(
      `/guilds/${this.guildId}/roles/${roleId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      reason,
    );
    if (!res.ok) {
      throw new DiscordError('updateRole', res.status, await res.text());
    }
  }

  /**
   * Sets a guild member's nickname — their per-server display name. Pass an
   * empty string to clear it (reverting to their Discord name). Needs the bot's
   * MANAGE_NICKNAMES permission and its role above the member's. Discord will
   * not let anyone change the guild owner's nickname, permissions aside.
   */
  async setNickname(discordUserId: string, nick: string, reason?: string): Promise<void> {
    const res = await this.call(
      `/guilds/${this.guildId}/members/${discordUserId}`,
      { method: 'PATCH', body: JSON.stringify({ nick: nick.slice(0, 32) || null }) },
      reason,
    );
    if (!res.ok) {
      throw new DiscordError('setNickname', res.status, await res.text());
    }
  }

  /** Text and announcement channels in the guild, for the announcement-channel picker. */
  async listTextChannels(): Promise<TextChannel[]> {
    const res = await this.call(`/guilds/${this.guildId}/channels`);
    if (!res.ok) throw new DiscordError('listChannels', res.status, await res.text());
    const channels = (await res.json()) as { id: string; name: string; type: number; position: number }[];
    // 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT — the ones the bot can post plain messages to.
    return channels
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => ({ id: c.id, name: c.name, position: c.position }))
      .sort((a, b) => a.position - b.position);
  }

  /**
   * Post a message (optionally with embeds) to a channel. Needs the bot's
   * VIEW_CHANNEL + SEND_MESSAGES permission in that channel.
   */
  async createMessage(
    channelId: string,
    payload: { content?: string; embeds?: Embed[]; allowed_mentions?: { users?: string[]; parse?: string[] } },
  ): Promise<void> {
    const res = await this.call(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new DiscordError('createMessage', res.status, await res.text());
  }

  /** Used by slash commands to reply after an initial deferred response. */
  async followUp(applicationId: string, interactionToken: string, content: unknown): Promise<void> {
    await fetch(`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    });
  }
}

export class DiscordError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`Discord ${operation} failed (${status}): ${body}`);
    this.name = 'DiscordError';
  }
}

export class RateLimited extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Rate limited by Discord; retry after ${retryAfterSeconds}s`);
    this.name = 'RateLimited';
  }
}
