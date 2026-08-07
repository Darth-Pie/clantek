/**
 * Server-side loader for the site footer config (settings key 'footer').
 * Returns the stored, re-sanitised footer, or the shipped default when a fresh
 * install has never edited it.
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import * as s from '../db/schema';
import type { Env } from './env';
import { DEFAULT_FOOTER, cleanFooter, type FooterConfig } from '../shared/footer';

export const FOOTER_KEY = 'footer';

type DB = ReturnType<typeof drizzle<typeof schema>>;

export async function loadFooter(env: Env, database?: DB): Promise<FooterConfig> {
  const dbi = database ?? drizzle(env.DB, { schema });
  try {
    const row = await dbi.query.settings.findFirst({ where: eq(s.settings.key, FOOTER_KEY) });
    if (row?.value && typeof row.value === 'object') return cleanFooter(row.value);
  } catch {
    // No settings row/table yet → ship the default footer.
  }
  return DEFAULT_FOOTER;
}
