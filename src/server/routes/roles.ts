/**
 * Role management — the capability side of the permission model.
 *
 * A role bundles permission strings and, optionally, mirrors a Discord role.
 * Setting discordRoleId is what lets granting a role here also grant it in
 * Discord (see discord/sync.ts and the member role routes).
 */

import { Hono } from 'hono';
import { asc, eq, sql } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { isPermission, type Permission } from '../../shared/permissions';
import { DiscordRest, DiscordError } from '../discord/rest';

const roles = new Hono<AppContext>();

function rest(env: AppContext['Bindings']): DiscordRest | null {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
  return new DiscordRest(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);
}

/** Every role with its permission list and how many members hold it. */
roles.get('/', requirePermission('roles.manage'), async (c) => {
  const database = db(c.env);

  const rows = await database
    .select({
      id: s.roles.id,
      name: s.roles.name,
      description: s.roles.description,
      color: s.roles.color,
      discordRoleId: s.roles.discordRoleId,
      sortOrder: s.roles.sortOrder,
      isSystem: s.roles.isSystem,
      memberCount: sql<number>`(select count(*) from user_roles where user_roles.role_id = roles.id)`,
    })
    .from(s.roles)
    .orderBy(asc(s.roles.sortOrder), asc(s.roles.name));

  const perms = await database.select().from(s.rolePermissions);
  const byRole = new Map<number, Permission[]>();
  for (const p of perms) {
    const list = byRole.get(p.roleId) ?? [];
    list.push(p.permission as Permission);
    byRole.set(p.roleId, list);
  }

  return c.json({
    roles: rows.map((r) => ({ ...r, permissions: byRole.get(r.id) ?? [] })),
  });
});

/**
 * The guild's assignable Discord roles, for the mapping dropdown.
 *
 * Excludes @everyone and managed roles (bot/integration roles Discord won't
 * let anyone assign by hand). Returns [] with a reason when the bot isn't
 * configured or lacks access, so the UI can explain rather than just break.
 */
roles.get('/discord-roles', requirePermission('roles.manage'), async (c) => {
  const client = rest(c.env);
  if (!client) {
    return c.json({ roles: [], warning: 'Discord bot token or guild ID is not configured.' });
  }

  try {
    const all = await client.listRoles();
    const assignable = all
      .filter((r) => r.name !== '@everyone' && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        // Discord stores role colour as a 24-bit int; 0 means "no colour".
        color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
        position: r.position,
      }));
    return c.json({ roles: assignable });
  } catch (err) {
    const warning =
      err instanceof DiscordError && err.status === 403
        ? 'The bot cannot read this server’s roles — check it has been invited and has the View Server permission.'
        : `Could not load Discord roles: ${(err as Error).message}`;
    return c.json({ roles: [], warning });
  }
});

roles.post('/', requirePermission('roles.manage'), async (c) => {
  const body = await c.req.json<{
    name: string;
    description?: string;
    color?: string;
    discordRoleId?: string;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);

  const database = db(c.env);
  const highest = await database
    .select({ max: sql<number | null>`max(${s.roles.sortOrder})` })
    .from(s.roles);

  try {
    const inserted = await database
      .insert(s.roles)
      .values({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        color: body.color?.trim() || null,
        discordRoleId: body.discordRoleId?.trim() || null,
        sortOrder: (highest[0]?.max ?? -1) + 1,
      })
      .returning();

    const created = inserted[0];
    if (!created) return c.json({ error: 'Failed to create role' }, 500);

    await database.insert(s.auditLog).values({
      actorId: c.get('viewer')!.id,
      action: 'role.create',
      targetType: 'role',
      targetId: String(created.id),
      meta: { name: created.name },
    });

    return c.json({ role: { ...created, permissions: [] } }, 201);
  } catch (err) {
    // roles.name is unique; surface the collision instead of a 500.
    if (String(err).includes('UNIQUE')) {
      return c.json({ error: `A role named “${body.name.trim()}” already exists.` }, 409);
    }
    throw err;
  }
});

roles.patch('/:id', requirePermission('roles.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    color?: string | null;
    discordRoleId?: string | null;
  }>();

  const database = db(c.env);
  const role = await database.query.roles.findFirst({ where: eq(s.roles.id, id) });
  if (!role) return c.json({ error: 'No such role' }, 404);

  // System roles are renamed nowhere but here would be the place; block it so
  // code that references them by name (e.g. seed data, docs) stays valid.
  if (role.isSystem && body.name != null && body.name.trim() !== role.name) {
    return c.json({ error: `“${role.name}” is a system role and cannot be renamed.` }, 403);
  }

  const patch: Partial<typeof s.roles.$inferInsert> = { updatedAt: Math.floor(Date.now() / 1000) };
  if (body.name != null) patch.name = body.name.trim();
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.color !== undefined) patch.color = body.color?.trim() || null;
  if (body.discordRoleId !== undefined) patch.discordRoleId = body.discordRoleId?.trim() || null;

  const updated = await database.update(s.roles).set(patch).where(eq(s.roles.id, id)).returning();
  return c.json({ role: updated[0] });
});

/** Replace a role's permission set wholesale. */
roles.put('/:id/permissions', requirePermission('roles.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const { permissions } = await c.req.json<{ permissions: string[] }>();

  if (!Array.isArray(permissions)) {
    return c.json({ error: 'Expected a permissions array' }, 400);
  }
  const invalid = permissions.filter((p) => !isPermission(p));
  if (invalid.length) {
    return c.json({ error: `Unknown permission(s): ${invalid.join(', ')}` }, 400);
  }

  const database = db(c.env);
  const role = await database.query.roles.findFirst({ where: eq(s.roles.id, id) });
  if (!role) return c.json({ error: 'No such role' }, 404);

  const unique = [...new Set(permissions)];
  await database.batch([
    database.delete(s.rolePermissions).where(eq(s.rolePermissions.roleId, id)),
    ...(unique.length
      ? [database.insert(s.rolePermissions).values(unique.map((permission) => ({ roleId: id, permission })))]
      : []),
  ] as never);

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'role.permissions',
    targetType: 'role',
    targetId: String(id),
    meta: { permissions: unique },
  });

  return c.json({ ok: true, permissions: unique });
});

roles.delete('/:id', requirePermission('roles.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);

  const role = await database.query.roles.findFirst({ where: eq(s.roles.id, id) });
  if (!role) return c.json({ error: 'No such role' }, 404);
  if (role.isSystem) {
    return c.json({ error: `“${role.name}” is a system role and cannot be deleted.` }, 403);
  }

  // user_roles and role_permissions cascade on delete (see schema), so members
  // simply lose this role. The Discord side is left alone — reconciliation or a
  // manual sync handles removing the mapped Discord role if desired.
  await database.delete(s.roles).where(eq(s.roles.id, id));

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'role.delete',
    targetType: 'role',
    targetId: String(id),
    meta: { name: role.name },
  });

  return c.json({ ok: true });
});

export default roles;
