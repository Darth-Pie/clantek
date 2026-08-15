/**
 * Per-user accessibility preferences — text size and high-contrast mode.
 *
 * These are PERSONAL and per-device (localStorage), independent of the install's
 * theme: an individual with low vision can scale the whole site's text and/or
 * force a high-contrast palette regardless of the org's chosen look. Applied to
 * the root element as early as possible (main.tsx, before React renders) to avoid
 * a flash of the default size/contrast.
 *
 * Text size works because the whole stylesheet is rem-based off the root font
 * size, so setting `html { font-size }` scales every bit of text (and rem spacing)
 * proportionally — the same effect as browser zoom. High contrast sets a
 * `data-contrast="high"` attribute; a CSS block (styles.css) then overrides the
 * theme's colour tokens with `!important`, so it wins over the theme's inline
 * custom properties no matter when they're applied.
 */

export interface A11yPrefs {
  /** Root font size as a percentage of the browser default (100 = default). */
  fontScale: number;
  /** Force the high-contrast palette. */
  highContrast: boolean;
}

export const FONT_MIN = 90;
export const FONT_MAX = 160;
export const FONT_STEP = 5;
export const FONT_DEFAULT = 100;

export const DEFAULT_A11Y: A11yPrefs = { fontScale: FONT_DEFAULT, highContrast: false };

const KEY = 'ct-a11y';

function clampScale(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(FONT_MAX, Math.max(FONT_MIN, v)) : FONT_DEFAULT;
}

export function loadA11yPrefs(): A11yPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<A11yPrefs>;
      return { fontScale: clampScale(o.fontScale), highContrast: o.highContrast === true };
    }
  } catch {
    /* private mode / bad JSON → defaults */
  }
  return { ...DEFAULT_A11Y };
}

/** Apply preferences to the document root. Safe to call before React mounts. */
export function applyA11yPrefs(p: A11yPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.fontSize = `${clampScale(p.fontScale)}%`;
  if (p.highContrast) root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');
}

/** Persist + apply. Returns the (clamped) prefs actually stored. */
export function saveA11yPrefs(p: A11yPrefs): A11yPrefs {
  const clean: A11yPrefs = { fontScale: clampScale(p.fontScale), highContrast: p.highContrast === true };
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* private mode — still applies for the session */
  }
  applyA11yPrefs(clean);
  return clean;
}
