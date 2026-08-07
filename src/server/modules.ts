/**
 * Game modules — optional, per-install features an operator turns on in Settings.
 *
 * Star Citizen is the first. Stored as one flags blob in settings['modules'];
 * everything defaults OFF so a fresh install ships lean. Resolved DB-over-nothing
 * (there's no env fallback — modules are purely an admin choice). Same shape as
 * the other settings-backed config so it reads consistently.
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import * as s from '../db/schema';
import type { Env } from './env';

export const MODULES_KEY = 'modules';

export interface ModuleFlags {
  starcitizen: boolean;
}

type DB = ReturnType<typeof drizzle<typeof schema>>;

/** The enabled-module flags, all false unless an admin turned one on. */
export async function loadModules(env: Env, database?: DB): Promise<ModuleFlags> {
  const dbi = database ?? drizzle(env.DB, { schema });
  let stored: Record<string, unknown> = {};
  try {
    const row = await dbi.query.settings.findFirst({ where: eq(s.settings.key, MODULES_KEY) });
    if (row?.value && typeof row.value === 'object') stored = row.value as Record<string, unknown>;
  } catch {
    // No settings row/table yet → everything off.
  }
  return { starcitizen: stored.starcitizen === true };
}

/** Sanitise an incoming flags payload to exactly the known booleans. */
export function cleanModuleFlags(raw: unknown): ModuleFlags {
  const o = (raw ?? {}) as Record<string, unknown>;
  return { starcitizen: o.starcitizen === true };
}

/* ------------------------------------------------------------------ *
 * Star Citizen module config — settings that only matter when the SC module is
 * on. Kept in its own settings key so the module flags stay pure booleans. The
 * org SID lets account verification confirm a member's RSI profile lists THIS
 * install's org (each buyer sets their own).
 * ------------------------------------------------------------------ */

export const SC_KEY = 'sc';

export interface ScConfig {
  /** This org's RSI Spectrum Identification (SID), e.g. "F919". Case-insensitive. */
  orgSid: string;
}

export async function loadScConfig(env: Env, database?: DB): Promise<ScConfig> {
  const dbi = database ?? drizzle(env.DB, { schema });
  let stored: Record<string, unknown> = {};
  try {
    const row = await dbi.query.settings.findFirst({ where: eq(s.settings.key, SC_KEY) });
    if (row?.value && typeof row.value === 'object') stored = row.value as Record<string, unknown>;
  } catch {
    // No settings row/table yet → no org configured.
  }
  return { orgSid: typeof stored.orgSid === 'string' ? stored.orgSid : '' };
}

export function cleanScConfig(raw: unknown): ScConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  return { orgSid: (typeof o.orgSid === 'string' ? o.orgSid : '').trim().slice(0, 20) };
}
