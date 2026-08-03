/**
 * Rank management.
 *
 * The whole point of this rewrite: ranks are rows, created and destroyed at
 * will. The 2003 version had exactly 21, baked into column names.
 */

import { Hono } from 'hono';
import { asc, eq, ne, sql } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { DiscordRest } from '../discord/rest';
import { syncRankHolders } from '../discord/sync';

const ranks = new Hono<AppContext>();

function rest(env: AppContext['Bindings']): DiscordRest | null {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
  return new DiscordRest(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);
}

/** Public: the ladder is visible to anyone. Includes the roles each rank grants. */
ranks.get('/', async (c) => {
  const database = db(c.env);
  const rows = await database
    .select({
      id: s.ranks.id,
      name: s.ranks.name,
      abbreviation: s.ranks.abbreviation,
      imageUrl: s.ranks.imageUrl,
      sortOrder: s.ranks.sortOrder,
      reqDays: s.ranks.reqDays,
      reqWins: s.ranks.reqWins,
      isDefault: s.ranks.isDefault,
      memberCount: sql<number>`(select count(*) from users where users.rank_id = ranks.id)`,
    })
    .from(s.ranks)
    .orderBy(asc(s.ranks.sortOrder));

  const rankRoles = await database.select().from(s.rankRoles);
  const roleIdsByRank = new Map<number, number[]>();
  for (const rr of rankRoles) {
    const list = roleIdsByRank.get(rr.rankId) ?? [];
    list.push(rr.roleId);
    roleIdsByRank.set(rr.rankId, list);
  }

  return c.json({
    ranks: rows.map((r) => ({ ...r, roleIds: roleIdsByRank.get(r.id) ?? [] })),
  });
});

/**
 * Set the roles a rank grants, then re-apply to everyone at that rank so the
 * change reaches current members (and Discord) immediately.
 */
// Deciding which roles a rank hands out is a role-granting policy, so it needs
// roles.manage rather than merely ranks.manage.
ranks.put('/:id/roles', requirePermission('roles.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const { roleIds } = await c.req.json<{ roleIds: number[] }>();
  if (!Array.isArray(roleIds)) {
    return c.json({ error: 'Expected a roleIds array' }, 400);
  }

  const database = db(c.env);
  const rank = await database.query.ranks.findFirst({ where: eq(s.ranks.id, id) });
  if (!rank) return c.json({ error: 'No such rank' }, 404);

  const unique = [...new Set(roleIds)];
  await database.batch([
    database.delete(s.rankRoles).where(eq(s.rankRoles.rankId, id)),
    ...(unique.length
      ? [database.insert(s.rankRoles).values(unique.map((roleId) => ({ rankId: id, roleId })))]
      : []),
  ] as never);

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'rank.set_roles',
    targetType: 'rank',
    targetId: String(id),
    meta: { roleIds: unique },
  });

  // Reconcile current holders so the mapping change takes effect now.
  const applied = await syncRankHolders(database, rest(c.env), id);

  return c.json({ ok: true, roleIds: unique, applied });
});

ranks.post('/', requirePermission('ranks.manage'), async (c) => {
  const body = await c.req.json<{
    name: string;
    abbreviation?: string;
    imageUrl?: string;
    reqDays?: number;
    reqWins?: number;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);

  const database = db(c.env);
  const highest = await database
    .select({ max: sql<number | null>`max(${s.ranks.sortOrder})` })
    .from(s.ranks);

  const inserted = await database
    .insert(s.ranks)
    .values({
      name: body.name.trim(),
      abbreviation: body.abbreviation?.trim() || null,
      imageUrl: body.imageUrl?.trim() || null,
      sortOrder: (highest[0]?.max ?? -1) + 1,
      reqDays: body.reqDays ?? 0,
      reqWins: body.reqWins ?? 0,
    })
    .returning();

  const created = inserted[0];
  if (!created) return c.json({ error: 'Failed to create rank' }, 500);

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'rank.create',
    targetType: 'rank',
    targetId: String(created.id),
    meta: { name: created.name },
  });

  return c.json({ rank: created }, 201);
});

ranks.patch('/:id', requirePermission('ranks.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<typeof s.ranks.$inferInsert>>();
  const database = db(c.env);

  // Exactly one default rank, or new recruits land nowhere.
  if (body.isDefault) {
    await database.update(s.ranks).set({ isDefault: false }).where(ne(s.ranks.id, id));
  }

  const updated = await database
    .update(s.ranks)
    .set({ ...body, id: undefined, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(s.ranks.id, id))
    .returning();

  if (!updated.length) return c.json({ error: 'No such rank' }, 404);
  return c.json({ rank: updated[0] });
});

/**
 * Reordering rewrites every sortOrder in one shot, which avoids the unique
 * constraint tripping over an intermediate state.
 */
ranks.put('/order', requirePermission('ranks.manage'), async (c) => {
  const { order } = await c.req.json<{ order: number[] }>(); // ids, lowest rank first
  if (!Array.isArray(order) || !order.length) {
    return c.json({ error: 'Expected a non-empty array of rank ids' }, 400);
  }

  const database = db(c.env);
  // Park them out of the way first so no two rows collide mid-update.
  await database.batch([
    database.update(s.ranks).set({ sortOrder: sql`${s.ranks.sortOrder} + 10000` }),
    ...order.map((id, index) =>
      database.update(s.ranks).set({ sortOrder: index }).where(eq(s.ranks.id, id)),
    ),
  ] as never);

  return c.json({ ok: true });
});

ranks.delete('/:id', requirePermission('ranks.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);

  const rank = await database.query.ranks.findFirst({ where: eq(s.ranks.id, id) });
  if (!rank) return c.json({ error: 'No such rank' }, 404);

  const holders = await database
    .select({ n: sql<number>`count(*)` })
    .from(s.users)
    .where(eq(s.users.rankId, id));

  // Deleting a rank out from under members would silently strip their standing.
  const memberCount = Number(holders[0]?.n ?? 0);
  if (memberCount > 0) {
    return c.json(
      {
        error: `${memberCount} member(s) currently hold this rank. Reassign them first.`,
        memberCount,
      },
      409,
    );
  }

  await database.delete(s.ranks).where(eq(s.ranks.id, id));
  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'rank.delete',
    targetType: 'rank',
    targetId: String(id),
    meta: { name: rank.name },
  });

  return c.json({ ok: true });
});

export default ranks;
