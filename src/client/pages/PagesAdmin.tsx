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
  EDITABLE_PAGES,
  MODULE_SPECS,
  moduleSpec,
  defaultLayout,
  GRID_UNITS,
  type PageLayout,
  type LayoutRow,
  type LayoutColumn,
  type LayoutModule,
  type ModuleType,
} from '../../shared/layout';

function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

type Drag = { rowId: string; colId: string; moduleId: string };

export default function PagesAdmin() {
  const [slug, setSlug] = useState(EDITABLE_PAGES[0]?.slug ?? 'home');
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    setLoading(true);
    setDirty(false);
    api
      .get<{ layout: PageLayout }>(`/pages/${slug}`)
      .then(({ layout }) => setLayout(layout))
      .catch(() => setLayout(defaultLayout(slug)))
      .finally(() => setLoading(false));
  }, [slug]);

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

  const pageTitle = useMemo(
    () => EDITABLE_PAGES.find((p) => p.slug === slug)?.title ?? slug,
    [slug],
  );

  if (loading || !layout) return <div className="loading">Loading…</div>;

  return (
    <section className="panel pages-admin">
      <header className="panel-head pages-admin-head">
        <div>
          <h2>Pages</h2>
          <p className="muted">Arrange the modules on your standard pages. Columns stack on mobile.</p>
        </div>
        <div className="pages-admin-actions">
          {EDITABLE_PAGES.length > 1 && (
            <select value={slug} onChange={(e) => setSlug(e.target.value)}>
              {EDITABLE_PAGES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button type="button" className="ghost" onClick={resetDefault} disabled={saving}>
            Reset
          </button>
          <button type="button" className="primary" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </header>

      {message && <div className="notice">{message}</div>}

      {preview ? (
        <div className="pages-preview">
          <div className="muted small pages-preview-label">Preview — {pageTitle}</div>
          <PageRenderer layout={layout} />
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

        {(m.type === 'news' || m.type === 'roster' || m.type === 'events') && (
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
      </div>
    </div>
  );
}
