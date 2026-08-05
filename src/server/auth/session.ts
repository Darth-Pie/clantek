import { eq, lt } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as s from '../../db/schema';
import type { Permission, Viewer } from '../../shared/permissions';
import { randomToken, sha256Base64url } from './crypto';

export const SESSION_COOKIE = 'ct_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

type DB = DrizzleD1Database<typeof s>;

export async function createSession(
  db: DB,
  userId: number,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await db.insert(s.sessions).values({
    id: await sha256Base64url(token),
    userId,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });

  return { token, expiresAt };
}

/**
 * Build the Viewer for a user id — their rank plus the union of every permission
 * across all their roles. Shared by session and API-token auth so both credential
 * kinds resolve to exactly the same identity and permission set. Returns null for
 * a missing or banned user.
 */
export async function buildViewer(db: DB, userId: number): Promise<Viewer | null> {
  const user = await db.query.users.findFirst({ where: eq(s.users.id, userId) });
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
    displayName: user.displayName,
    avatar: user.avatar,
    profileImageUrl: user.profileImageUrl,
    isGod: user.isGod,
    rank: rank ? { id: rank.id, name: rank.name, sortOrder: rank.sortOrder } : null,
    roles: [...roles.values()],
    permissions: [...permissions],
  };
}

/**
 * Resolves a session token (from the cookie) to a Viewer, expiring the row if
 * it's past its TTL.
 */
export async function resolveViewer(db: DB, token: string | undefined): Promise<Viewer | null> {
  if (!token) return null;

  const id = await sha256Base64url(token);
  const session = await db.query.sessions.findFirst({ where: eq(s.sessions.id, id) });
  if (!session) return null;

  if (session.expiresAt < Math.floor(Date.now() / 1000)) {
    await db.delete(s.sessions).where(eq(s.sessions.id, id));
    return null;
  }

  return buildViewer(db, session.userId);
}

export async function invalidateSession(db: DB, token: string): Promise<void> {
  await db.delete(s.sessions).where(eq(s.sessions.id, await sha256Base64url(token)));
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
