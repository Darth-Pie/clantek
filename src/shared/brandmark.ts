/**
 * Brandmark — an animated version of the org's mark that plays as a boot splash
 * when the site loads. Config lives under the public `brandmark` settings key
 * (public so the splash can play before anyone signs in, like the theme/logo).
 *
 * This is the first slice of the "Sigil Forge" logo-animator: it animates an
 * uploaded image (or the header logo) with one of a few particle/reveal styles.
 * The full studio (compose, trace, 11 styles) is a later phase.
 */

export type BrandmarkArchetype = 'assemble' | 'constellation' | 'dissolve' | 'wipe';

export const BRANDMARK_ARCHETYPES: BrandmarkArchetype[] = ['assemble', 'constellation', 'dissolve', 'wipe'];

export interface BrandmarkConfig {
  /** Off by default — an install opts in from the Brandmark admin tab. */
  enabled: boolean;
  archetype: BrandmarkArchetype;
  /** Dedicated mark image (R2 URL). Blank falls back to the header logo. */
  imageUrl: string;
  /** Animation speed multiplier (0.5–2). */
  speed: number;
  /** Particle count for the point-cloud styles (60–240). */
  density: number;
  /** Accent hex for particles; blank means "use the theme accent". */
  accent: string;
}

export const DEFAULT_BRANDMARK: BrandmarkConfig = {
  enabled: false,
  archetype: 'assemble',
  imageUrl: '',
  speed: 1,
  density: 140,
  accent: '',
};

/** Same-origin ("/media/…") or absolute http(s) only — never javascript:/data:/protocol-relative. */
function cleanUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  if (!t) return '';
  if (t.startsWith('/') && !t.startsWith('//')) return t.slice(0, 500);
  if (/^https?:\/\//i.test(t)) return t.slice(0, 500);
  return '';
}

/** A 3- or 6-digit hex colour, or '' — never an arbitrary CSS value. */
function cleanHex(v: unknown): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? t : '';
}

function clamp(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}

/** Validate/normalise stored or submitted config — never trust the raw blob. */
export function sanitizeBrandmark(raw: unknown): BrandmarkConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const archetype = BRANDMARK_ARCHETYPES.includes(r.archetype as BrandmarkArchetype)
    ? (r.archetype as BrandmarkArchetype)
    : DEFAULT_BRANDMARK.archetype;
  return {
    enabled: r.enabled === true,
    archetype,
    imageUrl: cleanUrl(r.imageUrl),
    speed: clamp(r.speed, 0.5, 2, DEFAULT_BRANDMARK.speed),
    density: Math.round(clamp(r.density, 60, 240, DEFAULT_BRANDMARK.density)),
    accent: cleanHex(r.accent),
  };
}
