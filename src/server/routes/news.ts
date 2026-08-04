/**
 * News / announcements.
 *
 * Posts move draft → published → archived. Writing a post needs news.create,
 * flipping its published state needs news.publish, and removing it needs
 * news.delete — so a trusted writer can draft without being able to publish.
 *
 * The body is HTML from the WYSIWYG editor; it's sanitized client-side on save
 * and again on render (see client/lib/richtext.ts), so nothing here trusts it.
 */

import { Hono } from 'hono';
import { and, desc, eq, ne } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { can } from '../../shared/permissions';
import { memberName } from '../../shared/names';

const news = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'post'
  );
}

/** A slug not already taken; disambiguates with -2, -3, … Optionally ignores one id (self on rename). */
async function uniqueSlug(
  database: ReturnType<typeof db>,
  base: string,
  ignoreId?: number,
): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clash = await database.query.news.findFirst({
      where: ignoreId ? and(eq(s.news.slug, slug), ne(s.news.id, ignoreId)) : eq(s.news.slug, slug),
    });
    if (!clash) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

const authorFields = {
  authorId: s.users.id,
  authorName: s.users.displayName,
  authorGlobalName: s.users.globalName,
  authorUsername: s.users.username,
};

function withAuthor<T extends { authorName: string | null; authorGlobalName: string | null; authorUsername: string | null }>(
  row: T,
) {
  const { authorName, authorGlobalName, authorUsername, ...rest } = row;
  return {
    ...rest,
    author: authorUsername
      ? memberName({ displayName: authorName, globalName: authorGlobalName, username: authorUsername })
      : null,
  };
}

/** The public feed: published posts only, pinned first, newest next. */
news.get('/', requireAuth, async (c) => {
  const rows = await db(c.env)
    .select({
      id: s.news.id,
      slug: s.news.slug,
      title: s.news.title,
      excerpt: s.news.excerpt,
      body: s.news.body,
      pinned: s.news.pinned,
      publishedAt: s.news.publishedAt,
      ...authorFields,
    })
    .from(s.news)
    .leftJoin(s.users, eq(s.news.authorId, s.users.id))
    .where(eq(s.news.status, 'published'))
    .orderBy(desc(s.news.pinned), desc(s.news.publishedAt));

  return c.json({ posts: rows.map(withAuthor) });
});

/** Every post regardless of status, for the admin list. */
news.get('/manage', requirePermission('news.create'), async (c) => {
  const rows = await db(c.env)
    .select({
      id: s.news.id,
      slug: s.news.slug,
      title: s.news.title,
      status: s.news.status,
      pinned: s.news.pinned,
      publishedAt: s.news.publishedAt,
      updatedAt: s.news.updatedAt,
      ...authorFields,
    })
    .from(s.news)
    .leftJoin(s.users, eq(s.news.authorId, s.users.id))
    .orderBy(desc(s.news.pinned), desc(s.news.updatedAt));

  return c.json({ posts: rows.map(withAuthor) });
});

/** A single post by slug. Non-published posts are only visible to writers. */
news.get('/:slug', requireAuth, async (c) => {
  const slug = c.req.param('slug');
  const rows = await db(c.env)
    .select({
      id: s.news.id,
      slug: s.news.slug,
      title: s.news.title,
      excerpt: s.news.excerpt,
      body: s.news.body,
      status: s.news.status,
      pinned: s.news.pinned,
      publishedAt: s.news.publishedAt,
      createdAt: s.news.createdAt,
      updatedAt: s.news.updatedAt,
      ...authorFields,
    })
    .from(s.news)
    .leftJoin(s.users, eq(s.news.authorId, s.users.id))
    .where(eq(s.news.slug, slug))
    .limit(1);

  const post = rows[0];
  if (!post) return c.json({ error: 'No such post' }, 404);
  if (post.status !== 'published' && !can(c.get('viewer'), 'news.create')) {
    return c.json({ error: 'No such post' }, 404);
  }

  return c.json({ post: withAuthor(post) });
});

news.post('/', requirePermission('news.create'), async (c) => {
  const body = await c.req.json<{ title?: string; excerpt?: string; body?: string; pinned?: boolean }>();
  if (!body.title?.trim()) return c.json({ error: 'A title is required' }, 400);

  const database = db(c.env);
  const viewer = c.get('viewer')!;
  const nowSec = now();
  const slug = await uniqueSlug(database, slugify(body.title));

  const created = (
    await database
      .insert(s.news)
      .values({
        title: body.title.trim().slice(0, 200),
        slug,
        excerpt: body.excerpt?.trim().slice(0, 500) || null,
        body: body.body ?? '',
        authorId: viewer.id,
        status: 'draft',
        pinned: body.pinned ?? false,
        createdAt: nowSec,
        updatedAt: nowSec,
      })
      .returning()
  )[0]!;

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'news.create',
    targetType: 'news',
    targetId: String(created.id),
    meta: { title: created.title },
  });

  return c.json({ post: created }, 201);
});

/** Edit content. Publishing state is changed via /:id/status, not here. */
news.patch('/:id', requirePermission('news.create'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    title?: string;
    excerpt?: string | null;
    body?: string;
    pinned?: boolean;
  }>();

  const database = db(c.env);
  const post = await database.query.news.findFirst({ where: eq(s.news.id, id) });
  if (!post) return c.json({ error: 'No such post' }, 404);

  const patch: Partial<typeof s.news.$inferInsert> = { updatedAt: now() };
  if (body.title !== undefined) {
    if (!body.title.trim()) return c.json({ error: 'Title cannot be empty' }, 400);
    patch.title = body.title.trim().slice(0, 200);
  }
  if (body.excerpt !== undefined) patch.excerpt = body.excerpt?.trim().slice(0, 500) || null;
  if (body.body !== undefined) patch.body = body.body;
  if (body.pinned !== undefined) patch.pinned = body.pinned;

  const updated = (await database.update(s.news).set(patch).where(eq(s.news.id, id)).returning())[0]!;
  return c.json({ post: updated });
});

/** Move a post between draft / published / archived. First publish stamps publishedAt. */
news.post('/:id/status', requirePermission('news.publish'), async (c) => {
  const id = Number(c.req.param('id'));
  const { status } = await c.req.json<{ status: string }>();
  const allowed = ['draft', 'published', 'archived'] as const;
  if (!allowed.includes(status as (typeof allowed)[number])) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const database = db(c.env);
  const post = await database.query.news.findFirst({ where: eq(s.news.id, id) });
  if (!post) return c.json({ error: 'No such post' }, 404);

  const patch: Partial<typeof s.news.$inferInsert> = {
    status: status as (typeof allowed)[number],
    updatedAt: now(),
  };
  // Stamp the publish date once, on first publish, so re-publishing an archived
  // post doesn't reset its original date.
  if (status === 'published' && post.publishedAt == null) patch.publishedAt = now();

  const updated = (await database.update(s.news).set(patch).where(eq(s.news.id, id)).returning())[0]!;

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'news.status',
    targetType: 'news',
    targetId: String(id),
    meta: { from: post.status, to: status },
  });

  return c.json({ post: updated });
});

news.delete('/:id', requirePermission('news.delete'), async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);
  const post = await database.query.news.findFirst({ where: eq(s.news.id, id) });
  if (!post) return c.json({ error: 'No such post' }, 404);

  await database.delete(s.news).where(eq(s.news.id, id));
  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'news.delete',
    targetType: 'news',
    targetId: String(id),
    meta: { title: post.title },
  });

  return c.json({ ok: true });
});

export default news;
