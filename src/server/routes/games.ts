/**
 * Games catalog — the titles the clan plays. A war record (and a medal) can be
 * tied to one, or left clan-wide. Editable end to end from the admin panel.
 */

import { Hono } from 'hono';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { deleteMediaByUrl } from './media';

const games = new Hono<AppContext>();

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'game'
  );
}

async function uniqueSlug(database: ReturnType<typeof db>, base: string, ignoreId?: number): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clash = await database.query.games.findFirst({
      where: ignoreId ? and(eq(s.games.slug, slug), ne(s.games.id, ignoreId)) : eq(s.games.slug, slug),
    });
    if (!clash) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/** Every game, with how many war records reference it. Visible to any member. */
games.get('/', requireAuth, async (c) => {
  const rows = await db(c.env)
    .select({
      id: s.games.id,
      name: s.games.name,
      slug: s.games.slug,
      iconUrl: s.games.iconUrl,
      active: s.games.active,
      sortOrder: s.games.sortOrder,
      recordCount: sql<number>`(select count(*) from war_records where war_records.game_id = games.id)`,
    })
    .from(s.games)
    .orderBy(asc(s.games.sortOrder), asc(s.games.name));

  return c.json({ games: rows });
});

games.post('/', requirePermission('games.manage'), async (c) => {
  const body = await c.req.json<{ name?: string; iconUrl?: string; active?: boolean }>();
  if (!body.name?.trim()) return c.json({ error: 'A name is required' }, 400);

  const database = db(c.env);
  const slug = await uniqueSlug(database, slugify(body.name));
  const highest = await database.select({ max: sql<number | null>`max(${s.games.sortOrder})` }).from(s.games);

  const created = (
    await database
      .insert(s.games)
      .values({
        name: body.name.trim().slice(0, 100),
        slug,
        iconUrl: body.iconUrl?.trim() || null,
        active: body.active ?? true,
        sortOrder: (highest[0]?.max ?? -1) + 1,
      })
      .returning()
  )[0]!;

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'game.create',
    targetType: 'game',
    targetId: String(created.id),
    meta: { name: created.name },
  });

  return c.json({ game: { ...created, recordCount: 0 } }, 201);
});

games.patch('/:id', requirePermission('games.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; iconUrl?: string | null; active?: boolean; sortOrder?: number }>();

  const database = db(c.env);
  const game = await database.query.games.findFirst({ where: eq(s.games.id, id) });
  if (!game) return c.json({ error: 'No such game' }, 404);

  const patch: Partial<typeof s.games.$inferInsert> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return c.json({ error: 'Name cannot be empty' }, 400);
    patch.name = body.name.trim().slice(0, 100);
  }
  if (body.iconUrl !== undefined) {
    patch.iconUrl = body.iconUrl?.trim() || null;
    if (patch.iconUrl !== game.iconUrl) c.executionCtx.waitUntil(deleteMediaByUrl(c.env, game.iconUrl));
  }
  if (body.active !== undefined) patch.active = body.active;
  if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;

  const updated = (await database.update(s.games).set(patch).where(eq(s.games.id, id)).returning())[0]!;
  return c.json({ game: updated });
});

games.delete('/:id', requirePermission('games.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);
  const game = await database.query.games.findFirst({ where: eq(s.games.id, id) });
  if (!game) return c.json({ error: 'No such game' }, 404);

  await database.delete(s.games).where(eq(s.games.id, id));
  c.executionCtx.waitUntil(deleteMediaByUrl(c.env, game.iconUrl));

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'game.delete',
    targetType: 'game',
    targetId: String(id),
    meta: { name: game.name },
  });

  return c.json({ ok: true });
});

export default games;
