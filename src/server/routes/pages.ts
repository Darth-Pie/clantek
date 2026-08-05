/**
 * Page layouts — the drag-and-drop module arrangement for the standard pages
 * (home, …). GET is public because the home page renders for everyone; PUT is
 * gated on `pages.manage`. The stored JSON is always structurally sanitized
 * (see shared/layout.ts) so a corrupt or hostile payload can never reach the
 * renderer; rich-text html inside a module is sanitized client-side on save and
 * again on render, exactly like news bodies.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { defaultLayout, sanitizeLayout, EDITABLE_PAGES } from '../../shared/layout';

const pages = new Hono<AppContext>();

/** The list of pages that have an editable layout (for the admin picker). */
pages.get('/', async (c) => {
  return c.json({ pages: EDITABLE_PAGES });
});

/** Public: the layout for a page, falling back to the built-in default. */
pages.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const row = await db(c.env).query.pageLayouts.findFirst({
    where: eq(s.pageLayouts.slug, slug),
  });
  const layout = row ? sanitizeLayout(row.layout) : defaultLayout(slug);
  return c.json({ slug, layout, customized: !!row });
});

pages.put('/:slug', requirePermission('pages.manage'), async (c) => {
  const slug = c.req.param('slug');
  if (!EDITABLE_PAGES.some((p) => p.slug === slug)) {
    return c.json({ error: 'Unknown page.' }, 404);
  }

  const body = await c.req.json<{ layout?: unknown }>();
  const layout = sanitizeLayout(body.layout);
  const viewer = c.get('viewer')!;
  const title = EDITABLE_PAGES.find((p) => p.slug === slug)?.title ?? slug;
  const now = Math.floor(Date.now() / 1000);

  await db(c.env)
    .insert(s.pageLayouts)
    .values({ slug, title, layout, updatedBy: viewer.id, updatedAt: now })
    .onConflictDoUpdate({
      target: s.pageLayouts.slug,
      set: { layout, title, updatedBy: viewer.id, updatedAt: now },
    });

  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'page.layout',
    targetType: 'page',
    targetId: slug,
    meta: { rows: layout.rows.length },
  });

  return c.json({ ok: true, slug, layout });
});

/** Reset a page back to its built-in default by removing the stored override. */
pages.delete('/:slug', requirePermission('pages.manage'), async (c) => {
  const slug = c.req.param('slug');
  const viewer = c.get('viewer')!;
  await db(c.env).delete(s.pageLayouts).where(eq(s.pageLayouts.slug, slug));
  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'page.reset',
    targetType: 'page',
    targetId: slug,
  });
  return c.json({ ok: true, slug, layout: defaultLayout(slug) });
});

export default pages;
