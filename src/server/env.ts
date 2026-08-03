import type { Viewer } from '../shared/permissions';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // Bound only once R2 is enabled on the account — see wrangler.jsonc.
  MEDIA?: R2Bucket;

  // Public config, committed in wrangler.jsonc
  SITE_NAME: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID: string;
  DISCORD_PUBLIC_KEY: string;

  // Secrets: .dev.vars locally, `wrangler secret put` in production
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  SESSION_SECRET: string;
}

export interface Variables {
  viewer: Viewer | null;
}

export type AppContext = { Bindings: Env; Variables: Variables };
