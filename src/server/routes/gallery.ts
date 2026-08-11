/**
 * Gallery module — albums of images and embedded videos, gated per album.
 *
 * Reads are PUBLIC by design: the gallery is the one part of the site meant to
 * be shown off, so anyone (signed out included) may hit these routes. What they
 * get back is filtered by `canViewAlbum` from shared/gallery.ts, which is the
 * single authority on the three audiences — everyone / members / one role.
 * Filtering happens here, in SQL-adjacent JS, never in the client: an album the
 * viewer can't see is absent from the list and 404s on direct fetch, so its
 * existence, title and item count all stay hidden.
 *
 * Writes need `gallery.manage`. Deleting an album or item also deletes the R2
 * objects behind it, so an install's storage doesn't fill with orphans.
 *
 * Every route 404s when the module is off, matching the SC routes: a disabled
 * module should look like a feature that was never built.
 */

import { Hono } from 'hono';
import { eq, asc, sql } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { loadModules } from '../modules';
import { deleteMediaByUrl } from './media';
import {
  canViewAlbum,
  cleanAlbumInput,
  cleanItemInput,
  albumSlug,
  itemThumb,
  MAX_ITEMS_PER_ALBUM,
  type GalleryAlbum,
  type GalleryItem,
} from '../../shared/gallery';

const gallery = new Hono<AppContext>();

/** How many images the scroll hero samples. Enough to fill the whirl, small enough to stay cheap. */
const HERO_SAMPLE = 18;

async function galleryEnabled(env: AppContext['Bindings']): Promise<boolean> {
  const mods = await loadModules(env, db(env));
  return mods.gallery;
}

/** A row from gallery_albums, as stored. */
type AlbumRow = typeof s.galleryAlbums.$inferSelect;

/**
 * Shape a stored album for the API. `itemCount` and `coverUrl` are supplied by
 * the caller from aggregate queries rather than stored on the row, so deleting
 * the cover image can never leave a dangling reference.
 */
function toAlbum(row: AlbumRow, itemCount: number, coverUrl: string | null): GalleryAlbum {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    audience: row.audience,
    visibleToRole: row.visibleToRole,
    sortOrder: row.sortOrder,
    itemCount,
    coverUrl,
    updatedAt: row.updatedAt,
  };
}

function toItem(row: typeof s.galleryItems.$inferSelect): GalleryItem {
  return {
    id: row.id,
    albumId: row.albumId,
    kind: row.kind,
    url: row.url,
    src: row.src,
    provider: row.provider,
    thumbUrl: row.thumbUrl,
    width: row.width,
    height: row.height,
    caption: row.caption,
    alt: row.alt,
    sortOrder: row.sortOrder,
  };
}

/**
 * Per-album item counts and cover images in two aggregate queries, so listing
 * albums never pulls every item row. The cover is each album's first item by
 * the same ordering the album page uses.
 */
async function albumSummaries(database: ReturnType<typeof db>) {
  const [counts, covers] = await Promise.all([
    database
      .select({ albumId: s.galleryItems.albumId, n: sql<number>`count(*)` })
      .from(s.galleryItems)
      .groupBy(s.galleryItems.albumId),
    database
      .select({
        albumId: s.galleryItems.albumId,
        kind: s.galleryItems.kind,
        url: s.galleryItems.url,
        thumbUrl: s.galleryItems.thumbUrl,
        src: s.galleryItems.src,
      })
      .from(s.galleryItems)
      .where(
        sql`${s.galleryItems.id} = (
          select id from gallery_items inner_i
          where inner_i.album_id = ${s.galleryItems.albumId}
          order by inner_i.sort_order asc, inner_i.id asc
          limit 1
        )`,
      ),
  ]);

  const countBy = new Map<number, number>(counts.map((r) => [r.albumId, Number(r.n)]));
  const coverBy = new Map<number, string | null>(covers.map((r) => [r.albumId, itemThumb(r)]));
  return { countBy, coverBy };
}

/* ------------------------------------------------------------------ *
 * Public reads
 * ------------------------------------------------------------------ */

/**
 * Every album this viewer may see, in admin order. Anonymous visitors get the
 * public ones; the filter runs here so a members-only album is invisible rather
 * than merely un-clickable.
 */
gallery.get('/albums', async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer');
  const database = db(c.env);

  const rows = await database
    .select()
    .from(s.galleryAlbums)
    .orderBy(asc(s.galleryAlbums.sortOrder), asc(s.galleryAlbums.id));

  const visible = rows.filter((r) => canViewAlbum(r, viewer));
  const { countBy, coverBy } = await albumSummaries(database);

  return c.json({
    albums: visible.map((r) => toAlbum(r, countBy.get(r.id) ?? 0, coverBy.get(r.id) ?? null)),
  });
});

/**
 * A sample of images for the scroll hero. PUBLIC albums only — never anything
 * audience-gated, so the hero is identical for every viewer and can't become a
 * side channel that leaks a members-only photo to a logged-out visitor.
 * Randomised per request so the page feels alive between visits.
 */
gallery.get('/hero', async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);

  const rows = await db(c.env)
    .select({
      url: s.galleryItems.url,
      thumbUrl: s.galleryItems.thumbUrl,
      width: s.galleryItems.width,
      height: s.galleryItems.height,
      alt: s.galleryItems.alt,
    })
    .from(s.galleryItems)
    .innerJoin(s.galleryAlbums, eq(s.galleryItems.albumId, s.galleryAlbums.id))
    .where(sql`${s.galleryAlbums.audience} = 'public' and ${s.galleryItems.kind} = 'image'`)
    .orderBy(sql`random()`)
    .limit(HERO_SAMPLE);

  return c.json({
    images: rows.map((r) => ({
      url: r.thumbUrl || r.url,
      width: r.width,
      height: r.height,
      alt: r.alt,
    })),
  });
});

/**
 * One album and its items. A 404 (not a 403) for an album the viewer can't see:
 * the response shouldn't confirm that a members-only album exists at that slug.
 */
gallery.get('/albums/:slug', async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer');
  const database = db(c.env);

  const album = await database.query.galleryAlbums.findFirst({
    where: eq(s.galleryAlbums.slug, c.req.param('slug')),
  });
  if (!album || !canViewAlbum(album, viewer)) return c.json({ error: 'No such album.' }, 404);

  const items = await database
    .select()
    .from(s.galleryItems)
    .where(eq(s.galleryItems.albumId, album.id))
    .orderBy(asc(s.galleryItems.sortOrder), asc(s.galleryItems.id));

  return c.json({
    album: toAlbum(album, items.length, items[0] ? itemThumb(items[0]) : null),
    items: items.map(toItem),
  });
});

/* ------------------------------------------------------------------ *
 * Admin — everything below needs gallery.manage
 * ------------------------------------------------------------------ */

/**
 * The role list for the album audience picker. Gated on gallery.manage because
 * a gallery editor may hold neither roles.manage nor roles.assign, so /roles
 * isn't reachable to them. Non-sensitive — role names and colours already show
 * on the public roster. Mirrors /api/pages/meta/roles.
 */
gallery.get('/meta/roles', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const roles = await db(c.env)
    .select({ id: s.roles.id, name: s.roles.name, color: s.roles.color })
    .from(s.roles)
    .orderBy(asc(s.roles.sortOrder), asc(s.roles.name));
  return c.json({ roles });
});

/** Every album regardless of audience, for the editor. */
gallery.get('/admin/albums', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const database = db(c.env);
  const rows = await database
    .select()
    .from(s.galleryAlbums)
    .orderBy(asc(s.galleryAlbums.sortOrder), asc(s.galleryAlbums.id));
  const { countBy, coverBy } = await albumSummaries(database);
  return c.json({
    albums: rows.map((r) => toAlbum(r, countBy.get(r.id) ?? 0, coverBy.get(r.id) ?? null)),
  });
});

/** Every item in an album, ignoring audience — the editor must see what it edits. */
gallery.get('/admin/albums/:id/items', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const albumId = Number(c.req.param('id'));
  const items = await db(c.env)
    .select()
    .from(s.galleryItems)
    .where(eq(s.galleryItems.albumId, albumId))
    .orderBy(asc(s.galleryItems.sortOrder), asc(s.galleryItems.id));
  return c.json({ items: items.map(toItem) });
});

/**
 * A free slug derived from the title. Collisions get a numeric suffix rather
 * than an error — an admin naming two albums "Screenshots" shouldn't have to
 * care that slugs must be unique.
 */
async function freeSlug(database: ReturnType<typeof db>, title: string): Promise<string> {
  const base = albumSlug(title, `album-${Date.now().toString(36)}`);
  const taken = new Set(
    (await database.select({ slug: s.galleryAlbums.slug }).from(s.galleryAlbums)).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}-${n}`.slice(0, 64);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 64);
}

/** Confirm a role id actually exists, so an album can't be gated on a ghost. */
async function roleExists(database: ReturnType<typeof db>, roleId: number): Promise<boolean> {
  const row = await database.query.roles.findFirst({ where: eq(s.roles.id, roleId) });
  return !!row;
}

gallery.post('/albums', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const input = cleanAlbumInput(await c.req.json());
  if (!input) return c.json({ error: 'A title is required.' }, 400);

  const database = db(c.env);
  if (input.visibleToRole != null && !(await roleExists(database, input.visibleToRole))) {
    return c.json({ error: 'That role no longer exists.' }, 400);
  }

  const viewer = c.get('viewer')!;
  const slug = await freeSlug(database, input.title);
  const max = await database
    .select({ n: sql<number>`coalesce(max(${s.galleryAlbums.sortOrder}), -1)` })
    .from(s.galleryAlbums);

  const [created] = await database
    .insert(s.galleryAlbums)
    .values({
      slug,
      title: input.title,
      description: input.description,
      audience: input.audience,
      visibleToRole: input.visibleToRole,
      sortOrder: Number(max[0]?.n ?? -1) + 1,
      createdBy: viewer.id,
    })
    .returning();

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'gallery.album.create',
    targetType: 'gallery_album',
    targetId: String(created?.id ?? ''),
    meta: { title: input.title, audience: input.audience },
  });

  return c.json({ ok: true, album: created ? toAlbum(created, 0, null) : null }, 201);
});

gallery.patch('/albums/:id', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const id = Number(c.req.param('id'));
  const input = cleanAlbumInput(await c.req.json());
  if (!input) return c.json({ error: 'A title is required.' }, 400);

  const database = db(c.env);
  const existing = await database.query.galleryAlbums.findFirst({ where: eq(s.galleryAlbums.id, id) });
  if (!existing) return c.json({ error: 'No such album.' }, 404);
  if (input.visibleToRole != null && !(await roleExists(database, input.visibleToRole))) {
    return c.json({ error: 'That role no longer exists.' }, 400);
  }

  const viewer = c.get('viewer')!;
  await database
    .update(s.galleryAlbums)
    .set({
      title: input.title,
      description: input.description,
      audience: input.audience,
      visibleToRole: input.visibleToRole,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(s.galleryAlbums.id, id));

  // Worth an audit line of its own: widening an album's audience is the one
  // edit here that can expose content, so it should be greppable in the log.
  if (existing.audience !== input.audience || existing.visibleToRole !== input.visibleToRole) {
    await database.insert(s.auditLog).values({
      actorId: viewer.id,
      action: 'gallery.album.audience',
      targetType: 'gallery_album',
      targetId: String(id),
      meta: {
        from: existing.audience,
        to: input.audience,
        role: input.visibleToRole,
      },
    });
  }

  return c.json({ ok: true });
});

gallery.delete('/albums/:id', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const id = Number(c.req.param('id'));
  const database = db(c.env);

  // Read the media URLs first — the rows go away with the cascade, and R2 has no
  // foreign keys to clean up after us.
  const items = await database
    .select({ url: s.galleryItems.url, thumbUrl: s.galleryItems.thumbUrl, kind: s.galleryItems.kind })
    .from(s.galleryItems)
    .where(eq(s.galleryItems.albumId, id));

  await database.delete(s.galleryAlbums).where(eq(s.galleryAlbums.id, id));

  for (const it of items) {
    if (it.kind !== 'image') continue;
    await deleteMediaByUrl(c.env, it.url);
    await deleteMediaByUrl(c.env, it.thumbUrl);
  }

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'gallery.album.delete',
    targetType: 'gallery_album',
    targetId: String(id),
    meta: { items: items.length },
  });

  return c.json({ ok: true });
});

/** Reorder albums. Ids not in the list keep their place after the ones that are. */
gallery.put('/albums/order', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const body = await c.req.json<{ ids?: unknown }>();
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return c.json({ error: 'Nothing to reorder.' }, 400);

  const database = db(c.env);
  await Promise.all(
    ids.map((id, i) =>
      database.update(s.galleryAlbums).set({ sortOrder: i }).where(eq(s.galleryAlbums.id, id)),
    ),
  );
  return c.json({ ok: true });
});

/**
 * Add items to an album. Takes a batch so uploading twenty photos is one write,
 * and each is re-cleaned server-side — a video's embed src is always re-derived
 * here from the pasted URL, never taken from the client.
 */
gallery.post('/albums/:id/items', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const albumId = Number(c.req.param('id'));
  const database = db(c.env);

  const album = await database.query.galleryAlbums.findFirst({ where: eq(s.galleryAlbums.id, albumId) });
  if (!album) return c.json({ error: 'No such album.' }, 404);

  const body = await c.req.json<{ items?: unknown }>();
  const raw = Array.isArray(body.items) ? body.items : [];
  const cleaned = raw.map(cleanItemInput).filter((v): v is NonNullable<typeof v> => v !== null);
  if (cleaned.length === 0) {
    return c.json({ error: 'Nothing usable to add — an image needs an upload, a video a supported URL.' }, 400);
  }

  const [{ n: existing } = { n: 0 }] = await database
    .select({ n: sql<number>`count(*)` })
    .from(s.galleryItems)
    .where(eq(s.galleryItems.albumId, albumId));
  if (Number(existing) + cleaned.length > MAX_ITEMS_PER_ALBUM) {
    return c.json({ error: `An album holds at most ${MAX_ITEMS_PER_ALBUM} items.` }, 400);
  }

  const [max] = await database
    .select({ n: sql<number>`coalesce(max(${s.galleryItems.sortOrder}), -1)` })
    .from(s.galleryItems)
    .where(eq(s.galleryItems.albumId, albumId));
  const base = Number(max?.n ?? -1) + 1;

  const viewer = c.get('viewer')!;
  const inserted = await database
    .insert(s.galleryItems)
    .values(cleaned.map((it, i) => ({ ...it, albumId, sortOrder: base + i, createdBy: viewer.id })))
    .returning();

  await database
    .update(s.galleryAlbums)
    .set({ updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(s.galleryAlbums.id, albumId));

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'gallery.items.add',
    targetType: 'gallery_album',
    targetId: String(albumId),
    meta: { added: inserted.length, skipped: raw.length - cleaned.length },
  });

  return c.json({ ok: true, items: inserted.map(toItem), skipped: raw.length - cleaned.length }, 201);
});

/** Edit an item's caption / alt text. The media itself is immutable — replace it instead. */
gallery.patch('/items/:id', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ caption?: unknown; alt?: unknown }>();
  const text = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

  await db(c.env)
    .update(s.galleryItems)
    .set({ caption: text(body.caption, 200), alt: text(body.alt, 200) })
    .where(eq(s.galleryItems.id, id));
  return c.json({ ok: true });
});

gallery.delete('/items/:id', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const id = Number(c.req.param('id'));
  const database = db(c.env);

  const item = await database.query.galleryItems.findFirst({ where: eq(s.galleryItems.id, id) });
  if (!item) return c.json({ error: 'No such item.' }, 404);

  await database.delete(s.galleryItems).where(eq(s.galleryItems.id, id));
  if (item.kind === 'image') {
    await deleteMediaByUrl(c.env, item.url);
    await deleteMediaByUrl(c.env, item.thumbUrl);
  }
  return c.json({ ok: true });
});

/** Reorder items within one album. Ids are confirmed to belong to it first. */
gallery.put('/albums/:id/items/order', requirePermission('gallery.manage'), async (c) => {
  if (!(await galleryEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const albumId = Number(c.req.param('id'));
  const body = await c.req.json<{ ids?: unknown }>();
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return c.json({ error: 'Nothing to reorder.' }, 400);

  const database = db(c.env);
  // Only reorder rows that are really in this album, so a crafted id list can't
  // shuffle another album's items.
  const mine = new Set(
    (
      await database
        .select({ id: s.galleryItems.id })
        .from(s.galleryItems)
        .where(eq(s.galleryItems.albumId, albumId))
    ).map((r) => r.id),
  );

  await Promise.all(
    ids
      .filter((id) => mine.has(id))
      .map((id, i) => database.update(s.galleryItems).set({ sortOrder: i }).where(eq(s.galleryItems.id, id))),
  );
  return c.json({ ok: true });
});

export default gallery;
