/**
 * Training-slide embed allowlist — the same safety rule as the video embeds
 * (shared/embeds.ts): an author pastes any Google Slides URL, but we NEVER echo
 * it into an <iframe src>. We match the presentation id with a strict pattern and
 * rebuild a canonical embed URL on the fixed docs.google.com origin. Anything
 * else returns null and the module shows a placeholder instead of framing it.
 *
 * v1 supports Google Slides only. The origin here is mirrored in the CSP
 * frame-src allowlist (public/_headers) and re-checked at render time.
 */

export const SLIDES_FRAME_ORIGIN = 'https://docs.google.com';

export type SlidesProvider = 'google-slides';

export interface ResolvedSlides {
  provider: SlidesProvider;
  src: string;
}

/** Accept only http(s); tolerate a scheme-less host. */
function parseUrl(raw: string): URL | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t)
    ? t
    : t.startsWith('//')
      ? `https:${t}`
      : /^[a-z][a-z0-9+.-]*:/i.test(t)
        ? t
        : `https://${t}`;
  try {
    const u = new URL(withProto);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Turn a pasted Google Slides link into a safe, canonical embed src, or null.
 * Handles both a normal doc link (/presentation/d/<id>/edit|preview|view|embed)
 * and a "Publish to web" link (/presentation/d/e/<pubId>/pub|embed).
 */
export function resolveSlides(raw: string): ResolvedSlides | null {
  const u = parseUrl(raw);
  if (!u) return null;
  if (u.hostname.replace(/^www\./i, '').toLowerCase() !== 'docs.google.com') return null;

  const published = u.pathname.match(/^\/presentation\/d\/e\/([A-Za-z0-9_-]+)/);
  if (published) return { provider: 'google-slides', src: `${SLIDES_FRAME_ORIGIN}/presentation/d/e/${published[1]}/embed` };

  const doc = u.pathname.match(/^\/presentation\/d\/([A-Za-z0-9_-]+)/);
  if (doc) return { provider: 'google-slides', src: `${SLIDES_FRAME_ORIGIN}/presentation/d/${doc[1]}/embed` };

  return null;
}

/** Belt-and-suspenders: is this an embed URL we produced, on the known origin? */
export function isAllowedSlidesSrc(src: unknown): src is string {
  return (
    typeof src === 'string' &&
    src.startsWith(`${SLIDES_FRAME_ORIGIN}/`) &&
    /\/presentation\/d\/(e\/)?[A-Za-z0-9_-]+\/embed$/.test(src)
  );
}
