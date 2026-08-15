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

/**
 * Requires a signed-in, approved member. A *pending* applicant is authenticated
 * but not a member, so this rejects them — every members-only route stays closed
 * to applicants by default. Routes an applicant legitimately needs (editing their
 * own profile, their account, /me, logout) use `requireUser` instead.
 */
export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  const viewer = c.get('viewer');
  if (!viewer) return c.json({ error: 'Authentication required' }, 401);
  if (viewer.pending) {
    return c.json({ error: 'Your application is awaiting approval.' }, 403);
  }
  await next();
});

/**
 * Requires any signed-in user, INCLUDING a pending applicant. Only for
 * self-service routes that then confirm the target is the caller themselves —
 * never for anything that reads or changes another member.
 */
export const requireUser = createMiddleware<AppContext>(async (c, next) => {
  if (!c.get('viewer')) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  await next();
});

/**
 * Requires God status — the recovery hatch, above every permission. Used for the
 * few actions too dangerous to hand out via a role (e.g. wiping and restoring the
 * whole database). A permission can't stand in here: God bypasses `can()`, so any
 * permission-gated route is also reachable by whoever holds that permission —
 * this is the only gate that stays God-exclusive.
 */
export const requireGod = createMiddleware<AppContext>(async (c, next) => {
  const viewer = c.get('viewer');
  if (!viewer) return c.json({ error: 'Authentication required' }, 401);
  if (!viewer.isGod) return c.json({ error: 'Forbidden' }, 403);
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
