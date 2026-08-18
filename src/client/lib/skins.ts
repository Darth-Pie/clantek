/**
 * UI Skins — a "surface style" layer that sits on top of the colour theme.
 *
 * The theme (lib/theme.tsx) owns colour, type, radius and nav alignment. A skin
 * owns *surface character*: whether panels have borders, shadows, frosted glass,
 * sharp or soft edges. The two are orthogonal — any colour theme combines with
 * any skin — because a skin only remaps a small set of `--surface-*` CSS
 * variables that the surface classes consume (see the "UI Skins" block in
 * styles.css).
 *
 * The chosen skin rides inside the theme settings blob as a plain `--skin` token
 * (so it persists, loads publicly before sign-in, and is edited in the Theme
 * admin with no extra server route). lib/theme.tsx turns that token into a
 * `data-skin` attribute on <html>, which the CSS keys off.
 */

export interface SkinDef {
  key: string;
  label: string;
  /** One-line description for the picker. */
  desc: string;
}

export const SKINS: SkinDef[] = [
  { key: 'classic', label: 'Classic', desc: 'Balanced panels with a hairline border. The original look.' },
  { key: 'soft', label: 'Soft', desc: 'Borderless cards that float on gentle shadows. Rounder, friendlier.' },
  { key: 'sharp', label: 'Sharp', desc: 'Squared corners and crisp lines. Dense and utilitarian.' },
  { key: 'glass', label: 'Glass', desc: 'Frosted, translucent panels with a subtle blur. Sleek.' },
  { key: 'neon', label: 'Neon', desc: 'Accent-lit borders with a soft glow. Built for gamers.' },
  { key: 'flat', label: 'Flat', desc: 'No borders or shadows — clean, lifted panels.' },
];

export const SKIN_KEYS = SKINS.map((s) => s.key);

export const DEFAULT_SKIN = 'classic';

/** Normalise an arbitrary value to a known skin key (defaults to classic). */
export function cleanSkin(v: unknown): string {
  return typeof v === 'string' && SKIN_KEYS.includes(v) ? v : DEFAULT_SKIN;
}
