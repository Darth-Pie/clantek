import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import { SESSION_COOKIE, resolveViewer } from '../auth/session';
import { can, type Permission } from '../../shared/permissions';
import type { AppContext } from '../env';

export function db(env: { DB: D1Database }) {
  return drizzle(env.DB, { schema });
}

/** Attaches the current Viewer (or null) to every request. Never rejects. */
export const withViewer = createMiddleware<AppContext>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  c.set('viewer', await resolveViewer(db(c.env), token));
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
