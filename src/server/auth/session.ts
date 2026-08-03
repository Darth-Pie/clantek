import { eq, lt } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as s from '../../db/schema';
import type { Permission, Viewer } from '../../shared/permissions';

export const SESSION_COOKIE = 'ct_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

type DB = DrizzleD1Database<typeof s>;

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * The cookie carries the raw token; the database stores only its SHA-256.
 * A leaked database dump therefore cannot be replayed as a live session.
 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return base64url(new Uint8Array(digest));
}

export async function createSession(
  db: DB,
  userId: number,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: number }> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = base64url(raw);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await db.insert(s.sessions).values({
    id: await hashToken(token),
    userId,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });

  return { token, expiresAt };
}

/**
 * Resolves a session token to a Viewer, collapsing the user's rank and the
 * union of every permission across all their roles into one object.
 */
export async function resolveViewer(db: DB, token: string | undefined): Promise<Viewer | null> {
  if (!token) return null;

  const id = await hashToken(token);
  const session = await db.query.sessions.findFirst({ where: eq(s.sessions.id, id) });
  if (!session) return null;

  if (session.expiresAt < Math.floor(Date.now() / 1000)) {
    await db.delete(s.sessions).where(eq(s.sessions.id, id));
    return null;
  }

  const user = await db.query.users.findFirst({ where: eq(s.users.id, session.userId) });
  if (!user || user.status === 'banned') return null;

  const rank = user.rankId
    ? ((await db.query.ranks.findFirst({ where: eq(s.ranks.id, user.rankId) })) ?? null)
    : null;

  const grants = await db
    .select({
      roleId: s.roles.id,
      roleName: s.roles.name,
      roleColor: s.roles.color,
      permission: s.rolePermissions.permission,
    })
    .from(s.userRoles)
    .innerJoin(s.roles, eq(s.userRoles.roleId, s.roles.id))
    .leftJoin(s.rolePermissions, eq(s.rolePermissions.roleId, s.roles.id))
    .where(eq(s.userRoles.userId, user.id));

  const roles = new Map<number, { id: number; name: string; color: string | null }>();
  const permissions = new Set<Permission>();
  for (const g of grants) {
    roles.set(g.roleId, { id: g.roleId, name: g.roleName, color: g.roleColor });
    if (g.permission) permissions.add(g.permission as Permission);
  }

  return {
    id: user.id,
    discordId: user.discordId,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    isGod: user.isGod,
    rank: rank ? { id: rank.id, name: rank.name, sortOrder: rank.sortOrder } : null,
    roles: [...roles.values()],
    permissions: [...permissions],
  };
}

export async function invalidateSession(db: DB, token: string): Promise<void> {
  await db.delete(s.sessions).where(eq(s.sessions.id, await hashToken(token)));
}

/** Called opportunistically via ctx.waitUntil — no need to block a request on it. */
export async function purgeExpiredSessions(db: DB): Promise<void> {
  await db.delete(s.sessions).where(lt(s.sessions.expiresAt, Math.floor(Date.now() / 1000)));
}

export function sessionCookie(token: string, maxAge: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

export const clearedSessionCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
