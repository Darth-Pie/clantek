import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import * as s from '../db/schema';
import type { AppContext, Env } from './env';
import { db, withViewer } from './middleware/auth';
import {
  authorizeUrl,
  newState,
  stateCookie,
  clearedStateCookie,
  exchangeCode,
  fetchUser,
  fetchGuildMember,
  OAUTH_STATE_COOKIE,
} from './auth/discord';
import {
  SESSION_COOKIE,
  createSession,
  invalidateSession,
  purgeExpiredSessions,
  sessionCookie,
  clearedSessionCookie,
} from './auth/session';
import {
  InteractionType,
  verifySignature,
  ephemeral,
  defer,
  editOriginalResponse,
  InteractionResponseType,
  type Interaction,
} from './discord/interactions';
import { handleCommand } from './discord/commands';
import { DiscordRest } from './discord/rest';
import { syncMemberRankRoles, reconcileBatch } from './discord/sync';
import { awardTenureMedals } from './medals/tenure';
import ranks from './routes/ranks';
import members from './routes/members';
import settings from './routes/settings';
import rolesRoutes from './routes/roles';
import medalsRoutes from './routes/medals';
import mediaRoutes, { serveMediaObject } from './routes/media';
import newsRoutes from './routes/news';
import usageRoutes from './routes/usage';
import gamesRoutes from './routes/games';
import warRecordsRoutes from './routes/warrecords';
import eventsRoutes from './routes/events';
import auditRoutes from './routes/audit';

const app = new Hono<AppContext>();

/* ------------------------------------------------------------------ *
 * Discord interactions — must be registered BEFORE withViewer, because
 * it authenticates by Ed25519 signature, not by session cookie, and the
 * raw body has to stay unparsed until the signature is checked.
 * ------------------------------------------------------------------ */

app.post('/api/discord/interactions', async (c) => {
  const raw = await c.req.text();

  const valid = await verifySignature(
    raw,
    c.req.header('x-signature-ed25519') ?? null,
    c.req.header('x-signature-timestamp') ?? null,
    c.env.DISCORD_PUBLIC_KEY,
  );
  // Discord probes with bad signatures on purpose when you save the endpoint
  // URL; 401 here is what proves the endpoint is genuine.
  if (!valid) return c.text('Invalid request signature', 401);

  const interaction = JSON.parse(raw) as Interaction;

  if (interaction.type === InteractionType.PING) {
    return c.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    // Acknowledge inside Discord's 3-second window, then run the command in the
    // background and edit the placeholder with the result. A cold start plus a
    // handful of D1 round-trips can otherwise miss the deadline, which Discord
    // reports to the user as "didn't respond in time".
    const baseUrl = new URL(c.req.url).origin;
    c.executionCtx.waitUntil(
      (async () => {
        let content: string;
        try {
          const result = await handleCommand(c.env, interaction, baseUrl);
          content = result.data.content;
        } catch (err) {
          console.error('Slash command failed', err);
          content = `Something broke: ${(err as Error).message}`;
        }
        await editOriginalResponse(interaction.application_id, interaction.token, content);
      })(),
    );

    return c.json(defer(true));
  }

  return c.json(ephemeral('Unsupported interaction type.'));
});

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

// API responses must never be cached by the browser or an intermediary.
// A cached /api/auth/login redirect (or a stale 404 from an earlier deploy)
// otherwise means the sign-in click is answered from cache and never reaches
// the Worker at all — which looks exactly like a broken login.
app.use('/api/*', async (c, next) => {
  await next();
  // Re-wrap so the header sticks regardless of who built the response: a
  // mounted sub-router (e.g. /api/ranks) hands back a response with immutable
  // headers, so a direct .set() there silently no-ops. A fresh Response copies
  // the status, body, and existing headers into a mutable set.
  c.res = new Response(c.res.body, c.res);
  c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
});

app.use('/api/*', withViewer);

app.get('/api/auth/login', (c) => {
  const state = newState();
  const redirectUri = new URL('/api/auth/callback', c.req.url).toString();
  c.header('Set-Cookie', stateCookie(state));
  return c.redirect(authorizeUrl(c.env.DISCORD_CLIENT_ID, redirectUri, state));
});

app.get('/api/auth/callback', async (c) => {
  // Discord signals its own failures (consent_required, access_denied, an
  // unregistered redirect_uri, …) with an `error` query param and no code.
  // Surface it verbatim instead of mislabelling everything as a state error.
  const discordError = c.req.query('error');
  if (discordError) {
    console.error('Discord OAuth error:', discordError, c.req.query('error_description'));
    return c.redirect(`/login?error=discord&detail=${encodeURIComponent(discordError)}`);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');
  const expected = getCookie(c, OAUTH_STATE_COOKIE);

  if (!code || !state || !expected || state !== expected) {
    return c.redirect('/login?error=state');
  }

  const redirectUri = new URL('/api/auth/callback', c.req.url).toString();
  const token = await exchangeCode(
    c.env.DISCORD_CLIENT_ID,
    c.env.DISCORD_CLIENT_SECRET,
    code,
    redirectUri,
  );

  const discordUser = await fetchUser(token.access_token);

  // Membership in the clan's Discord server is the gate. No invite, no account.
  const guildMember = await fetchGuildMember(token.access_token, c.env.DISCORD_GUILD_ID);
  if (!guildMember) {
    c.header('Set-Cookie', clearedStateCookie);
    return c.redirect('/login?error=not_in_guild');
  }

  // Discord's guild-join date is the authoritative basis for tenure medals.
  const guildJoinedAt = guildMember.joined_at
    ? Math.floor(Date.parse(guildMember.joined_at) / 1000)
    : null;
  const validGuildJoinedAt =
    guildJoinedAt != null && !Number.isNaN(guildJoinedAt) ? guildJoinedAt : null;

  const database = db(c.env);
  const existing = await database.query.users.findFirst({
    where: eq(s.users.discordId, discordUser.id),
  });

  if (existing?.status === 'banned') {
    c.header('Set-Cookie', clearedStateCookie);
    return c.redirect('/login?error=banned');
  }

  let userId: number;
  if (existing) {
    await database
      .update(s.users)
      .set({
        username: discordUser.username,
        globalName: discordUser.global_name,
        avatar: discordUser.avatar,
        email: discordUser.email ?? existing.email,
        // Only set once — the guild-join date doesn't change, and a re-join
        // shouldn't reset accrued tenure.
        guildJoinedAt: existing.guildJoinedAt ?? validGuildJoinedAt,
        lastSeenAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(s.users.id, existing.id));
    userId = existing.id;
  } else {
    const defaultRank = await database.query.ranks.findFirst({
      where: eq(s.ranks.isDefault, true),
    });
    const inserted = await database
      .insert(s.users)
      .values({
        discordId: discordUser.id,
        username: discordUser.username,
        globalName: discordUser.global_name,
        avatar: discordUser.avatar,
        email: discordUser.email ?? null,
        rankId: defaultRank?.id ?? null,
        guildJoinedAt: validGuildJoinedAt,
        lastSeenAt: Math.floor(Date.now() / 1000),
      })
      .returning({ id: s.users.id });
    const created = inserted[0];
    if (!created) throw new Error('Failed to create member record');
    userId = created.id;

    await database.insert(s.auditLog).values({
      action: 'member.join',
      targetType: 'user',
      targetId: String(userId),
      meta: { discordId: discordUser.id, username: discordUser.username },
      source: 'system',
    });

    // Apply the default rank's roles to the new member. Done in the background
    // so the Discord round-trips don't hold up the login redirect.
    if (defaultRank) {
      const client =
        c.env.DISCORD_BOT_TOKEN && c.env.DISCORD_GUILD_ID
          ? new DiscordRest(c.env.DISCORD_BOT_TOKEN, c.env.DISCORD_GUILD_ID)
          : null;
      c.executionCtx.waitUntil(
        syncMemberRankRoles(database, client, {
          userId,
          rankId: defaultRank.id,
          actorId: null,
        }),
      );
    }
  }

  const { token: sessionToken, expiresAt } = await createSession(database, userId, {
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('cf-connecting-ip'),
  });

  c.executionCtx.waitUntil(purgeExpiredSessions(database));

  // Hand out any tenure medals this member has earned, so they show up the
  // moment they log in rather than on the next cron sweep. DB-only, so it's
  // safe to fire and forget.
  c.executionCtx.waitUntil(
    awardTenureMedals(database, { userId }).catch((err) =>
      console.error('Tenure award on login failed', err),
    ),
  );

  c.header('Set-Cookie', clearedStateCookie);
  c.header('Set-Cookie', sessionCookie(sessionToken, expiresAt - Math.floor(Date.now() / 1000)), {
    append: true,
  });
  return c.redirect('/');
});

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await invalidateSession(db(c.env), token);
  c.header('Set-Cookie', clearedSessionCookie);
  return c.json({ ok: true });
});

/** What the React app calls on boot to learn who it is talking to. */
app.get('/api/me', (c) => {
  return c.json({ viewer: c.get('viewer'), siteName: c.env.SITE_NAME });
});

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

app.route('/api/ranks', ranks);
app.route('/api/members', members);
app.route('/api/settings', settings);
app.route('/api/roles', rolesRoutes);
app.route('/api/medals', medalsRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/news', newsRoutes);
app.route('/api/usage', usageRoutes);
app.route('/api/games', gamesRoutes);
app.route('/api/warrecords', warRecordsRoutes);
app.route('/api/events', eventsRoutes);
app.route('/api/audit', auditRoutes);

app.get('/api/health', (c) => c.json({ ok: true, service: 'clantek' }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'Internal error' }, 500);
});

/* ------------------------------------------------------------------ *
 * Fallthrough
 *
 * Requests reach the Worker before the asset handler, so Hono's default
 * 404 would answer client-side routes like /admin/ranks and the SPA would
 * never load on refresh or deep link. Unmatched non-API paths are handed
 * to ASSETS, which wrangler.jsonc configures with
 * not_found_handling: "single-page-application".
 * ------------------------------------------------------------------ */

// Keep unmatched API routes answering JSON rather than serving index.html.
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Uploaded images (medal art, …) live in R2 and are served here — deliberately
// outside /api so the no-store middleware doesn't apply and they cache hard.
// wrangler.jsonc puts /media/* in run_worker_first so these reach the Worker.
app.get('/media/*', async (c) => {
  const res = await serveMediaObject(c.env, c.req.raw, c.executionCtx);
  return res ?? c.json({ error: 'Not found' }, 404);
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

/* ------------------------------------------------------------------ *
 * Scheduled work — two cadences, set in wrangler.jsonc (triggers.crons):
 *
 *  - every 5 min  → a bounded batch of the Discord reconcile sweep, so its
 *                   cost stays flat as the roster grows (see reconcileBatch).
 *  - hourly       → the tenure-medal sweep. Tenure only changes on a daily
 *                   boundary, so a per-hour scan is plenty; new members still
 *                   get their tenure medals instantly at login.
 * ------------------------------------------------------------------ */

const TENURE_CRON = '7 * * * *';

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const database = db(env);

    if (controller.cron === TENURE_CRON) {
      // DB-only — runs regardless of whether the bot is configured.
      ctx.waitUntil(
        awardTenureMedals(database)
          .then((r) => console.log('Hourly tenure award:', r.awarded.length, 'granted'))
          .catch((err) => console.error('Tenure award failed', err)),
      );
      return;
    }

    // The 5-minute reconcile tick needs the bot.
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return;
    const rest = new DiscordRest(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);
    ctx.waitUntil(
      reconcileBatch(database, rest)
        .then((r) => console.log('Reconcile batch:', JSON.stringify(r)))
        .catch((err) => console.error('Reconcile batch failed', err)),
    );
  },
} satisfies ExportedHandler<Env>;
