import type { Viewer } from '../shared/permissions';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // Bound only once R2 is enabled on the account — see wrangler.jsonc.
  MEDIA?: R2Bucket;

  // Public config, committed in wrangler.jsonc
  SITE_NAME: string;
  // Canonical public origin (e.g. https://clantek.919gaming.com), for building
  // absolute media URLs in Discord embeds. Optional — absent → images omitted.
  SITE_URL?: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID: string;
  DISCORD_PUBLIC_KEY: string;

  // Secrets: .dev.vars locally, `wrangler secret put` in production
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  SESSION_SECRET: string;

  // Optional. Enables the live usage dashboard's request/query-rate gauges by
  // reading Cloudflare's GraphQL Analytics API. The account id is not secret
  // (it's a var); the token is a read-only "Account Analytics: Read" secret set
  // via `wrangler secret put CLOUDFLARE_API_TOKEN`. Absent → storage gauges only.
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

export interface Variables {
  viewer: Viewer | null;
  /** How the viewer authenticated: a browser session cookie, or a bearer API token. */
  authKind: 'web' | 'token' | null;
}

export type AppContext = { Bindings: Env; Variables: Variables };
