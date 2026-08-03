import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';

const settings = new Hono<AppContext>();

/** Public — the theme has to load before anyone signs in. */
settings.get('/theme', async (c) => {
  const row = await db(c.env).query.settings.findFirst({ where: eq(s.settings.key, 'theme') });
  return c.json({ theme: (row?.value as Record<string, string>) ?? {} });
});

settings.put('/theme', requirePermission('theme.manage'), async (c) => {
  const { theme } = await c.req.json<{ theme: Record<string, string> }>();

  // Only CSS custom properties are storable, so a rogue key cannot become a
  // selector or a declaration when the client applies these.
  const clean = Object.fromEntries(
    Object.entries(theme ?? {}).filter(
      ([k, v]) => k.startsWith('--') && typeof v === 'string' && !v.includes('}'),
    ),
  );

  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: 'theme', value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  return c.json({ ok: true, theme: clean });
});

settings.get('/site', async (c) => {
  const row = await db(c.env).query.settings.findFirst({ where: eq(s.settings.key, 'site') });
  return c.json({ site: row?.value ?? {} });
});

settings.put('/site', requirePermission('settings.manage'), async (c) => {
  const { site } = await c.req.json<{ site: Record<string, unknown> }>();
  const viewer = c.get('viewer')!;

  await db(c.env)
    .insert(s.settings)
    .values({ key: 'site', value: site, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: site, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  return c.json({ ok: true });
});

export default settings;
