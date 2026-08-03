/**
 * Image uploads, backed by R2.
 *
 * Uploads come in through POST /api/media (permission-gated) and are served
 * back out at /media/<key> — a path deliberately outside /api so the no-store
 * middleware doesn't apply and the browser/edge can cache them hard. See the
 * run_worker_first note in wrangler.jsonc for why /media/* must reach the
 * Worker rather than the assets layer.
 */

import { Hono } from 'hono';
import type { AppContext, Env } from '../env';
import { requirePermission } from '../middleware/auth';

// Raster only. An uploaded SVG served from our own origin can execute script
// when opened directly (it's an XSS vector); PNG/JPEG/GIF/WebP shown in an
// <img> cannot. The map also fixes the file extension we store under.
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const MAX_BYTES = 1_000_000; // 1 MB — these are small insignia, not photos.

const media = new Hono<AppContext>();

/**
 * Store an uploaded image and return its stable URL. Multipart form with a
 * single `file` field. Gated on medals.manage today because medals are the only
 * caller; widen if avatars/rank art start using it.
 */
media.post('/', requirePermission('medals.manage'), async (c) => {
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

  const key = `medals/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  return c.json({ url: `/media/${key}`, key }, 201);
});

export default media;

/**
 * Serve one R2 object for the /media/* route (registered in index.ts, outside
 * the /api middleware). Keys are content-addressed and never reused, so the
 * response is immutable and cached for a year. Returns null when absent so the
 * caller can 404.
 */
export async function serveMediaObject(env: Env, key: string): Promise<Response | null> {
  if (!env.MEDIA) return null;
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
  return new Response(object.body, { headers });
}
