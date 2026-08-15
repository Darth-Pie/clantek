/**
 * Site snapshots — the God-only "Backups" API. Save a full restore point, list
 * them, restore one (wiping and reloading the whole database from it), delete
 * one, or download its raw JSON.
 *
 * Every route is God-gated (`requireGod`): restore wipes the entire content /
 * configuration / roster and reloads it, which is far too powerful to hand out
 * through a role. The snapshot engine (capture/restore, what's in scope) lives in
 * server/snapshot.ts; this file is just the HTTP + R2 + session plumbing.
 *
 * Payloads live in R2 (the MEDIA bucket, under snapshots/…), never in D1 — so a
 * restore, which clears every in-scope table, can never delete the restore points
 * themselves. The `site_snapshots` metadata table is likewise out of restore scope.
 */

import { Hono } from 'hono';
import { desc, eq, inArray } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireGod } from '../middleware/auth';
import { createSession, sessionCookie } from '../auth/session';
import {
  captureSnapshot,
  restoreSnapshot,
  payloadHasGod,
  payloadRowTotal,
  SnapshotError,
  type SnapshotPayload,
} from '../snapshot';

const snapshots = new Hono<AppContext>();

const R2_PREFIX = 'snapshots/';
/** Keep at most this many automatic (pre-restore) safety copies. */
const MAX_AUTO = 5;

snapshots.use('*', requireGod);

/** The metadata list, newest first. Payloads are not included (they're in R2). */
snapshots.get('/', async (c) => {
  const rows = await db(c.env)
    .select()
    .from(s.siteSnapshots)
    .orderBy(desc(s.siteSnapshots.createdAt));
  return c.json({ snapshots: rows });
});

/** Capture the current database as a new snapshot. */
snapshots.post('/', async (c) => {
  if (!c.env.MEDIA) {
    return c.json({ error: 'Snapshot storage (R2) is not configured on this deployment.' }, 503);
  }
  const viewer = c.get('viewer')!;
  const body = await c.req
    .json<{ name?: unknown; note?: unknown }>()
    .catch(() => ({}) as { name?: unknown; note?: unknown });
  const name = (typeof body.name === 'string' ? body.name.trim() : '').slice(0, 80) || defaultName();
  const note = (typeof body.note === 'string' ? body.note.trim() : '').slice(0, 500) || null;

  const row = await capture(c.env, viewer.id, { name, note, kind: 'manual' });
  return c.json({ snapshot: row }, 201);
});

/**
 * Restore a snapshot: auto-save the current state first (so this is undoable),
 * then wipe + reload every in-scope table from the chosen snapshot, then re-mint
 * the acting God's session (the old one was cascade-deleted with the users wipe)
 * so they stay signed in.
 */
snapshots.post('/:id/restore', async (c) => {
  if (!c.env.MEDIA) {
    return c.json({ error: 'Snapshot storage (R2) is not configured on this deployment.' }, 503);
  }
  const viewer = c.get('viewer')!;
  const id = c.req.param('id');
  const database = db(c.env);

  const meta = await database.query.siteSnapshots.findFirst({
    where: eq(s.siteSnapshots.id, id),
  });
  if (!meta) return c.json({ error: 'Snapshot not found.' }, 404);

  const obj = await c.env.MEDIA.get(meta.r2Key);
  if (!obj) return c.json({ error: 'This snapshot’s data is missing from storage and can’t be restored.' }, 410);

  let payload: SnapshotPayload;
  try {
    payload = JSON.parse(await obj.text()) as SnapshotPayload;
  } catch {
    return c.json({ error: 'This snapshot’s data is corrupt and can’t be restored.' }, 422);
  }

  // Refuse a restore that wouldn't leave the acting God with access — otherwise
  // they'd wipe themselves out of their own site with no way back in.
  if (!payloadHasGod(payload, viewer.id)) {
    return c.json(
      {
        error:
          'This snapshot doesn’t include your God account, so restoring it would lock you out. Restore was cancelled.',
      },
      409,
    );
  }

  // 1) Safety copy of the current state, so the restore itself can be undone.
  let autoSaved: string | null = null;
  try {
    const auto = await capture(c.env, viewer.id, {
      name: `Before restoring “${meta.name}”`,
      note: 'Automatic safety copy taken just before a restore.',
      kind: 'auto',
    });
    autoSaved = auto.id;
    await pruneAuto(c.env);
  } catch (err) {
    return c.json(
      { error: `Couldn’t take a safety backup first, so nothing was changed: ${(err as Error).message}` },
      500,
    );
  }

  // 2) The restore itself (atomic).
  try {
    await restoreSnapshot(database, payload);
  } catch (err) {
    if (err instanceof SnapshotError) return c.json({ error: err.message }, 422);
    throw err;
  }

  // 3) Re-issue the God's session — their cookie's session row was just wiped.
  const { token, expiresAt } = await createSession(database, viewer.id, {
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('cf-connecting-ip'),
  });
  c.header('Set-Cookie', sessionCookie(token, expiresAt - Math.floor(Date.now() / 1000)));

  // 4) Record it (the audit log was itself just restored; this entry lands on top).
  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'site.restore',
    targetType: 'snapshot',
    targetId: id,
    meta: { name: meta.name, rows: payloadRowTotal(payload), autoSaved },
    source: 'web',
  });

  return c.json({ ok: true, restored: meta.name, rows: payloadRowTotal(payload), autoSaved });
});

/** Delete a snapshot (its R2 payload and its metadata row). */
snapshots.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const database = db(c.env);
  const meta = await database.query.siteSnapshots.findFirst({ where: eq(s.siteSnapshots.id, id) });
  if (!meta) return c.json({ error: 'Snapshot not found.' }, 404);

  if (c.env.MEDIA) {
    try {
      await c.env.MEDIA.delete(meta.r2Key);
    } catch (err) {
      console.error('Failed to delete snapshot payload', meta.r2Key, err);
    }
  }
  await database.delete(s.siteSnapshots).where(eq(s.siteSnapshots.id, id));
  return c.json({ ok: true });
});

/** Download a snapshot's raw JSON (an off-site copy the God can keep). */
snapshots.get('/:id/download', async (c) => {
  if (!c.env.MEDIA) return c.json({ error: 'Snapshot storage (R2) is not configured.' }, 503);
  const id = c.req.param('id');
  const meta = await db(c.env).query.siteSnapshots.findFirst({ where: eq(s.siteSnapshots.id, id) });
  if (!meta) return c.json({ error: 'Snapshot not found.' }, 404);
  const obj = await c.env.MEDIA.get(meta.r2Key);
  if (!obj) return c.json({ error: 'Snapshot data missing from storage.' }, 410);

  const safe = meta.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'snapshot';
  return new Response(obj.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${safe}.json"`,
      'cache-control': 'no-store',
    },
  });
});

export default snapshots;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function defaultName(): string {
  return `Snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
}

/** Capture + store payload in R2 + write the metadata row. Returns the row. */
async function capture(
  env: AppContext['Bindings'],
  userId: number,
  opts: { name: string; note: string | null; kind: 'manual' | 'auto' },
) {
  const { payload, counts } = await captureSnapshot(db(env));
  const json = JSON.stringify(payload);
  const id = crypto.randomUUID();
  const r2Key = `${R2_PREFIX}${id}.json`;

  await env.MEDIA!.put(r2Key, json, {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  });

  const rows = {
    id,
    name: opts.name,
    note: opts.note,
    r2Key,
    sizeBytes: json.length,
    tableCounts: counts,
    kind: opts.kind,
    createdBy: userId,
  };
  await db(env).insert(s.siteSnapshots).values(rows);
  return { ...rows, createdAt: Math.floor(Date.now() / 1000) };
}

/** Keep only the newest MAX_AUTO automatic snapshots; delete the rest (+ R2). */
async function pruneAuto(env: AppContext['Bindings']): Promise<void> {
  const autos = await db(env)
    .select({ id: s.siteSnapshots.id, r2Key: s.siteSnapshots.r2Key })
    .from(s.siteSnapshots)
    .where(eq(s.siteSnapshots.kind, 'auto'))
    .orderBy(desc(s.siteSnapshots.createdAt));

  const stale = autos.slice(MAX_AUTO);
  if (stale.length === 0) return;

  for (const row of stale) {
    if (env.MEDIA) {
      try {
        await env.MEDIA.delete(row.r2Key);
      } catch (err) {
        console.error('Failed to prune snapshot payload', row.r2Key, err);
      }
    }
  }
  await db(env)
    .delete(s.siteSnapshots)
    .where(inArray(s.siteSnapshots.id, stale.map((r) => r.id)));
}
