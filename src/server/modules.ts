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
