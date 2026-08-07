/**
 * Site footer — a small, per-install editable strip shown on every page.
 *
 * Deliberately lean: a short blurb (rendered as sanitised HTML), a handful of
 * links, and a copyright line. Stored as one settings blob so each deployment
 * edits its own footer; a fresh install ships the default below (which carries
 * the non-affiliation / trademark notice, so every instance starts compliant).
 */

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterConfig {
  /** Short blurb, rendered as sanitised HTML (e.g. a disclaimer line). */
  text: string;
  links: FooterLink[];
  /** Free-text copyright; blank ⇒ the client shows "© {year} {siteName}". */
  copyright: string;
}

/**
 * What a brand-new install shows before anyone edits it: the trademark /
 * non-affiliation notice plus a link to the legal page. Kept generic (no org
 * name) so it's sane for any deployment of the product.
 */
export const DEFAULT_FOOTER: FooterConfig = {
  text:
    'Star Citizen®, Roberts Space Industries®, and Cloud Imperium® are trademarks of Cloud Imperium Rights LLC. ' +
    'This site is an unofficial community tool and is not affiliated with, endorsed, or sponsored by Cloud Imperium Games or Roberts Space Industries.',
  links: [
    { label: 'Legal', href: '/legal' },
    { label: 'Open-Source Licenses', href: '/third-party-notices.txt' },
  ],
  copyright: '',
};

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Accept only same-origin paths ("/…") and absolute http(s) URLs — everything
 * else (javascript:, data:, protocol-relative) becomes empty, so a stored href
 * can never smuggle a script into an <a href>.
 */
function cleanUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  if (!t) return '';
  if (t.startsWith('/') && !t.startsWith('//')) return t.slice(0, 300);
  if (/^https?:\/\//i.test(t)) return t.slice(0, 300);
  return '';
}

/** Coerce arbitrary JSON into a valid, bounded FooterConfig. */
export function cleanFooter(raw: unknown): FooterConfig {
  const o = asObject(raw);
  const text = typeof o.text === 'string' ? o.text.slice(0, 2000) : '';
  const links = (Array.isArray(o.links) ? o.links : [])
    .slice(0, 12)
    .map((l) => {
      const lo = asObject(l);
      return {
        label: (typeof lo.label === 'string' ? lo.label : '').slice(0, 60),
        href: cleanUrl(lo.href),
      };
    })
    .filter((l) => l.label && l.href);
  const copyright = typeof o.copyright === 'string' ? o.copyright.slice(0, 200) : '';
  return { text, links, copyright };
}
