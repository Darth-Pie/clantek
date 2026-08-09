/**
 * In-Worker database bootstrap for a brand-new install.
 *
 * A productized buyer deploys the Worker with an empty D1 and never touches the
 * CLI, so the schema has to be created from inside the app. `ensureSchema` runs
 * the bundled migrations (src/db/migrations.generated.ts, regenerated from
 * drizzle/*.sql at build time) followed by the fresh-install seed — but ONLY on a
 * database that has no schema yet. On an already-provisioned install (e.g.
 * mustr.gg, which has every table + a god user) it detects the `users` table and
 * no-ops, so it can never disturb live data.
 *
 * Atomicity: schema and seed each run as a single D1 batch (one transaction). If
 * the schema batch fails, nothing commits, `users` is never created, and setup
 * can be retried cleanly rather than getting stuck half-built.
 */

import { SCHEMA_STATEMENTS, SEED_STATEMENTS } from '../../db/migrations.generated';

/** True once the core schema exists (checked via the `users` table). Never throws. */
export async function schemaExists(db: D1Database): Promise<boolean> {
  try {
    const row = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1")
      .first<{ name: string }>();
    return !!row;
  } catch {
    return false;
  }
}

/** True once an owner (god admin) exists. False when unclaimed or schema absent. */
export async function godExists(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare('SELECT 1 AS one FROM users WHERE is_god = 1 LIMIT 1').first<{ one: number }>();
    return !!row;
  } catch {
    return false; // table missing (fresh) → no god yet
  }
}

/**
 * Create the schema + seed reference data if (and only if) the database is empty.
 * Returns whether it actually built anything. Safe to call repeatedly.
 */
export async function ensureSchema(db: D1Database): Promise<{ created: boolean }> {
  if (await schemaExists(db)) return { created: false };

  // Schema first (atomic), then seed (atomic). Order within each is preserved.
  await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
  await db.batch(SEED_STATEMENTS.map((sql) => db.prepare(sql)));
  return { created: true };
}
