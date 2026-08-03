import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import * as s from '../db/schema';
import type { AppContext } from './env';
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
  InteractionResponseType,
  type Interaction,
} from './discord/interactions';
import { handleCommand } from './discord/commands';
import ranks from './routes/ranks';
import members from './routes/members';
import settings from './routes/settings';

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
    try {
      return c.json(await handleCommand(c.env, interaction));
    } catch (err) {
      console.error('Slash command failed', err);
      return c.json(ephemeral(`Something broke: ${(err as Error).message}`));
    }
  }

  return c.json(ephemeral('Unsupported interaction type.'));
});

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

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
  }

  const { token: sessionToken, expiresAt } = await createSession(database, userId, {
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('cf-connecting-ip'),
  });

  c.executionCtx.waitUntil(purgeExpiredSessions(database));

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

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
