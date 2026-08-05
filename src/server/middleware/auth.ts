import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import { SESSION_COOKIE, resolveViewer } from '../auth/session';
import { resolveApiToken } from '../auth/apiToken';
import { can, type Permission } from '../../shared/permissions';
import type { AppContext } from '../env';

export function db(env: { DB: D1Database }) {
  return drizzle(env.DB, { schema });
}

/**
 * Attaches the current Viewer (or null) to every request. Never rejects.
 * An `Authorization: Bearer <token>` header (the mobile/native app) is tried
 * first; otherwise the browser session cookie. `authKind` records which won, so
 * routes can, e.g., require a real web session for sensitive account actions.
 */
export const withViewer = createMiddleware<AppContext>(async (c, next) => {
  const auth = c.req.header('Authorization');
  if (auth && /^Bearer\s+/i.test(auth)) {
    const raw = auth.replace(/^Bearer\s+/i, '').trim();
    const viewer = await resolveApiToken(db(c.env), raw);
    c.set('viewer', viewer);
    c.set('authKind', viewer ? 'token' : null);
  } else {
    const viewer = await resolveViewer(db(c.env), getCookie(c, SESSION_COOKIE));
    c.set('viewer', viewer);
    c.set('authKind', viewer ? 'web' : null);
  }
  await next();
});

/**
 * Requires that the caller authenticated with a browser session, not an API
 * token — used to contain a leaked token: it can read/act per its permissions
 * but cannot manage credentials (mint or revoke tokens, etc.).
 */
export const requireWebSession = createMiddleware<AppContext>(async (c, next) => {
  if (!c.get('viewer')) return c.json({ error: 'Authentication required' }, 401);
  if (c.get('authKind') !== 'web') {
    return c.json({ error: 'This action requires signing in through the website.' }, 403);
  }
  await next();
});

/** Requires a signed-in member. */
export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  if (!c.get('viewer')) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  await next();
});

/**
 * Requires a specific permission. God bypasses this — see can() for why that
 * escape hatch exists.
 */
export function requirePermission(permission: Permission) {
  return createMiddleware<AppContext>(async (c, next) => {
    const viewer = c.get('viewer');
    if (!viewer) return c.json({ error: 'Authentication required' }, 401);
    if (!can(viewer, permission)) {
      return c.json({ error: 'Forbidden', missing: permission }, 403);
    }
    await next();
  });
}
