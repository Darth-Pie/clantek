/**
 * Star Citizen account verification — the anti-poser track for the SC module.
 *
 * Flow: a member claims an RSI handle (`verify/start`) and gets a one-time code;
 * they paste it into their public RSI Short Bio; `verify/confirm` fetches the
 * profile, checks the code is present (proving control of the account), parses
 * the org block, and records whether it matches this install's configured org.
 * Verification is informational (a badge) — it gates nothing. All routes 404
 * when the module is off. Handle uniqueness stops two members claiming one
 * account. We never store RSI credentials or log in on the member's behalf.
 */

import { Hono } from 'hono';
import { eq, and, ne } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth } from '../middleware/auth';
import { loadModules, loadScConfig } from '../modules';
import { fetchCitizen, parseCitizen, isValidHandle } from '../sc/rsi';

const scVerify = new Hono<AppContext>();

async function scEnabled(env: AppContext['Bindings']): Promise<boolean> {
  return (await loadModules(env, db(env))).starcitizen;
}

/** A one-time bio challenge code, e.g. mustr-verify-9f3a2c1b. */
function genCode(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `mustr-verify-${hex}`;
}

/**
 * Verification status for a member, for the profile badge. Everyone (auth'd)
 * can read the verified result; only the owner gets their in-flight challenge.
 */
scVerify.get('/verify/:userId', requireAuth, async (c) => {
  if (!(await scEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const userId = Number(c.req.param('userId'));
  const self = viewer.id === userId;
  const row = await db(c.env).query.scVerifications.findFirst({
    where: eq(s.scVerifications.userId, userId),
  });
  return c.json({
    verified: !!row?.verifiedAt,
    rsiHandle: row?.rsiHandle ?? null,
    orgSid: row?.orgSid ?? null,
    orgRank: row?.orgRank ?? null,
    inOrg: !!row?.inOrg,
    orgVisible: !!row?.orgVisible,
    verifiedAt: row?.verifiedAt ?? null,
    // The pending code/handle is private to the owner (mid-verification).
    pending: self && row?.pendingCode ? { code: row.pendingCode, handle: row.pendingHandle } : null,
  });
});

/** Claim a handle and receive a code to paste into the RSI bio. */
scVerify.post('/verify/start', requireAuth, async (c) => {
  if (!(await scEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ handle?: unknown }>().catch(() => ({}) as { handle?: unknown });
  const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
  if (!isValidHandle(handle)) {
    return c.json({ error: 'Enter a valid RSI handle (letters, numbers, “_” or “-”).' }, 400);
  }
  const code = genCode();
  const now = Math.floor(Date.now() / 1000);
  await db(c.env)
    .insert(s.scVerifications)
    .values({ userId: viewer.id, pendingCode: code, pendingHandle: handle, pendingAt: now })
    .onConflictDoUpdate({
      target: s.scVerifications.userId,
      set: { pendingCode: code, pendingHandle: handle, pendingAt: now },
    });
  return c.json({ code, handle });
});

/** Fetch the RSI profile, confirm the code + org, and record the verification. */
scVerify.post('/verify/confirm', requireAuth, async (c) => {
  if (!(await scEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const row = await db(c.env).query.scVerifications.findFirst({
    where: eq(s.scVerifications.userId, viewer.id),
  });
  if (!row?.pendingCode || !row.pendingHandle) {
    return c.json({ ok: false, error: 'Start a verification first.' }, 400);
  }

  let html: string;
  try {
    const r = await fetchCitizen(row.pendingHandle);
    if (!r.ok) {
      return c.json({ ok: false, error: `Could not load that RSI profile (status ${r.status}). Check the handle.` });
    }
    html = r.html;
  } catch {
    return c.json({ ok: false, error: 'Could not reach RSI right now — try again in a moment.' });
  }

  const profile = parseCitizen(html);
  if (!profile.bio.includes(row.pendingCode)) {
    return c.json({
      ok: false,
      error: 'The code wasn’t found in your RSI Short Bio yet. Add it, Save on RSI, then try again.',
    });
  }

  // No other member may already own this handle (rsiHandle is also UNIQUE).
  const taken = await db(c.env).query.scVerifications.findFirst({
    where: and(eq(s.scVerifications.rsiHandle, row.pendingHandle), ne(s.scVerifications.userId, viewer.id)),
  });
  if (taken) {
    return c.json({ ok: false, error: 'That RSI handle is already verified by another member.' });
  }

  const cfg = await loadScConfig(c.env, db(c.env));
  const inOrg = !!(
    profile.orgVisible &&
    profile.orgSid &&
    cfg.orgSid &&
    profile.orgSid.toLowerCase() === cfg.orgSid.toLowerCase()
  );
  const now = Math.floor(Date.now() / 1000);
  await db(c.env)
    .update(s.scVerifications)
    .set({
      rsiHandle: row.pendingHandle,
      verifiedAt: now,
      orgSid: profile.orgSid,
      orgRank: profile.orgRank,
      orgVisible: profile.orgVisible,
      inOrg,
      pendingCode: null,
      pendingHandle: null,
      pendingAt: null,
    })
    .where(eq(s.scVerifications.userId, viewer.id));

  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'sc.verify',
    targetType: 'user',
    targetId: String(viewer.id),
    meta: { rsiHandle: row.pendingHandle, orgSid: profile.orgSid, inOrg },
  });

  return c.json({
    ok: true,
    verified: true,
    rsiHandle: row.pendingHandle,
    orgSid: profile.orgSid,
    orgName: profile.orgName,
    orgRank: profile.orgRank,
    orgVisible: profile.orgVisible,
    inOrg,
  });
});

/** Abandon an in-flight challenge without touching an existing verification. */
scVerify.post('/verify/cancel', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  await db(c.env)
    .update(s.scVerifications)
    .set({ pendingCode: null, pendingHandle: null, pendingAt: null })
    .where(eq(s.scVerifications.userId, viewer.id));
  return c.json({ ok: true });
});

/** Remove the member's own verification (and any pending challenge). */
scVerify.delete('/verify', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  await db(c.env).delete(s.scVerifications).where(eq(s.scVerifications.userId, viewer.id));
  return c.json({ ok: true });
});

export default scVerify;
