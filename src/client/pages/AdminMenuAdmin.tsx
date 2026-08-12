/**
 * Admin Menu builder — arrange the admin sidebar itself.
 *
 * The tools that exist (and the permission each needs) are fixed in code; this
 * only rearranges and relabels them. So there's no add/remove: every tool is
 * always present, you just reorder groups, reorder tools, move a tool to another
 * group, or give a group/tool a custom name. Reordering is up/down plus "move to
 * a group" — the same deterministic, finger-friendly scheme as the site-nav
 * builder, no nested drag-drop.
 *
 * Saved to /api/admin-nav as an order+label override; the sidebar re-reads it live
 * via the `ct-adminnav-changed` event. A tool added in a future version that the
 * saved arrangement never mentions still shows up (it's appended to its home
 * group) — arranging the menu can never hide a tool, only move it.
 */

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import { ADMIN_GROUPS } from '../lib/adminSections';
import { isMustrHost } from '../lib/wordmark';
import { applyAdminNav, type AdminNavOverride } from '../../shared/adminNav';

interface EditItem {
  key: string;
  defaultLabel: string;
  label: string; // custom override, '' means "use default"
}
interface EditGroup {
  key: string;
  defaultLabel: string;
  label: string;
  items: EditItem[];
}

/** The canonical tree this install can arrange (mustr.gg-only tools hidden elsewhere). */
function canonicalTree() {
  return ADMIN_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.mustrOnly || isMustrHost()),
  })).filter((g) => g.items.length > 0);
}

/** Reconcile the saved override with the canonical tree into editable rows. */
function toEditable(override: AdminNavOverride | null): EditGroup[] {
  const canonical = canonicalTree();
  const applied = applyAdminNav(canonical, override);

  const gLabel = new Map(canonical.map((g) => [g.key, g.label]));
  const iLabel = new Map(canonical.flatMap((g) => g.items).map((i) => [i.key, i.label]));
  const ovG = new Map((override?.groups ?? []).map((g) => [g.key, g.label ?? '']));
  const ovI = new Map((override?.groups ?? []).flatMap((g) => g.items).map((i) => [i.key, i.label ?? '']));

  return applied.map((g) => ({
    key: g.key,
    defaultLabel: gLabel.get(g.key) ?? g.label,
    label: ovG.get(g.key) ?? '',
    items: g.items.map((it) => ({
      key: it.key,
      defaultLabel: iLabel.get(it.key) ?? it.label,
      label: ovI.get(it.key) ?? '',
    })),
  }));
}

/** Fold editable rows back into a lean override — a label is stored only when set
 *  AND different from the built-in, so renaming a default in code still wins. */
function toOverride(groups: EditGroup[]): AdminNavOverride {
  return {
    version: 1,
    groups: groups.map((g) => {
      const label = g.label.trim();
      return {
        key: g.key,
        ...(label && label !== g.defaultLabel ? { label } : {}),
        items: g.items.map((it) => {
          const il = it.label.trim();
          return { key: it.key, ...(il && il !== it.defaultLabel ? { label: il } : {}) };
        }),
      };
    }),
  };
}

export default function AdminMenuAdmin() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<EditGroup[]>([]);
  const [saved, setSaved] = useState('');
  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ override: AdminNavOverride | null }>('/admin-nav')
      .then((d) => {
        const editable = toEditable(d.override);
        setGroups(editable);
        setSaved(JSON.stringify(toOverride(editable)));
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => JSON.stringify(toOverride(groups)) !== saved, [groups, saved]);

  /** Clone, mutate, set — every edit goes through here. */
  const update = (fn: (draft: EditGroup[]) => void) =>
    setGroups((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  const moveGroup = (gIdx: number, dir: -1 | 1) =>
    update((gs) => {
      const j = gIdx + dir;
      if (j < 0 || j >= gs.length) return;
      [gs[gIdx], gs[j]] = [gs[j]!, gs[gIdx]!];
    });
  const setGroupLabel = (gIdx: number, value: string) =>
    update((gs) => {
      gs[gIdx]!.label = value;
    });

  const moveItem = (gIdx: number, iIdx: number, dir: -1 | 1) =>
    update((gs) => {
      const items = gs[gIdx]!.items;
      const j = iIdx + dir;
      if (j < 0 || j >= items.length) return;
      [items[iIdx], items[j]] = [items[j]!, items[iIdx]!];
    });
  const setItemLabel = (gIdx: number, iIdx: number, value: string) =>
    update((gs) => {
      gs[gIdx]!.items[iIdx]!.label = value;
    });
  const moveItemToGroup = (gIdx: number, iIdx: number, targetKey: string) =>
    update((gs) => {
      const target = gs.find((g) => g.key === targetKey);
      if (!target || target.key === gs[gIdx]!.key) return;
      const [item] = gs[gIdx]!.items.splice(iIdx, 1);
      if (item) target.items.push(item);
    });

  const save = () =>
    run(async () => {
      const { override } = await api.put<{ override: AdminNavOverride }>('/admin-nav', {
        override: toOverride(groups),
      });
      const editable = toEditable(override);
      setGroups(editable);
      setSaved(JSON.stringify(toOverride(editable)));
      window.dispatchEvent(new Event('ct-adminnav-changed'));
      return 'Menu saved. The admin sidebar now reflects it.';
    });

  const reset = () =>
    run(async () => {
      await api.del('/admin-nav');
      const editable = toEditable(null);
      setGroups(editable);
      setSaved(JSON.stringify(toOverride(editable)));
      window.dispatchEvent(new Event('ct-adminnav-changed'));
      return 'Menu reset to the built-in order.';
    });

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="panel adminmenu">
      <header className="panel-head adminmenu-head">
        <div>
          <h2>Admin Menu</h2>
          <p className="muted">
            Arrange this admin sidebar: reorder groups and tools, move a tool to another group, or
            rename either. Tools can’t be removed — everyone still only sees the ones they have
            permission for.
          </p>
        </div>
        <div className="adminmenu-actions">
          <button className="ghost" disabled={busy} onClick={() => void reset()} title="Restore the built-in order and names">
            Reset
          </button>
          <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? 'Saving…' : dirty ? 'Save menu' : 'Saved'}
          </button>
        </div>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <ol className="adminmenu-tree">
        {groups.map((g, gIdx) => (
          <li key={g.key} className="adminmenu-group">
            <div className="adminmenu-row adminmenu-row-group">
              <span className="adminmenu-kind" title="Group heading">
                Group
              </span>
              <input
                className="adminmenu-label"
                value={g.label}
                placeholder={g.defaultLabel}
                aria-label={`Name for the ${g.defaultLabel} group`}
                onChange={(e) => setGroupLabel(gIdx, e.target.value)}
              />
              <div className="adminmenu-tools">
                <button className="mini" title="Move group up" disabled={gIdx === 0} onClick={() => moveGroup(gIdx, -1)}>↑</button>
                <button className="mini" title="Move group down" disabled={gIdx === groups.length - 1} onClick={() => moveGroup(gIdx, 1)}>↓</button>
              </div>
            </div>

            <ol className="adminmenu-items">
              {g.items.map((it, iIdx) => (
                <li key={it.key} className="adminmenu-row adminmenu-row-item">
                  <span className="adminmenu-kind adminmenu-kind-item" title="Tool">Tool</span>
                  <input
                    className="adminmenu-label"
                    value={it.label}
                    placeholder={it.defaultLabel}
                    aria-label={`Name for the ${it.defaultLabel} tool`}
                    onChange={(e) => setItemLabel(gIdx, iIdx, e.target.value)}
                  />
                  <div className="adminmenu-tools">
                    <button className="mini" title="Move up" disabled={iIdx === 0} onClick={() => moveItem(gIdx, iIdx, -1)}>↑</button>
                    <button className="mini" title="Move down" disabled={iIdx === g.items.length - 1} onClick={() => moveItem(gIdx, iIdx, 1)}>↓</button>
                    {groups.length > 1 && (
                      <select
                        className="adminmenu-into"
                        value=""
                        title="Move to another group"
                        onChange={(e) => e.target.value && moveItemToGroup(gIdx, iIdx, e.target.value)}
                      >
                        <option value="">To ▾</option>
                        {groups
                          .filter((other) => other.key !== g.key)
                          .map((other) => (
                            <option key={other.key} value={other.key}>
                              {other.label.trim() || other.defaultLabel}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </li>
              ))}
              {g.items.length === 0 && (
                <li className="adminmenu-empty muted small">Empty — move a tool here from another group.</li>
              )}
            </ol>
          </li>
        ))}
      </ol>

      <p className="muted small">
        Leave a name blank to use the tool’s built-in label. This arrangement applies to everyone in
        your install; each person still only sees the tools their permissions allow.
      </p>
    </section>
  );
}
