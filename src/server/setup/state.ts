/**
 * First-run setup state + the standalone "unlocked" cookie.
 *
 * The wizard runs before any user exists, so its pre-claim steps can't use the
 * normal DB-backed session (which needs a user row). Instead, presenting the
 * correct SETUP_TOKEN mints a short-lived HMAC-signed cookie that authorizes the
 * remaining setup steps.
 *
 * "Claimed" — the install is done and setup must stay closed forever — is true
 * when either the setup flag is marked complete OR a god admin already exists.
 * The god-exists check means any pre-existing install (mustr.gg, or one set up by
 * the old CLI seed) is treated as claimed even without the flag, so the wizard can
 * never reopen on a live site.
 */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as s from '../../db/schema';
import { base64url } from '../auth/crypto';
import { godExists } from './schema';

export const SETUP_KEY = 'setup';
export const SETUP_COOKIE = 'ct_setup';
const SETUP_TTL_SECONDS = 30 * 60; // a wizard session

type DB = DrizzleD1Database<typeof s>;

export interface SetupState {
  completed: boolean;
  completedAt?: number;
  ownerId?: number;
}

export async function loadSetupState(db: DB): Promise<SetupState> {
  try {
    const row = await db.query.settings.findFirst({ where: eq(s.settings.key, SETUP_KEY) });
    const v = row?.value as Partial<SetupState> | undefined;
    if (v && typeof v === 'object') {
      return { completed: !!v.completed, completedAt: v.completedAt, ownerId: v.ownerId };
    }
  } catch {
    // settings table doesn't exist yet (fresh install) → not completed
  }
  return { completed: false };
}

export async function markSetupComplete(db: DB, ownerId: number): Promise<void> {
  const value: SetupState = { completed: true, completedAt: Math.floor(Date.now() / 1000), ownerId };
  await db
    .insert(s.settings)
    .values({ key: SETUP_KEY, value })
    .onConflictDoUpdate({ target: s.settings.key, set: { value, updatedAt: Math.floor(Date.now() / 1000) } });
}

/** True when setup is done — completed flag set, or a god admin already exists. */
export async function isClaimed(db: DB, rawDb: D1Database): Promise<boolean> {
  const st = await loadSetupState(db);
  if (st.completed) return true;
  return godExists(rawDb);
}

/* ------------------------------------------------------------------ *
 * The unlocked cookie: `${exp}.${HMAC-SHA256(exp, SESSION_SECRET)}`.
 * ------------------------------------------------------------------ */

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return base64url(new Uint8Array(sig));
}

/** Length-safe string compare (avoids leaking match progress via timing). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function mintSetupCookie(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SETUP_TTL_SECONDS;
  const value = `${exp}.${await hmac(secret, String(exp))}`;
  return [
    `${SETUP_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${SETUP_TTL_SECONDS}`,
  ].join('; ');
}

export const clearedSetupCookie = `${SETUP_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function isUnlocked(secret: string, raw: string | undefined): Promise<boolean> {
  if (!raw) return false;
  const dot = raw.indexOf('.');
  if (dot < 1) return false;
  const expStr = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(sig, await hmac(secret, expStr));
}
