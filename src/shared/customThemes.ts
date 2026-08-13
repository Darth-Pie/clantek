/**
 * Custom themes — an install's own saved, named palettes, shown in the theme
 * editor's "Start from" rail alongside the built-in presets.
 *
 * Stored as one ordered JSON array in settings['customThemes']. Sanitised on
 * every read and write (this module is the authority on the shape): each entry is
 * a stable id, a short name, and a token map restricted to CSS custom properties
 * with `}`-free string values — the same guard the live-theme endpoint uses, so a
 * saved theme can never smuggle a declaration or selector into the page.
 */

export interface CustomTheme {
  id: string;
  name: string;
  tokens: Record<string, string>;
}

const MAX_THEMES = 60;
const NAME_MAX = 40;
const KEY_MAX = 40;
const VALUE_MAX = 120;
const ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;

export function newThemeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `t-${crypto.randomUUID().slice(0, 8)}`;
  return `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function sanitizeCustomThemes(raw: unknown): CustomTheme[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: CustomTheme[] = [];
  for (const r of arr.slice(0, MAX_THEMES)) {
    const o = (r ?? {}) as Record<string, unknown>;
    let id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : '';
    if (!id || seen.has(id)) id = newThemeId();
    seen.add(id);
    const name = (typeof o.name === 'string' ? o.name : '').trim().slice(0, NAME_MAX) || 'Untitled';
    const rawTokens = (o.tokens ?? {}) as Record<string, unknown>;
    const tokens: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawTokens)) {
      if (k.startsWith('--') && k.length <= KEY_MAX && typeof v === 'string' && v.length <= VALUE_MAX && !v.includes('}')) {
        tokens[k] = v;
      }
    }
    out.push({ id, name, tokens });
  }
  return out;
}
