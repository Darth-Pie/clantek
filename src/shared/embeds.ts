/**
 * Video-embed allowlist — the security core of the "Video embed" module.
 *
 * The rule that keeps this safe: an author pastes *any* URL, but we NEVER echo
 * that string into an <iframe src>. Instead we match the URL against a small set
 * of known providers, extract only an id/slug/channel with a strict character
 * pattern, and rebuild a canonical embed URL from a fixed template on a hardcoded
 * origin. So the only things that can ever reach an iframe are:
 *   - one of the fixed origins in EMBED_FRAME_ORIGINS, and
 *   - an id that already passed a `^[\w-]+$`-style test.
 * A `javascript:` URL, a data: URI, or a link to some other origin simply fails
 * to match and resolveEmbed() returns null — the module then shows a placeholder
 * instead of framing anything. This is why the sanitized-HTML module forbids
 * <iframe> entirely: embeds only ever happen through this validated path.
 */

/**
 * The page hosts Twitch will accept as the embedding parent. Twitch refuses to
 * load its player unless the embedder's hostname is declared here, and it allows
 * several. Production + localhost (for dev) cover our cases.
 */
export const EMBED_PARENTS = ['clantek.919gaming.com', 'localhost'];

/**
 * Every origin an embed iframe can load from. This list is the single source of
 * truth: it's mirrored in the CSP `frame-src` allowlist (public/_headers) and
 * re-checked at render time before an iframe is emitted. Adding a provider means
 * adding its origin here (and a matcher below) — one place.
 */
export const EMBED_FRAME_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://player.twitch.tv',
  'https://clips.twitch.tv',
  'https://player.vimeo.com',
  'https://streamable.com',
] as const;

export type EmbedProvider = 'youtube' | 'twitch' | 'vimeo' | 'streamable';

export interface ResolvedEmbed {
  provider: EmbedProvider;
  /** A canonical https embed URL on one of EMBED_FRAME_ORIGINS. */
  src: string;
}

/** Parse loosely (accept a bare "youtu.be/…" without a scheme) but only http(s). */
function parseUrl(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  // Normalize to an absolute https URL: keep an existing http(s) scheme, treat a
  // protocol-relative "//host/…" as https, and prepend https:// to a bare host.
  const withProto = /^https?:\/\//i.test(t)
    ? t
    : t.startsWith('//')
      ? `https:${t}`
      : /^[a-z][a-z0-9+.-]*:/i.test(t)
        ? t // some other scheme (javascript:, data:, mailto:) — let the guard below reject it
        : `https://${t}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u;
  } catch {
    return null;
  }
}

/** Host without a leading www., lowercased. */
function host(u: URL): string {
  return u.hostname.replace(/^www\./i, '').toLowerCase();
}

function twitchParents(): string {
  return EMBED_PARENTS.map((p) => `parent=${encodeURIComponent(p)}`).join('&');
}

function youtube(u: URL): string | null {
  const h = host(u);
  const id = (() => {
    if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] ?? '';
    if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v') ?? '';
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      return m ? m[1]! : '';
    }
    return '';
  })();
  // YouTube ids are exactly 11 URL-safe base64 chars.
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

function twitch(u: URL): string | null {
  const h = host(u);
  const parents = twitchParents();

  if (h === 'clips.twitch.tv') {
    const slug = u.pathname.slice(1).split('/')[0] ?? '';
    return /^[A-Za-z0-9_-]{1,120}$/.test(slug)
      ? `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&${parents}`
      : null;
  }

  if (h === 'twitch.tv' || h === 'm.twitch.tv' || h === 'player.twitch.tv') {
    const vid = u.pathname.match(/^\/videos\/(\d{1,20})/);
    if (vid) return `https://player.twitch.tv/?video=${vid[1]}&${parents}`;

    const clip = u.pathname.match(/^\/[A-Za-z0-9_]{1,40}\/clip\/([A-Za-z0-9_-]{1,120})/);
    if (clip) return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip[1]!)}&${parents}`;

    const qVideo = u.searchParams.get('video');
    if (qVideo && /^\d{1,20}$/.test(qVideo)) return `https://player.twitch.tv/?video=${qVideo}&${parents}`;

    const qChannel = u.searchParams.get('channel');
    if (qChannel && /^[A-Za-z0-9_]{1,40}$/.test(qChannel))
      return `https://player.twitch.tv/?channel=${encodeURIComponent(qChannel)}&${parents}`;

    // A bare /<channel> path — but not Twitch's own non-channel sections.
    const ch = u.pathname.match(/^\/([A-Za-z0-9_]{1,40})\/?$/);
    const reserved = ['videos', 'directory', 'settings', 'downloads', 'subscriptions', 'p', 'jobs', 'turbo'];
    if (ch && !reserved.includes(ch[1]!.toLowerCase()))
      return `https://player.twitch.tv/?channel=${ch[1]}&${parents}`;

    return null;
  }

  return null;
}

function vimeo(u: URL): string | null {
  if (host(u) !== 'vimeo.com' && host(u) !== 'player.vimeo.com') return null;
  const m = u.pathname.match(/\/(\d{6,15})(?:\/|$)/);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}

function streamable(u: URL): string | null {
  if (host(u) !== 'streamable.com') return null;
  const m = u.pathname.match(/^\/(?:e\/)?([A-Za-z0-9]{3,20})/);
  return m ? `https://streamable.com/e/${m[1]}` : null;
}

const MATCHERS: { provider: EmbedProvider; fn: (u: URL) => string | null }[] = [
  { provider: 'youtube', fn: youtube },
  { provider: 'twitch', fn: twitch },
  { provider: 'vimeo', fn: vimeo },
  { provider: 'streamable', fn: streamable },
];

/**
 * Turn a user-pasted URL into a safe, canonical embed, or null if it isn't a
 * supported provider. The returned `src` is always on an EMBED_FRAME_ORIGINS host.
 */
export function resolveEmbed(raw: string): ResolvedEmbed | null {
  if (typeof raw !== 'string') return null;
  const u = parseUrl(raw);
  if (!u) return null;
  for (const { provider, fn } of MATCHERS) {
    const src = fn(u);
    if (src) return { provider, src };
  }
  return null;
}

/** Belt-and-suspenders: is this string an embed URL on a known origin? */
export function isAllowedEmbedSrc(src: unknown): src is string {
  return typeof src === 'string' && EMBED_FRAME_ORIGINS.some((o) => src.startsWith(`${o}/`));
}
