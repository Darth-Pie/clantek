/**
 * Server-side loader for the built-in content-page visibility config
 * (settings key 'page_access'). Returns the stored, re-sanitised config, or the
 * shipped default (everything 'members') when a fresh install has never set it.
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import * as s from '../db/schema';
import type { Env } from './env';
import { DEFAULT_PAGE_ACCESS, cleanPageAccess, type PageAccessConfig } from '../shared/pageAccess';

export const PAGE_ACCESS_KEY = 'page_access';

type DB = ReturnType<typeof drizzle<typeof schema>>;

export async function loadPageAccess(env: Env, database?: DB): Promise<PageAccessConfig> {
  const dbi = database ?? drizzle(env.DB, { schema });
  try {
    const row = await dbi.query.settings.findFirst({ where: eq(s.settings.key, PAGE_ACCESS_KEY) });
    if (row?.value && typeof row.value === 'object') return cleanPageAccess(row.value);
  } catch {
    // No settings row/table yet → ship the default (all members-only).
  }
  return DEFAULT_PAGE_ACCESS;
}
