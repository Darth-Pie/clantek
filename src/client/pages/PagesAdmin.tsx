/**
 * The page layout editor — the WYSIWYG / drag-and-drop side of templating.
 *
 * An admin arranges a standard page (the home page today) as rows of columns,
 * dropping modules — News, Roster, Events, a heading, a rich-text note — into
 * each column and setting how wide each column is on desktop. Everything is the
 * portable JSON from shared/layout.ts, saved to /api/pages/:slug and rendered by
 * the very same PageRenderer members see, so the preview is truthful. Columns
 * stack on mobile automatically; there is no separate mobile layout to maintain.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import PageRenderer from '../components/PageRenderer';
import RichTextEditor from '../components/RichTextEditor';
import {
  HOME_SLUG,
  MODULE_SPECS,
  moduleSpec,
  defaultLayout,
  slugify,
  GRID_UNITS,
  type PageLayout,
  type LayoutRow,
  type LayoutColumn,
  type LayoutModule,
  type ModuleType,
} from '../../shared/layout';
import { resolveEmbed } from '../../shared/embeds';

interface PageMeta {
  slug: string;
  title: string | null;
  showInNav: boolean;
  navOrder: number;
  isHome: boolean;
}

/** A role option for the "Visible to" audience picker. */
interface RoleOpt {
  id: number;
  name: string;
  color: string | null;
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

type Drag = { rowId: string; colId: string; moduleId: string };

export default function PagesAdmin() {
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  // `null` = the page list (landing view); a slug = editing that page.
  const [slug, setSlug] = useState<string | null>(null);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const loadPages = () =>
    api
      .get<{ pages: PageMeta[] }>('/pages')
      .then(({ pages }) => setPages(pages))
      .catch(() => setPages([{ slug: HOME_SLUG, title: 'Home page', showInNav: false, navOrder: 0, isHome: true }]));

  // After a create/rename/delete/nav-toggle, refresh our own list and tell the
  // rest of the app (the top nav loads page names once) that they changed.
  const refreshPages = async () => {
    await loadPages();
    window.dispatchEvent(new Event('ct-pages-changed'));
  };

  useEffect(() => {
    void loadPages();
    api
      .get<{ roles: RoleOpt[] }>('/pages/meta/roles')
      .then(({ roles }) => setRoles(roles))
      .catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    if (!slug) {
      setLayout(null);
      return;
    }
    setLoading(true);
    setDirty(false);
    setPreview(false);
    api
      .get<{ layout: PageLayout }>(`/pages/${slug}`)
      .then(({ layout }) => setLayout(layout))
      .catch(() => setLayout(defaultLayout(slug)))
      .finally(() => setLoading(false));
  }, [slug]);

  const current = slug ? pages.find((p) => p.slug === slug) : undefined;

  /* --- page management --- */
  async function createPage() {
    const title = window.prompt('Name the new page (e.g. "About Us"):')?.trim();
    if (!title) return;
    const suggested = slugify(title);
    const chosen = window.prompt('Page address (/p/…):', suggested)?.trim().toLowerCase();
    if (!chosen) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.post<{ slug: string }>('/pages', { title, slug: chosen });
      await refreshPages();
      setSlug(res.slug);
      setMessage('Page created. Add some modules and Save.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create the page.');
    } finally {
      setSaving(false);
    }
  }

  async function renamePage() {
    if (!current) return;
    const title = window.prompt('Rename this page:', current.title ?? '')?.trim();
    if (!title) return;
    await api.patch(`/pages/${slug}`, { title }).catch(() => {});
    await refreshPages();
  }

  async function toggleNav(next: boolean) {
    if (!current || current.isHome) return;
    await api.patch(`/pages/${slug}`, { showInNav: next }).catch(() => {});
    await refreshPages();
  }

  async function deletePage() {
    if (!current || current.isHome) return;
    if (!window.confirm(`Delete the page “${current.title ?? slug}”? This can’t be undone.`)) return;
    setSaving(true);
    try {
      await api.del(`/pages/${slug}`);
      await refreshPages();
      setSlug(null);
      setMessage('Page deleted.');
    } catch {
      setMessage('Could not delete the page.');
    } finally {
      setSaving(false);
    }
  }

  /** Immutable edit: clone, mutate the rows, mark dirty. */
  function edit(mutator: (rows: LayoutRow[]) => void) {
    setLayout((prev) => {
      if (!prev) return prev;
      const rows = structuredClone(prev.rows);
      mutator(rows);
      return { ...prev, rows };
    });
    setDirty(true);
    setMessage(null);
  }

  const findCol = (rows: LayoutRow[], rowId: string, colId: string): LayoutColumn | undefined =>
    rows.find((r) => r.id === rowId)?.columns.find((c) => c.id === colId);

  /* --- row ops --- */
  const addRow = () =>
    edit((rows) =>
      rows.push({ id: newId('r'), columns: [{ id: newId('c'), span: GRID_UNITS, modules: [] }] }),
    );
  const removeRow = (rowId: string) => edit((rows) => {
    const i = rows.findIndex((r) => r.id === rowId);
    if (i >= 0) rows.splice(i, 1);
  });
  const moveRow = (rowId: string, dir: -1 | 1) =>
    edit((rows) => {
      const i = rows.findIndex((r) => r.id === rowId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rows.length) return;
      [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    });

  /* --- column ops --- */
  const addColumn = (rowId: string) =>
    edit((rows) => {
      const row = rows.find((r) => r.id === rowId);
      if (row && row.columns.length < 6)
        row.columns.push({ id: newId('c'), span: GRID_UNITS, modules: [] });
    });
  const removeColumn = (rowId: string, colId: string) =>
    edit((rows) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      row.columns = row.columns.filter((c) => c.id !== colId);
      if (row.columns.length === 0) rows.splice(rows.indexOf(row), 1);
    });
  const setSpan = (rowId: string, colId: string, span: number) =>
    edit((rows) => {
      const col = findCol(rows, rowId, colId);
      if (col) col.span = span;
    });

  /* --- module ops --- */
  const addModule = (rowId: string, colId: string, type: ModuleType) =>
    edit((rows) => {
      const col = findCol(rows, rowId, colId);
      const spec = moduleSpec(type);
      if (col && spec)
        col.modules.push({ id: newId('m'), type, config: { ...spec.defaultConfig } });
    });
  const removeModule = (rowId: string, colId: string, moduleId: string) =>
    edit((rows) => {
      const col = findCol(rows, rowId, colId);
      if (col) col.modules = col.modules.filter((m) => m.id !== moduleId);
    });
  const moveModule = (rowId: string, colId: string, moduleId: string, dir: -1 | 1) =>
    edit((rows) => {
      const col = findCol(rows, rowId, colId);
      if (!col) return;
      const i = col.modules.findIndex((m) => m.id === moduleId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= col.modules.length) return;
      [col.modules[i], col.modules[j]] = [col.modules[j]!, col.modules[i]!];
    });
  const patchConfig = (rowId: string, colId: string, moduleId: string, patch: Record<string, unknown>) =>
    edit((rows) => {
      const mod = findCol(rows, rowId, colId)?.modules.find((m) => m.id === moduleId);
      if (mod) mod.config = { ...mod.config, ...patch };
    });
  const setVisibility = (rowId: string, colId: string, moduleId: string, visibleToRole: number | undefined) =>
    edit((rows) => {
      const mod = findCol(rows, rowId, colId)?.modules.find((m) => m.id === moduleId);
      if (!mod) return;
      if (visibleToRole != null) mod.visibleToRole = visibleToRole;
      else delete mod.visibleToRole;
    });

  /** Drop the dragged module into `toCol`, before `beforeId` (or at the end). */
  const dropModule = (toRowId: string, toColId: string, beforeId: string | null) => {
    const from = dragRef.current;
    dragRef.current = null;
    if (!from) return;
    if (from.rowId === toRowId && from.colId === toColId && from.moduleId === beforeId) return;
    edit((rows) => {
      const src = findCol(rows, from.rowId, from.colId);
      const dst = findCol(rows, toRowId, toColId);
      if (!src || !dst) return;
      const idx = src.modules.findIndex((m) => m.id === from.moduleId);
      if (idx < 0) return;
      const [moved] = src.modules.splice(idx, 1);
      if (!moved) return;
      const before = beforeId ? dst.modules.findIndex((m) => m.id === beforeId) : -1;
      if (before < 0) dst.modules.push(moved);
      else dst.modules.splice(before, 0, moved);
    });
  };

  async function save() {
    if (!layout) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.put(`/pages/${slug}`, { layout });
      setDirty(false);
      setMessage('Saved. The page is live.');
    } catch {
      setMessage('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function resetDefault() {
    if (!window.confirm('Reset this page to the built-in default layout? Your customizations will be removed.')) return;
    setSaving(true);
    try {
      const { layout: def } = await api.del<{ layout: PageLayout }>(`/pages/${slug}`);
      setLayout(def);
      setDirty(false);
      setMessage('Reset to the default layout.');
    } catch {
      setMessage('Could not reset. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = useMemo(() => current?.title ?? slug ?? '', [current, slug]);

  // Landing view: pick a page to edit (or create one) instead of jumping
  // straight into the home page.
  if (!slug) {
    return (
      <section className="panel pages-admin">
        <header className="panel-head pages-admin-head">
          <div>
            <h2>Pages</h2>
            <p className="muted">Choose a page to edit, or build a new one. Columns stack on mobile.</p>
          </div>
          <div className="pages-admin-actions">
            <button type="button" className="primary" onClick={createPage} disabled={saving}>
              + New page
            </button>
          </div>
        </header>

        {message && <div className="notice">{message}</div>}

        <ul className="pages-list">
          {pages.map((p) => (
            <li key={p.slug}>
              <button type="button" className="pages-list-item" onClick={() => setSlug(p.slug)}>
                <span className="pages-list-name">{p.isHome ? 'Home page' : p.title ?? p.slug}</span>
                <span className="pages-list-meta muted small">
                  {p.isHome ? '/' : `/p/${p.slug}`}
                  {!p.isHome && p.showInNav ? ' · in menu' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (loading || !layout) return <div className="loading">Loading…</div>;

  return (
    <section className="panel pages-admin">
      <header className="panel-head pages-admin-head">
        <div>
          <h2>Pages</h2>
          <p className="muted">Arrange modules on the home page, or build custom pages. Columns stack on mobile.</p>
        </div>
        <div className="pages-admin-actions">
          <button type="button" className="ghost" onClick={() => setSlug(null)} title="Back to all pages">
            ← All pages
          </button>
          <select value={slug} onChange={(e) => setSlug(e.target.value)} title="Page to edit">
            {pages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.isHome ? 'Home page' : p.title ?? p.slug}
              </option>
            ))}
          </select>
          <button type="button" className="ghost" onClick={createPage} disabled={saving}>
            + New page
          </button>
          <button type="button" className="ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button type="button" className="primary" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </header>

      {/* Per-page controls: nav placement + rename/delete for custom pages, reset for home. */}
      <div className="pages-admin-meta">
        {current?.isHome ? (
          <button type="button" className="ghost" onClick={resetDefault} disabled={saving}>
            Reset home to default
          </button>
        ) : (
          <>
            <label className="inline-field">
              <input
                type="checkbox"
                checked={!!current?.showInNav}
                onChange={(e) => void toggleNav(e.target.checked)}
              />
              Show in top menu
            </label>
            <button type="button" className="ghost" onClick={renamePage} disabled={saving}>
              Rename
            </button>
            <button type="button" className="ghost danger" onClick={deletePage} disabled={saving}>
              Delete page
            </button>
            <a className="btn-link" href={`/p/${slug}`} target="_blank" rel="noopener noreferrer">
              View ↗
            </a>
          </>
        )}
      </div>

      {message && <div className="notice">{message}</div>}

      {preview ? (
        <div className="pages-preview">
          <div className="muted small pages-preview-label">Preview — {pageTitle}</div>
          <PageRenderer layout={layout} showHidden roles={roles} />
        </div>
      ) : (
        <div className="layout-editor">
          {layout.rows.map((row, ri) => (
            <RowEditor
              key={row.id}
              row={row}
              index={ri}
              total={layout.rows.length}
              onMoveRow={moveRow}
              onRemoveRow={removeRow}
              onAddColumn={addColumn}
              onRemoveColumn={removeColumn}
              onSetSpan={setSpan}
              onAddModule={addModule}
              onRemoveModule={removeModule}
              onMoveModule={moveModule}
              onPatchConfig={patchConfig}
              onSetVisibility={setVisibility}
              roles={roles}
              onDragStartModule={(d) => (dragRef.current = d)}
              onDropModule={dropModule}
            />
          ))}
          <button type="button" className="add-row" onClick={addRow}>
            + Add row
          </button>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Row → columns → modules
 * ------------------------------------------------------------------ */

function RowEditor(props: {
  row: LayoutRow;
  index: number;
  total: number;
  onMoveRow: (rowId: string, dir: -1 | 1) => void;
  onRemoveRow: (rowId: string) => void;
  onAddColumn: (rowId: string) => void;
  onRemoveColumn: (rowId: string, colId: string) => void;
  onSetSpan: (rowId: string, colId: string, span: number) => void;
  onAddModule: (rowId: string, colId: string, type: ModuleType) => void;
  onRemoveModule: (rowId: string, colId: string, moduleId: string) => void;
  onMoveModule: (rowId: string, colId: string, moduleId: string, dir: -1 | 1) => void;
  onPatchConfig: (rowId: string, colId: string, moduleId: string, patch: Record<string, unknown>) => void;
  onSetVisibility: (rowId: string, colId: string, moduleId: string, visibleToRole: number | undefined) => void;
  roles: RoleOpt[];
  onDragStartModule: (d: Drag) => void;
  onDropModule: (rowId: string, colId: string, beforeId: string | null) => void;
}) {
  const { row, index, total } = props;
  return (
    <div className="row-editor">
      <div className="row-editor-bar">
        <span className="row-editor-label">Row {index + 1}</span>
        <div className="row-editor-tools">
          <button type="button" className="mini" title="Move up" disabled={index === 0} onClick={() => props.onMoveRow(row.id, -1)}>↑</button>
          <button type="button" className="mini" title="Move down" disabled={index === total - 1} onClick={() => props.onMoveRow(row.id, 1)}>↓</button>
          <button type="button" className="mini" title="Add column" onClick={() => props.onAddColumn(row.id)}>+ Col</button>
          <button type="button" className="mini danger" title="Delete row" onClick={() => props.onRemoveRow(row.id)}>✕</button>
        </div>
      </div>
      <div className="row-editor-cols">
        {row.columns.map((col) => (
          <ColumnEditor key={col.id} rowId={row.id} col={col} {...props} />
        ))}
      </div>
    </div>
  );
}

function ColumnEditor(props: {
  rowId: string;
  col: LayoutColumn;
  onRemoveColumn: (rowId: string, colId: string) => void;
  onSetSpan: (rowId: string, colId: string, span: number) => void;
  onAddModule: (rowId: string, colId: string, type: ModuleType) => void;
  onRemoveModule: (rowId: string, colId: string, moduleId: string) => void;
  onMoveModule: (rowId: string, colId: string, moduleId: string, dir: -1 | 1) => void;
  onPatchConfig: (rowId: string, colId: string, moduleId: string, patch: Record<string, unknown>) => void;
  onSetVisibility: (rowId: string, colId: string, moduleId: string, visibleToRole: number | undefined) => void;
  roles: RoleOpt[];
  onDragStartModule: (d: Drag) => void;
  onDropModule: (rowId: string, colId: string, beforeId: string | null) => void;
}) {
  const { rowId, col } = props;
  const [over, setOver] = useState(false);
  return (
    <div
      className="col-editor"
      style={{ flexGrow: col.span, flexBasis: `${(col.span / GRID_UNITS) * 100}%` }}
    >
      <div className="col-editor-bar">
        <label className="col-span-label">
          Width
          <select value={col.span} onChange={(e) => props.onSetSpan(rowId, col.id, Number(e.target.value))}>
            {Array.from({ length: GRID_UNITS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}/{GRID_UNITS}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="mini danger" title="Delete column" onClick={() => props.onRemoveColumn(rowId, col.id)}>✕</button>
      </div>

      <div
        className={over ? 'col-dropzone over' : 'col-dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          props.onDropModule(rowId, col.id, null);
        }}
      >
        {col.modules.length === 0 && <div className="col-empty">Drop or add a module</div>}
        {col.modules.map((m, mi) => (
          <ModuleEditor
            key={m.id}
            {...props}
            rowId={rowId}
            colId={col.id}
            module={m}
            index={mi}
            total={col.modules.length}
          />
        ))}
      </div>

      <select
        className="add-module"
        value=""
        onChange={(e) => {
          if (e.target.value) props.onAddModule(rowId, col.id, e.target.value as ModuleType);
          e.target.value = '';
        }}
      >
        <option value="">+ Add module…</option>
        {MODULE_SPECS.map((spec) => (
          <option key={spec.type} value={spec.type}>
            {spec.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ModuleEditor(props: {
  rowId: string;
  colId: string;
  module: LayoutModule;
  index: number;
  total: number;
  onRemoveModule: (rowId: string, colId: string, moduleId: string) => void;
  onMoveModule: (rowId: string, colId: string, moduleId: string, dir: -1 | 1) => void;
  onPatchConfig: (rowId: string, colId: string, moduleId: string, patch: Record<string, unknown>) => void;
  onSetVisibility: (rowId: string, colId: string, moduleId: string, visibleToRole: number | undefined) => void;
  roles: RoleOpt[];
  onDragStartModule: (d: Drag) => void;
  onDropModule: (rowId: string, colId: string, beforeId: string | null) => void;
}) {
  const { rowId, colId, module: m, index, total } = props;
  const spec = moduleSpec(m.type);
  const cfg = m.config;

  return (
    <div
      className="module-editor"
      draggable
      onDragStart={(e) => {
        props.onDragStartModule({ rowId, colId, moduleId: m.id });
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onDropModule(rowId, colId, m.id);
      }}
    >
      <div className="module-editor-bar">
        <span className="module-editor-drag" title="Drag to move">⋮⋮</span>
        <span className="module-editor-type">{spec?.label ?? m.type}</span>
        <div className="module-editor-tools">
          <button type="button" className="mini" title="Move up" disabled={index === 0} onClick={() => props.onMoveModule(rowId, colId, m.id, -1)}>↑</button>
          <button type="button" className="mini" title="Move down" disabled={index === total - 1} onClick={() => props.onMoveModule(rowId, colId, m.id, 1)}>↓</button>
          <button type="button" className="mini danger" title="Remove" onClick={() => props.onRemoveModule(rowId, colId, m.id)}>✕</button>
        </div>
      </div>

      <div className="module-editor-config">
        <label className="inline-field module-audience">
          Visible to
          <select
            value={m.visibleToRole != null ? String(m.visibleToRole) : ''}
            onChange={(e) =>
              props.onSetVisibility(rowId, colId, m.id, e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">Everyone</option>
            {props.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        {m.type === 'heading' && (
          <>
            <input
              type="text"
              value={typeof cfg.text === 'string' ? cfg.text : ''}
              placeholder="Heading text"
              onChange={(e) => props.onPatchConfig(rowId, colId, m.id, { text: e.target.value })}
            />
            <label className="inline-field">
              Size
              <select
                value={typeof cfg.level === 'number' ? cfg.level : 2}
                onChange={(e) => props.onPatchConfig(rowId, colId, m.id, { level: Number(e.target.value) })}
              >
                <option value={1}>Large</option>
                <option value={2}>Medium</option>
                <option value={3}>Small</option>
              </select>
            </label>
          </>
        )}

        {m.type === 'text' && (
          <RichTextEditor
            key={m.id}
            value={typeof cfg.html === 'string' ? cfg.html : ''}
            onChange={(html) => props.onPatchConfig(rowId, colId, m.id, { html })}
          />
        )}

        {m.type === 'html' && (
          <>
            <textarea
              className="html-config"
              rows={8}
              spellCheck={false}
              value={typeof cfg.html === 'string' ? cfg.html : ''}
              placeholder={'<h3>Title</h3>\n<p>Your HTML…</p>'}
              onChange={(e) => props.onPatchConfig(rowId, colId, m.id, { html: e.target.value })}
            />
            <p className="muted small">
              Headings, lists, tables, images, links and formatting are allowed. Scripts,
              inline styles, event handlers and iframes are removed when the page renders —
              use a <strong>Video embed</strong> module for videos.
            </p>
          </>
        )}

        {m.type === 'embed' && (
          <EmbedConfig config={cfg} onPatch={(patch) => props.onPatchConfig(rowId, colId, m.id, patch)} />
        )}

        {(m.type === 'news' ||
          m.type === 'roster' ||
          m.type === 'events' ||
          m.type === 'medals' ||
          m.type === 'warrecords' ||
          m.type === 'games') && (
          <>
            <input
              type="text"
              value={typeof cfg.title === 'string' ? cfg.title : ''}
              placeholder="Section title"
              onChange={(e) => props.onPatchConfig(rowId, colId, m.id, { title: e.target.value })}
            />
            <label className="inline-field">
              Show up to
              <input
                type="number"
                min={1}
                max={50}
                value={typeof cfg.limit === 'number' ? cfg.limit : 5}
                onChange={(e) => props.onPatchConfig(rowId, colId, m.id, { limit: Number(e.target.value) })}
              />
            </label>
          </>
        )}

        {m.type === 'image' && (
          <ImageConfig
            config={cfg}
            onPatch={(patch) => props.onPatchConfig(rowId, colId, m.id, patch)}
          />
        )}

        {m.type === 'button' && (
          <>
            <input
              type="text"
              value={typeof cfg.label === 'string' ? cfg.label : ''}
              placeholder="Button label"
              onChange={(e) => props.onPatchConfig(rowId, colId, m.id, { label: e.target.value })}
            />
            <input
              type="text"
              value={typeof cfg.href === 'string' ? cfg.href : ''}
              placeholder="Link URL (/roster or https://…)"
              onChange={(e) => props.onPatchConfig(rowId, colId, m.id, { href: e.target.value })}
            />
            <label className="inline-field">
              Style
              <select
                value={cfg.style === 'default' ? 'default' : 'primary'}
                onChange={(e) => props.onPatchConfig(rowId, colId, m.id, { style: e.target.value })}
              >
                <option value="primary">Primary</option>
                <option value="default">Subtle</option>
              </select>
            </label>
          </>
        )}

        {m.type === 'divider' && <p className="muted small">A horizontal divider — no options.</p>}
      </div>
    </div>
  );
}

/**
 * Video-embed config: paste any provider URL. We resolve it to a canonical,
 * origin-locked src on the spot (so the preview works immediately and the stored
 * value is already safe); the server re-derives it on save regardless.
 */
function EmbedConfig({
  config,
  onPatch,
}: {
  config: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const url = typeof config.url === 'string' ? config.url : '';
  const resolved = resolveEmbed(url);
  return (
    <div className="module-embed-config">
      <input
        type="text"
        value={url}
        placeholder="Paste a YouTube, Twitch, Vimeo or Streamable link"
        onChange={(e) => {
          const next = e.target.value;
          const r = resolveEmbed(next);
          onPatch({ url: next, src: r?.src ?? '', provider: r?.provider ?? '' });
        }}
      />
      <input
        type="text"
        value={typeof config.title === 'string' ? config.title : ''}
        placeholder="Caption / accessible title (optional)"
        onChange={(e) => onPatch({ title: e.target.value })}
      />
      <label className="inline-field">
        Shape
        <select
          value={config.ratio === '4:3' ? '4:3' : '16:9'}
          onChange={(e) => onPatch({ ratio: e.target.value })}
        >
          <option value="16:9">Widescreen 16:9</option>
          <option value="4:3">Classic 4:3</option>
        </select>
      </label>
      {url &&
        (resolved ? (
          <p className="muted small">✓ {resolved.provider} embed detected.</p>
        ) : (
          <p className="muted small module-image-err">
            Not a supported link — use YouTube, Twitch, Vimeo or Streamable.
          </p>
        ))}
    </div>
  );
}

/** Image module config: an uploader (to the 'pages' media category) plus alt/link/caption. */
function ImageConfig({
  config,
  onPatch,
}: {
  config: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = typeof config.url === 'string' ? config.url : '';

  return (
    <div className="module-image-config">
      {url && <img className="module-image-preview" src={url} alt="" />}
      <div className="avatar-controls">
        <label className="upload-btn mini">
          {uploading ? 'Uploading…' : url ? 'Change image' : 'Upload image'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setErr(null);
              setUploading(true);
              try {
                const res = await api.upload<{ url: string }>('/media/pages', file);
                onPatch({ url: res.url });
              } catch (e2) {
                setErr(e2 instanceof Error ? e2.message : 'Upload failed.');
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {url && (
          <button type="button" className="mini" disabled={uploading} onClick={() => onPatch({ url: '' })}>
            Remove
          </button>
        )}
      </div>
      {err && <p className="muted small module-image-err">{err}</p>}
      <input
        type="text"
        value={typeof config.alt === 'string' ? config.alt : ''}
        placeholder="Alt text (accessibility)"
        onChange={(e) => onPatch({ alt: e.target.value })}
      />
      <input
        type="text"
        value={typeof config.href === 'string' ? config.href : ''}
        placeholder="Link URL (optional)"
        onChange={(e) => onPatch({ href: e.target.value })}
      />
      <input
        type="text"
        value={typeof config.caption === 'string' ? config.caption : ''}
        placeholder="Caption (optional)"
        onChange={(e) => onPatch({ caption: e.target.value })}
      />
    </div>
  );
}
