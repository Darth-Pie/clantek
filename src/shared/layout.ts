/**
 * The page-layout contract shared by the server (which stores + sanitizes it)
 * and the client (which renders + edits it).
 *
 * A page is a stack of ROWS. Each row is a set of COLUMNS laid out on a 12-unit
 * responsive grid — a column's `span` is how many of the 12 units it occupies on
 * desktop; on a narrow screen every column collapses to full width and the whole
 * page becomes a single readable stack. Each column holds an ordered list of
 * MODULES — self-contained blocks (a news feed, the roster, a rich-text note)
 * that fetch their own data at render time. Because the layout is just data,
 * the exact same JSON drives the web app now and can drive a native app later.
 */

export type ModuleType = 'heading' | 'text' | 'news' | 'roster' | 'events';

export interface LayoutModule {
  /** Stable id for React keys and drag-and-drop; not meaningful to the server. */
  id: string;
  type: ModuleType;
  /** Per-module options (title, item limit, rich-text html, …). */
  config: Record<string, unknown>;
}

export interface LayoutColumn {
  id: string;
  /** 1–12 grid units on desktop. Columns in a row need not sum to 12. */
  span: number;
  modules: LayoutModule[];
}

export interface LayoutRow {
  id: string;
  columns: LayoutColumn[];
}

export interface PageLayout {
  version: 1;
  rows: LayoutRow[];
}

/** The grid width. Kept here so client CSS and server clamping agree. */
export const GRID_UNITS = 12;

/* ------------------------------------------------------------------ *
 * Module catalog — the palette shown in the editor and the whitelist the
 * server validates against. Adding a module type means adding it here AND
 * giving it a renderer in the client module registry.
 * ------------------------------------------------------------------ */

export interface ModuleSpec {
  type: ModuleType;
  label: string;
  description: string;
  /** Config seeded when this module is dropped onto a page. */
  defaultConfig: Record<string, unknown>;
}

export const MODULE_SPECS: readonly ModuleSpec[] = [
  {
    type: 'heading',
    label: 'Heading',
    description: 'A section title.',
    defaultConfig: { text: 'Heading', level: 2 },
  },
  {
    type: 'text',
    label: 'Rich text',
    description: 'A free-form block of formatted text.',
    defaultConfig: { html: '<p>Write something…</p>' },
  },
  {
    type: 'news',
    label: 'News feed',
    description: 'The latest news posts.',
    defaultConfig: { title: 'Latest News', limit: 5 },
  },
  {
    type: 'roster',
    label: 'Roster',
    description: 'A summary of the member roster.',
    defaultConfig: { title: 'Roster', limit: 12 },
  },
  {
    type: 'events',
    label: 'Events',
    description: 'Upcoming clan events.',
    defaultConfig: { title: 'Upcoming Events', limit: 5 },
  },
];

export const MODULE_TYPES = MODULE_SPECS.map((m) => m.type);

export function moduleSpec(type: ModuleType): ModuleSpec | undefined {
  return MODULE_SPECS.find((m) => m.type === type);
}

/* ------------------------------------------------------------------ *
 * Defaults — what a page looks like before anyone customizes it. The home
 * page matches the example brief: news on the right, roster + events stacked
 * on the left.
 * ------------------------------------------------------------------ */

export const DEFAULT_LAYOUTS: Record<string, PageLayout> = {
  home: {
    version: 1,
    rows: [
      {
        id: 'r-home',
        columns: [
          {
            id: 'c-left',
            span: 5,
            modules: [
              { id: 'm-roster', type: 'roster', config: { title: 'Roster', limit: 12 } },
              { id: 'm-events', type: 'events', config: { title: 'Upcoming Events', limit: 5 } },
            ],
          },
          {
            id: 'c-right',
            span: 7,
            modules: [{ id: 'm-news', type: 'news', config: { title: 'Latest News', limit: 6 } }],
          },
        ],
      },
    ],
  },
};

/** The pages the admin editor exposes. Extend as more standard pages get layouts. */
export const EDITABLE_PAGES: { slug: string; title: string }[] = [
  { slug: 'home', title: 'Home page' },
];

export function defaultLayout(slug: string): PageLayout {
  return DEFAULT_LAYOUTS[slug] ?? { version: 1, rows: [] };
}

/* ------------------------------------------------------------------ *
 * Sanitizer — the server never trusts a stored/submitted layout. This coerces
 * arbitrary JSON into a valid PageLayout, dropping anything unknown, clamping
 * spans, and enforcing sane bounds so a hostile or corrupt payload can't blow
 * up the renderer. Rich-text html is left as-is here and sanitized separately
 * (it needs a DOM sanitizer); everything else is structural.
 * ------------------------------------------------------------------ */

const MAX_ROWS = 20;
const MAX_COLS = 6;
const MAX_MODULES = 20;

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function clampSpan(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return GRID_UNITS;
  return Math.min(GRID_UNITS, Math.max(1, n));
}

let idCounter = 0;
function fallbackId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function cleanId(v: unknown, prefix: string): string {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : fallbackId(prefix);
}

/**
 * Sanitize a module's config to a small, known set of primitive keys so nothing
 * unexpected is persisted. `sanitizeText` (a DOM-aware html cleaner) is injected
 * because it isn't available in the worker without a dependency; when omitted,
 * html is stored verbatim (callers that can't sanitize should reject text edits
 * or run their own pass).
 */
function cleanConfig(
  type: ModuleType,
  raw: unknown,
  sanitizeText?: (html: string) => string,
): Record<string, unknown> {
  const src = asObject(raw);
  const out: Record<string, unknown> = {};

  if (typeof src.title === 'string') out.title = src.title.slice(0, 120);
  if (src.limit != null) {
    const n = Math.round(Number(src.limit));
    if (Number.isFinite(n)) out.limit = Math.min(50, Math.max(1, n));
  }

  if (type === 'heading') {
    out.text = (typeof src.text === 'string' ? src.text : 'Heading').slice(0, 200);
    const lvl = Math.round(Number(src.level));
    out.level = [1, 2, 3].includes(lvl) ? lvl : 2;
  }

  if (type === 'text') {
    const html = typeof src.html === 'string' ? src.html.slice(0, 20000) : '';
    out.html = sanitizeText ? sanitizeText(html) : html;
  }

  return out;
}

export function sanitizeLayout(raw: unknown, sanitizeText?: (html: string) => string): PageLayout {
  const root = asObject(raw);
  const rowsIn = Array.isArray(root.rows) ? root.rows : [];
  const rows: LayoutRow[] = [];

  for (const rowRaw of rowsIn.slice(0, MAX_ROWS)) {
    const row = asObject(rowRaw);
    const colsIn = Array.isArray(row.columns) ? row.columns : [];
    const columns: LayoutColumn[] = [];

    for (const colRaw of colsIn.slice(0, MAX_COLS)) {
      const col = asObject(colRaw);
      const modsIn = Array.isArray(col.modules) ? col.modules : [];
      const modules: LayoutModule[] = [];

      for (const modRaw of modsIn.slice(0, MAX_MODULES)) {
        const mod = asObject(modRaw);
        const type = mod.type as ModuleType;
        if (!MODULE_TYPES.includes(type)) continue;
        modules.push({
          id: cleanId(mod.id, 'm'),
          type,
          config: cleanConfig(type, mod.config, sanitizeText),
        });
      }

      columns.push({ id: cleanId(col.id, 'c'), span: clampSpan(col.span), modules });
    }

    if (columns.length) rows.push({ id: cleanId(row.id, 'r'), columns });
  }

  return { version: 1, rows };
}
