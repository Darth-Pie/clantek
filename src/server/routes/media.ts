/**
 * Image uploads, backed by R2.
 *
 * Uploads come in through POST /api/media/<category> (each category is
 * permission-gated) and are served back out at /media/<key> — a path
 * deliberately outside /api so the no-store middleware doesn't apply and the
 * browser/edge can cache them hard. See the run_worker_first note in
 * wrangler.jsonc for why /media/* must reach the Worker rather than the assets
 * layer.
 */

import { Hono } from 'hono';
import type { AppContext, Env } from '../env';
import { requireAuth } from '../middleware/auth';
import { can, type Permission } from '../../shared/permissions';

// Raster only. An uploaded SVG served from our own origin can execute script
// when opened directly (it's an XSS vector); PNG/JPEG/GIF/WebP shown in an
// <img> cannot. The map also fixes the file extension we store under.
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const MAX_BYTES = 1_000_000; // 1 MB — these are small insignia/avatars, not photos.

// What can be uploaded, where it's stored, and who may upload it. An avatar is
// self-service (any signed-in member can set their own), so it has no extra
// permission beyond being authenticated; medal and rank art are admin-only.
const CATEGORIES: Record<string, { prefix: string; permission?: Permission }> = {
  medals: { prefix: 'medals', permission: 'medals.manage' },
  ranks: { prefix: 'ranks', permission: 'ranks.manage' },
  avatars: { prefix: 'avatars' },
  games: { prefix: 'games', permission: 'games.manage' },
  warrecords: { prefix: 'warrecords', permission: 'warrecords.manage' },
  events: { prefix: 'events', permission: 'events.manage' },
  pages: { prefix: 'pages', permission: 'pages.manage' },
  branding: { prefix: 'branding', permission: 'settings.manage' },
};

const media = new Hono<AppContext>();

/**
 * Store an uploaded image and return its stable URL. Multipart form with a
 * single `file` field; the :category path segment selects the storage prefix
 * and the permission required to write it.
 */
media.post('/:category', requireAuth, async (c) => {
  const conf = CATEGORIES[c.req.param('category')];
  if (!conf) return c.json({ error: 'Unknown upload category.' }, 404);

  const viewer = c.get('viewer')!;
  if (conf.permission && !can(viewer, conf.permission)) {
    return c.json({ error: 'Forbidden', missing: conf.permission }, 403);
  }

  if (!c.env.MEDIA) {
    return c.json({ error: 'Image storage (R2) is not configured on this deployment.' }, 503);
  }

  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return c.json({ error: 'No file provided.' }, 400);
  }

  const ext = ALLOWED[file.type];
  if (!ext) {
    return c.json({ error: 'Unsupported image type. Use PNG, JPEG, GIF, or WebP.' }, 415);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: 'Image is too large (max 1 MB).' }, 413);
  }

  const key = `${conf.prefix}/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  return c.json({ url: `/media/${key}`, key }, 201);
});

export default media;

/**
 * Delete the R2 object a /media/… URL points at. Used to clean up the previous
 * image when one is replaced or its owner is deleted, so orphaned objects don't
 * accumulate against the storage quota. A no-op for anything that isn't one of
 * our own /media/ URLs (e.g. a null value, or a Discord avatar URL). Best
 * effort — a failed delete is logged, never fatal to the request.
 */
export async function deleteMediaByUrl(env: Env, url: string | null | undefined): Promise<void> {
  if (!env.MEDIA || !url) return;
  const prefix = '/media/';
  if (!url.startsWith(prefix)) return;
  const key = url.slice(prefix.length);
  if (!key) return;
  try {
    await env.MEDIA.delete(key);
  } catch (err) {
    console.error('Failed to delete media object', key, err);
  }
}

/**
 * Serve one R2 object for the /media/* route (registered in index.ts, outside
 * the /api middleware). Keys are content-addressed and never reused, so the
 * response is immutable and cached for a year.
 *
 * The Cache API is checked first and populated on a miss, so a hot image is
 * answered from the colo's edge cache without a round-trip to R2 — which is
 * what keeps R2 Class B (read) operations flat as traffic grows. Returns null
 * when the object is absent so the caller can 404.
 */
export async function serveMediaObject(
  env: Env,
  request: Request,
  ctx: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response | null> {
  if (!env.MEDIA) return null;

  const key = new URL(request.url).pathname.slice('/media/'.length);
  if (!key) return null;

  // caches.default is a Workers global; the DOM lib's CacheStorage type (pulled
  // in for React) doesn't declare it, so reach it through a narrow cast.
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const object = await env.MEDIA.get(key);
  if (!object) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // writeHttpMetadata carries the stored cache-control, but set a floor in case
  // an older object was stored without one.
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }
  headers.set('x-content-type-options', 'nosniff');

  const response = new Response(object.body, { headers });
  // Populate the edge cache without holding up the response.
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}
