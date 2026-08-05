/**
 * Personal access token management, under /api/auth/tokens.
 *
 * Listing is available to any signed-in member (over web *or* an existing
 * token). Minting and revoking require a real web session (requireWebSession),
 * so a leaked token can neither spawn siblings nor revoke the ones that would
 * lock the attacker out — credential management stays anchored to the browser.
 */

import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requireWebSession } from '../middleware/auth';
import { createApiToken } from '../auth/apiToken';

const tokens = new Hono<AppContext>();

/** The caller's own tokens — never the hash or the raw value. */
tokens.get('/', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  const rows = await db(c.env)
    .select({
      id: s.apiTokens.id,
      label: s.apiTokens.label,
      prefix: s.apiTokens.prefix,
      createdAt: s.apiTokens.createdAt,
      lastUsedAt: s.apiTokens.lastUsedAt,
      expiresAt: s.apiTokens.expiresAt,
    })
    .from(s.apiTokens)
    .where(eq(s.apiTokens.userId, viewer.id))
    .orderBy(desc(s.apiTokens.createdAt));
  return c.json({ tokens: rows });
});

/** Mint a token. The raw value is returned exactly once — never retrievable again. */
tokens.post('/', requireWebSession, async (c) => {
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
  const label = (body.label ?? '').trim().slice(0, 60) || 'Mobile app';

  const created = await createApiToken(db(c.env), viewer.id, label);

  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'token.create',
    targetType: 'api_token',
    targetId: String(created.id),
    meta: { label: created.label, prefix: created.prefix },
  });

  // `token` is the secret; the client must copy it now.
  return c.json(created, 201);
});

/** Revoke one of the caller's own tokens. */
tokens.delete('/:id', requireWebSession, async (c) => {
  const viewer = c.get('viewer')!;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Bad token id.' }, 400);

  const existing = await db(c.env).query.apiTokens.findFirst({
    where: and(eq(s.apiTokens.id, id), eq(s.apiTokens.userId, viewer.id)),
  });
  if (!existing) return c.json({ error: 'No such token.' }, 404);

  await db(c.env).delete(s.apiTokens).where(eq(s.apiTokens.id, id));

  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'token.revoke',
    targetType: 'api_token',
    targetId: String(id),
    meta: { label: existing.label, prefix: existing.prefix },
  });

  return c.json({ ok: true });
});

export default tokens;
