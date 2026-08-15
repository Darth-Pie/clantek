/**
 * Admin Menu builder — arrange the admin sidebar itself.
 *
 * The tools that exist (and the permission each needs) are fixed in code; this
 * only rearranges and relabels them. So there's no add/remove: every tool is
 * always present, you just drag to reorder groups and tools, drag a tool into
 * another group, or give a group/tool a custom name.
 *
 * Reordering is native drag-and-drop via a dedicated grip handle (so the label
 * inputs stay selectable) — reorder within a group or drag a tool across groups.
 * Saved to /api/admin-nav as an order+label
 * override; the sidebar re-reads it live via the `ct-adminnav-changed` event. A
 * tool added in a future version that the saved arrangement never mentions still
 * shows up (it's appended to its home group) — arranging can never hide a tool.
 */

import { useEffect, useMemo, useState, type DragEvent } from 'react';
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

type DragState =
  | { kind: 'item'; groupKey: string; itemKey: string }
  | { kind: 'group'; groupKey: string }
  | null;
type OverState = {
  groupKey: string;
  itemKey?: string;
  /** true → indicator sits below the target, false → above. */
  after?: boolean;
  /** true → the target is the group itself (append / group reorder). */
  group?: boolean;
} | null;

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

/** Is the pointer past the vertical midpoint of the row it's over? */
function isAfter(e: DragEvent, el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return e.clientY > r.top + r.height / 2;
}

export default function AdminMenuAdmin() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<EditGroup[]>([]);
  const [saved, setSaved] = useState('');
  const [drag, setDrag] = useState<DragState>(null);
  const [over, setOver] = useState<OverState>(null);
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

  const setGroupLabel = (gIdx: number, value: string) =>
    update((gs) => {
      gs[gIdx]!.label = value;
    });
  const setItemLabel = (gIdx: number, iIdx: number, value: string) =>
    update((gs) => {
      gs[gIdx]!.items[iIdx]!.label = value;
    });

  /** Move an item next to a target item (before/after), or append when target is null. */
  const moveItem = (
    fromG: string,
    itemKey: string,
    toG: string,
    targetItemKey: string | null,
    after: boolean,
  ) =>
    update((gs) => {
      if (fromG === toG && itemKey === targetItemKey) return;
      const from = gs.find((g) => g.key === fromG);
      const si = from?.items.findIndex((i) => i.key === itemKey) ?? -1;
      if (!from || si < 0) return;
      const [item] = from.items.splice(si, 1);
      const to = gs.find((g) => g.key === toG);
      if (!to || !item) {
        from.items.splice(si, 0, item!);
        return;
      }
      if (targetItemKey == null) {
        to.items.push(item);
        return;
      }
      const ti = to.items.findIndex((i) => i.key === targetItemKey);
      if (ti < 0) to.items.push(item);
      else to.items.splice(after ? ti + 1 : ti, 0, item);
    });

  /** Reorder a group relative to a target group. */
  const moveGroup = (groupKey: string, targetKey: string, after: boolean) =>
    update((gs) => {
      if (groupKey === targetKey) return;
      const si = gs.findIndex((g) => g.key === groupKey);
      if (si < 0) return;
      const [g] = gs.splice(si, 1);
      const ti = gs.findIndex((x) => x.key === targetKey);
      if (ti < 0 || !g) gs.push(g!);
      else gs.splice(after ? ti + 1 : ti, 0, g);
    });

  const clearDrag = () => {
    setDrag(null);
    setOver(null);
  };

  /* --- drag sources (the grip handles) --- */
  const startItemDrag = (groupKey: string, itemKey: string) => (e: DragEvent) => {
    setDrag({ kind: 'item', groupKey, itemKey });
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', itemKey);
    } catch {
      /* some browsers require a payload; ignore if refused */
    }
  };
  const startGroupDrag = (groupKey: string) => (e: DragEvent) => {
    setDrag({ kind: 'group', groupKey });
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', groupKey);
    } catch {
      /* ignore */
    }
  };

  /* --- drop targets --- */
  const overItemRow = (groupKey: string, itemKey: string) => (e: DragEvent<HTMLLIElement>) => {
    if (drag?.kind !== 'item') return; // let group-drags bubble to the group
    e.preventDefault();
    e.stopPropagation();
    setOver({ groupKey, itemKey, after: isAfter(e, e.currentTarget) });
  };
  const dropItemRow = (groupKey: string, itemKey: string) => (e: DragEvent<HTMLLIElement>) => {
    if (drag?.kind !== 'item') return;
    e.preventDefault();
    e.stopPropagation();
    moveItem(drag.groupKey, drag.itemKey, groupKey, itemKey, isAfter(e, e.currentTarget));
    clearDrag();
  };

  const overGroupBox = (groupKey: string) => (e: DragEvent<HTMLLIElement>) => {
    if (!drag) return;
    e.preventDefault();
    if (drag.kind === 'item') setOver({ groupKey, group: true });
    else setOver({ groupKey, group: true, after: isAfter(e, e.currentTarget) });
  };
  const dropGroupBox = (groupKey: string) => (e: DragEvent<HTMLLIElement>) => {
    if (!drag) return;
    e.preventDefault();
    if (drag.kind === 'item') moveItem(drag.groupKey, drag.itemKey, groupKey, null, false);
    else moveGroup(drag.groupKey, groupKey, isAfter(e, e.currentTarget));
    clearDrag();
  };

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

  const groupClass = (g: EditGroup) => {
    let cls = 'adminmenu-group';
    if (drag?.kind === 'group' && drag.groupKey === g.key) cls += ' dragging';
    if (over?.groupKey === g.key && over.group) {
      if (drag?.kind === 'item') cls += ' drop-into';
      else cls += over.after ? ' drop-group-after' : ' drop-group-before';
    }
    return cls;
  };
  const itemClass = (g: EditGroup, it: EditItem) => {
    let cls = 'adminmenu-row adminmenu-row-item';
    if (drag?.kind === 'item' && drag.itemKey === it.key) cls += ' dragging';
    if (over?.groupKey === g.key && over.itemKey === it.key) cls += over.after ? ' drop-after' : ' drop-before';
    return cls;
  };

  return (
    <section className="panel adminmenu">
      <header className="panel-head adminmenu-head">
        <div>
          <h2>Admin Menu</h2>
          <p className="muted">
            Drag the <span className="adminmenu-grip" aria-hidden>⠿</span> grips to arrange this admin
            sidebar: reorder groups and tools, or drag a tool into another group. Rename anything by
            typing over it. Tools can’t be removed — everyone still only sees the ones they have
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
          <li
            key={g.key}
            className={groupClass(g)}
            onDragOver={overGroupBox(g.key)}
            onDrop={dropGroupBox(g.key)}
          >
            <div className="adminmenu-row adminmenu-row-group">
              <span
                className="adminmenu-grip"
                role="button"
                tabIndex={-1}
                draggable
                onDragStart={startGroupDrag(g.key)}
                onDragEnd={clearDrag}
                title="Drag to reorder this group"
                aria-label={`Drag to reorder the ${g.defaultLabel} group`}
              >
                ⠿
              </span>
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
            </div>

            <ol className="adminmenu-items">
              {g.items.map((it, iIdx) => (
                <li
                  key={it.key}
                  className={itemClass(g, it)}
                  onDragOver={overItemRow(g.key, it.key)}
                  onDrop={dropItemRow(g.key, it.key)}
                >
                  <span
                    className="adminmenu-grip"
                    role="button"
                    tabIndex={-1}
                    draggable
                    onDragStart={startItemDrag(g.key, it.key)}
                    onDragEnd={clearDrag}
                    title="Drag to reorder, or into another group"
                    aria-label={`Drag to move the ${it.defaultLabel} tool`}
                  >
                    ⠿
                  </span>
                  <span className="adminmenu-kind adminmenu-kind-item" title="Tool">
                    Tool
                  </span>
                  <input
                    className="adminmenu-label"
                    value={it.label}
                    placeholder={it.defaultLabel}
                    aria-label={`Name for the ${it.defaultLabel} tool`}
                    onChange={(e) => setItemLabel(gIdx, iIdx, e.target.value)}
                  />
                </li>
              ))}
              {g.items.length === 0 && (
                <li className="adminmenu-empty muted small">Empty — drag a tool here from another group.</li>
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
