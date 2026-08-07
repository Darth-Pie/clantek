/**
 * SEO / social meta — the settings-driven <head> the Worker injects into the
 * served index.html so it is correct for crawlers AND social scrapers (Discord,
 * Google, Facebook, X), which read the raw HTML and never run the React app.
 *
 * Everything an operator sets here is untrusted, so every value is HTML-escaped
 * and URLs are validated before they reach a tag — robust per-tenant
 * customisation that can never inject script into their own <head>. The real
 * security headers (CSP, etc.) stay in the response headers, not here.
 */

import { loadConfig } from './config';
import type { Env } from './env';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import * as s from '../db/schema';

export const SEO_KEY = 'seo';

type DB = ReturnType<typeof drizzle<typeof schema>>;

/** The persisted, all-optional SEO blob (settings['seo']). */
export interface StoredSeo {
  description?: string;
  keywords?: string;
  noindex?: boolean;
  themeColor?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterHandle?: string;
  googleVerification?: string;
  bingVerification?: string;
  social?: {
    discord?: string;
    youtube?: string;
    twitch?: string;
    twitter?: string;
    instagram?: string;
    facebook?: string;
    website?: string;
  };
}

export interface ResolvedSeo extends StoredSeo {
  siteName: string;
  siteUrl: string;
  /** Uploaded favicon (browser-tab icon), from the branding `site` blob. */
  favicon: string;
}

const SOCIAL_KEYS = ['discord', 'youtube', 'twitch', 'twitter', 'instagram', 'facebook', 'website'] as const;

/** siteName + siteUrl (from identity) plus the stored SEO blob, sanitised. */
export async function loadSeo(env: Env, database?: DB): Promise<ResolvedSeo> {
  const dbi = database ?? drizzle(env.DB, { schema });
  const cfg = await loadConfig(env, dbi);
  let stored: StoredSeo = {};
  let favicon = '';
  try {
    const row = await dbi.query.settings.findFirst({ where: eq(s.settings.key, SEO_KEY) });
    if (row?.value && typeof row.value === 'object') stored = row.value as StoredSeo;
  } catch {
    // no settings row yet
  }
  try {
    const site = await dbi.query.settings.findFirst({ where: eq(s.settings.key, 'site') });
    const raw = (site?.value as { faviconUrl?: unknown } | undefined)?.faviconUrl;
    favicon = safeUrl(typeof raw === 'string' ? raw : '');
  } catch {
    // no branding row yet
  }
  return { ...stored, siteName: cfg.siteName || 'mustr', siteUrl: cfg.siteUrl || '', favicon };
}

/* --------------------------- validation --------------------------- */

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function safeUrl(v: string): string {
  const t = v.trim();
  if (/^https?:\/\//i.test(t)) return t.slice(0, 400);
  if (t.startsWith('/') && !t.startsWith('//')) return t.slice(0, 400);
  return '';
}
function hexColor(v: string): string {
  const t = v.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(t) ? t : '';
}

/** Validate + merge an SEO update (all fields optional; blanks clear). */
export function mergeSeo(incoming: unknown): StoredSeo {
  const o = (incoming ?? {}) as Record<string, unknown>;
  const inSocial = (o.social ?? {}) as Record<string, unknown>;
  const social: StoredSeo['social'] = {};
  for (const k of SOCIAL_KEYS) {
    const u = safeUrl(str(inSocial[k], 400));
    if (u) social[k] = u;
  }
  const rawHandle = str(o.twitterHandle, 40).replace(/[^A-Za-z0-9_@]/g, '');
  return {
    description: str(o.description, 300),
    keywords: str(o.keywords, 300),
    noindex: o.noindex === true,
    themeColor: hexColor(str(o.themeColor, 9)),
    ogImage: safeUrl(str(o.ogImage, 400)),
    ogTitle: str(o.ogTitle, 120),
    ogDescription: str(o.ogDescription, 300),
    // Store as a single-@ handle, or '' when blank.
    twitterHandle: rawHandle ? '@' + rawHandle.replace(/^@+/, '') : '',
    googleVerification: str(o.googleVerification, 200),
    bingVerification: str(o.bingVerification, 200),
    social,
  };
}

/* --------------------------- rendering ---------------------------- */

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Absolute URL for og:image etc. — same-origin "/media/…" gets the site origin. */
function absolute(siteUrl: string, u: string): string {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/') && siteUrl) return siteUrl.replace(/\/$/, '') + u;
  return '';
}

export interface HeadInjection {
  /** New <title> text (already escaped). */
  title: string;
  /** New content for the existing theme-color meta, or '' to leave it. */
  themeColor: string;
  /** HTML string of extra tags to append into <head> (all escaped/validated). */
  tags: string;
  /** Href for the tab icon (escaped, absolute), or '' to keep the default. */
  favicon: string;
}

/** Build the (escaped) head pieces the Worker injects for a given config. */
export function renderHead(seo: ResolvedSeo): HeadInjection {
  const name = seo.siteName;
  const title = seo.ogTitle || name;
  const desc = seo.description || '';
  const ogTitle = seo.ogTitle || name;
  const ogDesc = seo.ogDescription || desc;
  const ogImage = absolute(seo.siteUrl, seo.ogImage || '');
  const lines: string[] = [];

  const meta = (attr: 'name' | 'property', key: string, content: string) => {
    if (content) lines.push(`<meta ${attr}="${esc(key)}" content="${esc(content)}">`);
  };

  if (desc) meta('name', 'description', desc);
  if (seo.keywords) meta('name', 'keywords', seo.keywords);
  meta('name', 'robots', seo.noindex ? 'noindex, nofollow' : 'index, follow');
  if (seo.googleVerification) meta('name', 'google-site-verification', seo.googleVerification);
  if (seo.bingVerification) meta('name', 'msvalidate.01', seo.bingVerification);

  // Open Graph — powers Discord/Facebook/etc. link previews.
  meta('property', 'og:site_name', name);
  meta('property', 'og:type', 'website');
  meta('property', 'og:title', ogTitle);
  if (ogDesc) meta('property', 'og:description', ogDesc);
  if (seo.siteUrl) meta('property', 'og:url', seo.siteUrl);
  if (ogImage) meta('property', 'og:image', ogImage);

  // Twitter/X card.
  meta('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary');
  meta('name', 'twitter:title', ogTitle);
  if (ogDesc) meta('name', 'twitter:description', ogDesc);
  if (ogImage) meta('name', 'twitter:image', ogImage);
  if (seo.twitterHandle && seo.twitterHandle !== '@') meta('name', 'twitter:site', seo.twitterHandle);

  // JSON-LD Organization — additive, helps search + rich results.
  const sameAs = Object.values(seo.social ?? {}).filter(Boolean);
  const org: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'Organization', name };
  if (seo.siteUrl) org.url = seo.siteUrl;
  if (ogImage) org.logo = ogImage;
  if (sameAs.length) org.sameAs = sameAs;
  // Escape "</" so the JSON can't close the <script> early.
  const jsonLd = JSON.stringify(org).replace(/</g, '\\u003c');
  lines.push(`<script type="application/ld+json">${jsonLd}</script>`);

  // Favicon (tab icon) — absolute so it resolves the same for crawlers.
  const favicon = esc(absolute(seo.siteUrl, seo.favicon || '') || seo.favicon || '');

  return { title: esc(title), themeColor: seo.themeColor || '', tags: lines.join(''), favicon };
}
