# ClanTek

Clan management for gaming communities — rosters, ranks, medals, match records,
and news, with Discord as both the login and the control surface.

A ground-up rewrite of the original 2003 PHP/MySQL ClanTek. No MySQL server, no
license checks, no HTML pasted into a textarea.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| Files | Cloudflare R2 |
| API | Hono |
| Admin UI | React 19 + Vite |
| Identity | Discord OAuth2 — no passwords |

Runs within Cloudflare's free tier for a clan-sized site.

## How ranks and roles differ

The original gated every action on `member.rank >= auth.<action>` — one linear
ladder, so "trusted member who isn't an officer" was impossible to express.
Those are two concepts here:

- **Rank** — ladder position (Recruit → General). One per member, ordered,
  fully admin-defined. Add, rename, reorder, and delete at will.
- **Role** — a bundle of permissions, optionally mirrored to a Discord role.
  Many per member. Granting one here can grant the Discord role too, which is
  how website roles end up gating Discord channels.

**God status** (`users.is_god`) bypasses every permission check. It is seeded
directly in `src/db/seed.sql` and is deliberately not assignable through the
UI — it's the recovery hatch that prevents anyone from locking themselves out.

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the Discord application

At <https://discord.com/developers/applications> → **New Application**.

- **OAuth2** → add redirect URI `http://localhost:8787/api/auth/callback` for
  local dev, and `https://mustr.gg/api/auth/callback` for production.
- **Bot** → add a bot, copy the token.
- **General Information** → copy the Public Key.

Invite the bot to your server with the `bot` and `applications.commands` scopes
and the **Manage Roles** permission.

> **The one that bites everyone:** in Server Settings → Roles, drag the bot's
> role **above** every role it needs to manage. Discord returns `50013 Missing
> Permissions` otherwise, even for an administrator bot.

### 3. Create the Cloudflare resources

```bash
npx wrangler d1 create clantek
```

Copy the printed `database_id` into `wrangler.jsonc`, then:

```bash
npx wrangler r2 bucket create clantek-media
```

### 4. Configure

```bash
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars` (gitignored). `DISCORD_CLIENT_ID` and `DISCORD_PUBLIC_KEY`
are public values and already live in the `vars` block of `wrangler.jsonc`; set
`DISCORD_GUILD_ID` there too (Developer Mode on → right-click your server → Copy
Server ID).

Generate a session secret with:

```bash
openssl rand -base64 32
```

### 5. Initialize the database

```bash
npm run db:generate
npm run db:migrate:local
npm run db:seed:local
```

The seed creates ten ranks, five roles, default theme tokens, and the founder
account. Edit the Discord ID in `src/db/seed.sql` before seeding if you are not
the original owner.

### 6. Register slash commands

```bash
npm run discord:register
```

### 7. Run

```bash
npm run dev
```

Vite serves the UI on `:5173` and proxies `/api` to `wrangler dev` on `:8787`.

## Deploying

```bash
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put SESSION_SECRET
npm run db:migrate:remote
npm run db:seed:remote
npm run deploy
```

Then set the **Interactions Endpoint URL** on your Discord application to
`https://mustr.gg/api/discord/interactions`. Discord probes it
with a deliberately invalid signature on save — rejecting that is what proves
the endpoint is genuine.

For CI deploys, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as
repository secrets; `.github/workflows/deploy.yml` handles the rest.

## Discord commands

| Command | Requires |
|---|---|
| `/roster` | any member |
| `/whois <member>` | any member |
| `/promote <member>` | `roster.promote`, and you must outrank the target |

Commands run the same permission checks as the web portal — one identity, one
permission model, two surfaces.

### A limitation worth knowing up front

Workers serve Discord over **HTTP interactions**, not a gateway WebSocket. That
covers slash commands and button clicks, but Workers cannot passively observe
Discord events (someone joining, or a role changed by hand in Discord's UI).
`reconcileMember()` in `src/server/discord/sync.ts` pulls Discord back into line
on demand or on a cron, which covers most of the gap without a second host.

## Layout

```
src/
  db/schema.ts          Drizzle schema — the whole data model
  db/seed.sql           Ranks, roles, permissions, founder account, theme
  shared/permissions.ts Permission vocabulary + can() / outranks()
  server/
    index.ts            Worker entry, OAuth, interactions endpoint
    auth/               Discord OAuth2 and session handling
    discord/            REST client, slash commands, role sync
    routes/             API routers
  client/               React admin (Vite)
scripts/
  register-commands.ts  Pushes slash commands to Discord
```

## About the 2003 original

The original PHP source is archived separately, outside this repo, at
`E:\Google Drive\Work\Development\ClanTek Unlocked`. It is deliberately not
copied here: `dump.php` contains live MySQL credentials and `ctbd.php` contains
a hardcoded password, and neither should gain a second copy on disk. If you do
pull it in for reference, `.gitignore` already blocks it.

What carried forward: the rank ladder with time and win requirements, medals
awarded per game, match records, and the audit log. What did not: the
`license_check` phone-home, Zend Encoder obfuscation, and the `templates` /
`header` tables of `<font>` attributes and IE scrollbar colors — those are CSS
custom properties now, edited with a live preview.

## License

MIT
