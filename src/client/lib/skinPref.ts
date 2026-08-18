/**
 * Personal skin override — per-user, per-device (localStorage), layered on top of
 * the org's default skin (which the operator sets in the Theme admin and ships in
 * the theme blob as `--skin`; see lib/skins.ts + lib/theme.tsx).
 *
 * A member can pick their own surface style for themselves without changing what
 * anyone else sees — the same "personal display preference" idea as the a11y
 * font-size / high-contrast settings (lib/a11y.ts). When set, the personal skin
 * wins; when cleared, the site falls back to the org default.
 *
 * Both the org skin and the personal override resolve to the one `data-skin`
 * attribute on <html> that the CSS keys off.
 */

import { SKIN_KEYS, DEFAULT_SKIN } from './skins';

const KEY = 'ct-skin';

/** The member's personal skin, or null to follow the org default. */
export function loadSkinPref(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && SKIN_KEYS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/** Persist (or clear, when null) the personal skin. */
export function saveSkinPref(skin: string | null): void {
  try {
    if (skin && SKIN_KEYS.includes(skin)) localStorage.setItem(KEY, skin);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode — still applies for the session via the caller */
  }
}

/** Set the data-skin attribute from an effective skin key (classic clears it). */
function setSkinAttr(skin: string): void {
  const root = document.documentElement;
  if (skin && skin !== DEFAULT_SKIN && SKIN_KEYS.includes(skin)) root.setAttribute('data-skin', skin);
  else root.removeAttribute('data-skin');
}

/** Resolve + apply the effective skin: personal override wins over the org default. */
export function applyEffectiveSkin(orgSkin: string): void {
  if (typeof document === 'undefined') return;
  setSkinAttr(loadSkinPref() ?? orgSkin);
}

/**
 * Apply a personal skin as early as possible (before the theme loads) so a member
 * who has overridden it never sees a flash of the org skin. No-ops when there's no
 * override — the theme provider will then apply the org default.
 */
export function applySkinPrefEarly(): void {
  if (typeof document === 'undefined') return;
  const personal = loadSkinPref();
  if (personal) setSkinAttr(personal);
}

/** Re-apply after the member changes their pref, reading the org skin off :root. */
export function reapplySkin(): void {
  if (typeof document === 'undefined') return;
  const org = getComputedStyle(document.documentElement).getPropertyValue('--skin').trim() || DEFAULT_SKIN;
  applyEffectiveSkin(org);
}
