/**
 * Navigation builder — arrange the top menu.
 *
 * The menu is an ordered list of entries; each is a link (to a built-in page, a
 * custom page, or a URL) or a category (a dropdown holding links). Reordering is
 * up/down plus "move into a category" / "move out", rather than nested drag-drop
 * — deterministic and finger-friendly, and it sidesteps the drag-vs-select trap.
 * Every entry can be gated to a role. Saved to /api/nav; the top bar re-reads it
 * live via the `ct-nav-changed` event.
 */

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import {
  BUILTIN_TARGETS,
  newNavId,
  navItemLabel,
  type NavItem,
  type NavConfig,
} from '../../shared/nav';

interface PageOpt {
  slug: string;
  title: string | null;
}
interface RoleOpt {
  id: number;
  name: string;
  color: string | null;
}

export default function NavAdmin() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NavItem[]>([]);
  const [saved, setSaved] = useState<string>('[]');
  const [pages, setPages] = useState<PageOpt[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);

  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ nav: NavConfig; pages: PageOpt[]; roles: RoleOpt[] }>('/nav/meta')
      .then((d) => {
        setItems(d.nav.items);
        setSaved(JSON.stringify(d.nav.items));
        setPages(d.pages);
        setRoles(d.roles);
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => JSON.stringify(items) !== saved, [items, saved]);
  const groups = useMemo(() => items.filter((i) => i.type === 'group'), [items]);

  /** Clone, mutate, set — every edit goes through here. */
  const update = (fn: (draft: NavItem[]) => void) =>
    setItems((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  /* --- top-level ops --- */
  const moveTop = (idx: number, dir: -1 | 1) =>
    update((it) => {
      const j = idx + dir;
      if (j < 0 || j >= it.length) return;
      [it[idx], it[j]] = [it[j]!, it[idx]!];
    });
  const delTop = (idx: number) => update((it) => it.splice(idx, 1));
  const setTop = (idx: number, patch: Partial<NavItem>) =>
    update((it) => {
      it[idx] = { ...it[idx]!, ...patch };
    });
  const moveInto = (idx: number, groupId: string) =>
    update((it) => {
      const g = it.find((x) => x.id === groupId && x.type === 'group');
      if (!g) return;
      const [item] = it.splice(idx, 1);
      if (item) (g.children ??= []).push(item);
    });

  /* --- child ops --- */
  const moveChild = (gIdx: number, cIdx: number, dir: -1 | 1) =>
    update((it) => {
      const kids = it[gIdx]!.children!;
      const j = cIdx + dir;
      if (j < 0 || j >= kids.length) return;
      [kids[cIdx], kids[j]] = [kids[j]!, kids[cIdx]!];
    });
  const delChild = (gIdx: number, cIdx: number) => update((it) => it[gIdx]!.children!.splice(cIdx, 1));
  const setChild = (gIdx: number, cIdx: number, patch: Partial<NavItem>) =>
    update((it) => {
      const kids = it[gIdx]!.children!;
      kids[cIdx] = { ...kids[cIdx]!, ...patch };
    });
  const moveOut = (gIdx: number, cIdx: number) =>
    update((it) => {
      const [child] = it[gIdx]!.children!.splice(cIdx, 1);
      if (child) it.splice(gIdx + 1, 0, child);
    });

  /* --- adding --- */
  const addLink = (kind: NavItem['kind'], target: string, label = '') =>
    update((it) => it.push({ id: newNavId(), type: 'link', label, kind, target }));
  const addGroup = () =>
    update((it) => it.push({ id: newNavId(), type: 'group', label: 'New category', children: [] }));

  const save = () =>
    run(async () => {
      const { nav } = await api.put<{ nav: NavConfig }>('/nav', {
        nav: { version: 1, items },
      });
      setItems(nav.items);
      setSaved(JSON.stringify(nav.items));
      window.dispatchEvent(new Event('ct-nav-changed'));
      return 'Menu saved. The top bar now reflects it.';
    });

  const roleSelect = (value: number | undefined, onChange: (v: number | undefined) => void) => (
    <select
      className="nav-role"
      value={value != null ? String(value) : ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      title="Who can see this entry"
    >
      <option value="">Everyone</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="panel nav-admin">
      <header className="panel-head nav-admin-head">
        <div>
          <h2>Navigation</h2>
          <p className="muted">
            Arrange the top menu: reorder entries, nest them under categories, and choose who sees
            each. Categories become dropdowns.
          </p>
        </div>
        <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : dirty ? 'Save menu' : 'Saved'}
        </button>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <ol className="nav-tree">
        {items.map((item, idx) =>
          item.type === 'group' ? (
            <li key={item.id} className="nav-tree-group">
              <div className="nav-row nav-row-group">
                <span className="nav-row-kind" title="Category (dropdown)">
                  ▾ Category
                </span>
                <input
                  className="nav-row-label"
                  value={item.label}
                  placeholder="Category name"
                  onChange={(e) => setTop(idx, { label: e.target.value })}
                />
                {roleSelect(item.visibleToRole, (v) => setTop(idx, { visibleToRole: v }))}
                <div className="nav-row-tools">
                  <button className="mini" title="Move up" disabled={idx === 0} onClick={() => moveTop(idx, -1)}>↑</button>
                  <button className="mini" title="Move down" disabled={idx === items.length - 1} onClick={() => moveTop(idx, 1)}>↓</button>
                  <button className="mini danger" title="Delete category (its links move nowhere — they're removed)" onClick={() => delTop(idx)}>✕</button>
                </div>
              </div>

              <ol className="nav-tree-children">
                {(item.children ?? []).length === 0 && (
                  <li className="nav-child-empty muted small">
                    Empty — use “Move into” on a link below, or add one from the toolbar.
                  </li>
                )}
                {(item.children ?? []).map((child, cIdx) => (
                  <li key={child.id} className="nav-row nav-row-child">
                    <span className="nav-row-kind">{describeKind(child)}</span>
                    <input
                      className="nav-row-label"
                      value={child.label}
                      placeholder={navItemLabel(child)}
                      onChange={(e) => setChild(idx, cIdx, { label: e.target.value })}
                    />
                    {roleSelect(child.visibleToRole, (v) => setChild(idx, cIdx, { visibleToRole: v }))}
                    <div className="nav-row-tools">
                      <button className="mini" title="Move up" disabled={cIdx === 0} onClick={() => moveChild(idx, cIdx, -1)}>↑</button>
                      <button className="mini" title="Move down" disabled={cIdx === (item.children?.length ?? 0) - 1} onClick={() => moveChild(idx, cIdx, 1)}>↓</button>
                      <button className="mini" title="Move out to top level" onClick={() => moveOut(idx, cIdx)}>⇤</button>
                      <button className="mini danger" title="Remove" onClick={() => delChild(idx, cIdx)}>✕</button>
                    </div>
                  </li>
                ))}
              </ol>
            </li>
          ) : (
            <li key={item.id} className="nav-row nav-row-link">
              <span className="nav-row-kind">{describeKind(item)}</span>
              <input
                className="nav-row-label"
                value={item.label}
                placeholder={navItemLabel(item)}
                onChange={(e) => setTop(idx, { label: e.target.value })}
              />
              {roleSelect(item.visibleToRole, (v) => setTop(idx, { visibleToRole: v }))}
              <div className="nav-row-tools">
                <button className="mini" title="Move up" disabled={idx === 0} onClick={() => moveTop(idx, -1)}>↑</button>
                <button className="mini" title="Move down" disabled={idx === items.length - 1} onClick={() => moveTop(idx, 1)}>↓</button>
                {groups.length > 0 && (
                  <select
                    className="nav-into"
                    value=""
                    title="Move into a category"
                    onChange={(e) => e.target.value && moveInto(idx, e.target.value)}
                  >
                    <option value="">Into ▾</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label || 'Category'}
                      </option>
                    ))}
                  </select>
                )}
                <button className="mini danger" title="Remove" onClick={() => delTop(idx)}>✕</button>
              </div>
            </li>
          ),
        )}
        {items.length === 0 && <li className="muted small">The menu is empty. Add entries below.</li>}
      </ol>

      <AddToolbar pages={pages} onAddLink={addLink} onAddGroup={addGroup} />

      <p className="muted small">
        Built-in destinations still respect their own access rules — e.g. an <strong>Events</strong>{' '}
        or <strong>Admin</strong> entry only appears for members who can already reach them, whatever
        role you set here.
      </p>
    </section>
  );
}

function describeKind(item: NavItem): string {
  if (item.kind === 'builtin') return `Built-in · ${BUILTIN_TARGETS[item.target ?? '']?.label ?? item.target}`;
  if (item.kind === 'page') return `Page · /p/${item.target}`;
  if (item.kind === 'url') return `Link · ${item.target}`;
  return 'Link';
}

/** The "add an entry" strip: a built-in, a page, a custom URL, or a category. */
function AddToolbar({
  pages,
  onAddLink,
  onAddGroup,
}: {
  pages: PageOpt[];
  onAddLink: (kind: NavItem['kind'], target: string, label?: string) => void;
  onAddGroup: () => void;
}) {
  const [urlLabel, setUrlLabel] = useState('');
  const [url, setUrl] = useState('');
  const [urlErr, setUrlErr] = useState<string | null>(null);

  const addUrl = () => {
    const u = url.trim();
    const ok = (u.startsWith('/') && !u.startsWith('//')) || /^https?:\/\//i.test(u);
    if (!ok) {
      setUrlErr('Enter a path like /roster or a full https:// link.');
      return;
    }
    onAddLink('url', u, urlLabel.trim());
    setUrl('');
    setUrlLabel('');
    setUrlErr(null);
  };

  return (
    <div className="nav-add">
      <div className="nav-add-row">
        <label>
          Built-in page
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onAddLink('builtin', e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">Add…</option>
            {Object.values(BUILTIN_TARGETS).map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Custom page
          <select
            value=""
            disabled={pages.length === 0}
            onChange={(e) => {
              if (e.target.value) {
                const p = pages.find((x) => x.slug === e.target.value);
                onAddLink('page', e.target.value, (p?.title ?? '').slice(0, 40));
              }
              e.target.value = '';
            }}
          >
            <option value="">{pages.length ? 'Add…' : 'No pages yet'}</option>
            {pages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title ?? p.slug}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="ghost" onClick={onAddGroup}>
          + Category
        </button>
      </div>

      <div className="nav-add-row nav-add-url">
        <label>
          Custom link
          <input value={urlLabel} placeholder="Label" onChange={(e) => setUrlLabel(e.target.value)} />
        </label>
        <input
          className="nav-add-url-input"
          value={url}
          placeholder="/roster or https://discord.gg/…"
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="button" className="ghost" onClick={addUrl}>
          + Link
        </button>
        {urlErr && <span className="muted small module-image-err">{urlErr}</span>}
      </div>
    </div>
  );
}
