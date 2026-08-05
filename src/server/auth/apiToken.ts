/**
 * Personal access tokens — the credential the mobile/native app (or a script)
 * uses. A member mints a labelled token in account settings; the raw value is
 * shown once, and only its SHA-256 is stored. It's presented on every API call
 * as `Authorization: Bearer clt_…` and resolves, via buildViewer, to the exact
 * same Viewer and permission set as that member's web session.
 */

import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as s from '../../db/schema';
import type { Viewer } from '../../shared/permissions';
import { buildViewer } from './session';
import { randomToken, sha256Base64url } from './crypto';

type DB = DrizzleD1Database<typeof s>;

/** Human-recognizable, namespaced prefix so a leaked token is easy to spot. */
const TOKEN_PREFIX = 'clt_';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
/** Only rewrite last_used_at at most this often, to avoid a write per request. */
const LAST_USED_THROTTLE_SECONDS = 60 * 60;

export interface CreatedToken {
  id: number;
  token: string; // the raw value — shown to the caller exactly once
  label: string;
  prefix: string;
  expiresAt: number | null;
}

export async function createApiToken(
  db: DB,
  userId: number,
  label: string,
): Promise<CreatedToken> {
  const token = `${TOKEN_PREFIX}${randomToken()}`;
  const prefix = token.slice(0, TOKEN_PREFIX.length + 6); // e.g. clt_ab12cd
  const expiresAt = Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS;

  const inserted = await db
    .insert(s.apiTokens)
    .values({ userId, tokenHash: await sha256Base64url(token), label, prefix, expiresAt })
    .returning({ id: s.apiTokens.id });

  return { id: inserted[0]!.id, token, label, prefix, expiresAt };
}

/**
 * Resolve a bearer token to a Viewer, or null if it's unknown, expired, or the
 * user is gone/banned. Touches last_used_at at most hourly (best effort).
 */
export async function resolveApiToken(db: DB, raw: string | undefined): Promise<Viewer | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;

  const now = Math.floor(Date.now() / 1000);
  const hash = await sha256Base64url(raw);
  const row = await db.query.apiTokens.findFirst({
    where: and(
      eq(s.apiTokens.tokenHash, hash),
      // null expiry = never expires; otherwise must be in the future.
      or(isNull(s.apiTokens.expiresAt), gt(s.apiTokens.expiresAt, now)),
    ),
  });
  if (!row) return null;

  const viewer = await buildViewer(db, row.userId);
  if (!viewer) return null;

  if (!row.lastUsedAt || now - row.lastUsedAt > LAST_USED_THROTTLE_SECONDS) {
    await db
      .update(s.apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(s.apiTokens.id, row.id))
      .catch(() => {});
  }

  return viewer;
}
