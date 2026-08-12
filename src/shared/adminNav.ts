/**
 * The admin menu model — the canonical tree plus an optional arrangement layer.
 *
 * The tree itself (which tools exist, their tabs, and the permission each needs)
 * lives in code: client/lib/adminSections.ts owns the data, this module owns the
 * *types* and the two functions that let an install rearrange it. Keeping the
 * shapes here means the server can sanitise a saved arrangement without importing
 * a client page, and the client can reconcile it against the code without a round
 * trip.
 *
 * The arrangement (an `AdminNavOverride`, stored in settings['adminNav']) carries
 * only order + custom labels + group assignment — never a permission or a tab.
 * So, exactly like the site nav, the override can *rearrange and relabel* the
 * menu but can never grant access it shouldn't: `applyAdminNav` always re-attaches
 * each item's real `tabs`/`mustrOnly` from the canonical tree, and Admin.tsx still
 * filters the result by the viewer's permissions. An item the override forgot (a
 * tool shipped in a later version) is appended to its home group, so upgrading can
 * never hide a new tool; a key the override names that no longer exists is dropped.
 */

import type { Permission } from './permissions';

/* ---- The canonical tree's shape (data lives in adminSections.ts) ---- */

export interface AdminTab {
  /** Maps to a component in Admin.tsx's renderer map, and to /admin/:item/:tab. */
  key: string;
  label: string;
  permission: Permission;
}

export interface AdminItem {
  /** Route segment: /admin/:key */
  key: string;
  label: string;
  tabs: AdminTab[];
  /** Only shown on the mustr.gg showcase host — never in a buyer's install. */
  mustrOnly?: boolean;
}

export interface AdminGroup {
  key: string;
  label: string;
  items: AdminItem[];
}

/* ---- The arrangement layer (stored, sanitised, applied) ---- */

export interface AdminNavItemOverride {
  key: string;
  /** Custom label; absent means "use the item's built-in label". */
  label?: string;
}

export interface AdminNavGroupOverride {
  key: string;
  /** Custom label; absent means "use the group's built-in label". */
  label?: string;
  items: AdminNavItemOverride[];
}

export interface AdminNavOverride {
  version: 1;
  groups: AdminNavGroupOverride[];
}

const MAX_GROUPS = 20;
const MAX_ITEMS = 60;
const MAX_LABEL = 40;
const KEY_RE = /^[a-z0-9-]{1,40}$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Structurally sanitise an untrusted arrangement blob: keep well-formed keys,
 * cap label length, drop duplicates. It does NOT validate keys against the
 * current canonical tree — `applyAdminNav` does that on read, dropping unknown
 * keys and appending missing ones — so the stored blob and the shipped code can
 * drift across versions without ever producing a broken menu.
 */
export function sanitizeAdminNav(raw: unknown): AdminNavOverride {
  const seenGroups = new Set<string>();
  const seenItems = new Set<string>();
  const rawGroups = Array.isArray((raw as { groups?: unknown })?.groups)
    ? (raw as { groups: unknown[] }).groups
    : [];

  const groups: AdminNavGroupOverride[] = [];
  for (const rg of rawGroups.slice(0, MAX_GROUPS)) {
    const o = (rg ?? {}) as Record<string, unknown>;
    const key = str(o.key);
    if (!KEY_RE.test(key) || seenGroups.has(key)) continue;
    seenGroups.add(key);

    const items: AdminNavItemOverride[] = [];
    const rawItems = Array.isArray(o.items) ? o.items.slice(0, MAX_ITEMS) : [];
    for (const ri of rawItems) {
      const io = (ri ?? {}) as Record<string, unknown>;
      const ik = str(io.key);
      if (!KEY_RE.test(ik) || seenItems.has(ik)) continue;
      seenItems.add(ik);
      const item: AdminNavItemOverride = { key: ik };
      const label = str(io.label).trim().slice(0, MAX_LABEL);
      if (label) item.label = label;
      items.push(item);
    }

    const group: AdminNavGroupOverride = { key, items };
    const label = str(o.label).trim().slice(0, MAX_LABEL);
    if (label) group.label = label;
    groups.push(group);
  }

  return { version: 1, groups };
}

/**
 * Reconcile the canonical tree with a saved arrangement, returning groups+items
 * in the arranged order with custom labels applied. Every item's real `tabs` and
 * `mustrOnly` come from `canonical`, so the override can never widen access.
 *
 * Guarantees:
 *  - unknown group/item keys in the override are ignored;
 *  - a canonical item the override never places is appended to its home group
 *    (in canonical order), so a newly shipped tool always appears;
 *  - a group left empty after reconciliation is dropped.
 */
export function applyAdminNav(
  canonical: AdminGroup[],
  override: AdminNavOverride | null | undefined,
): AdminGroup[] {
  if (!override || override.groups.length === 0) return canonical;

  const canonGroup = new Map<string, AdminGroup>();
  const canonItem = new Map<string, AdminItem>();
  const itemHomeGroup = new Map<string, string>();
  for (const g of canonical) {
    canonGroup.set(g.key, g);
    for (const it of g.items) {
      canonItem.set(it.key, it);
      itemHomeGroup.set(it.key, g.key);
    }
  }

  const usedGroups = new Set<string>();
  const usedItems = new Set<string>();
  const out: AdminGroup[] = [];

  // 1) Groups the override names, in its order (known + de-duplicated).
  for (const og of override.groups) {
    const cg = canonGroup.get(og.key);
    if (!cg || usedGroups.has(og.key)) continue;
    usedGroups.add(og.key);

    const items: AdminItem[] = [];
    for (const oi of og.items) {
      const ci = canonItem.get(oi.key);
      if (!ci || usedItems.has(oi.key)) continue;
      usedItems.add(oi.key);
      items.push(oi.label ? { ...ci, label: oi.label } : ci);
    }
    out.push({ key: cg.key, label: og.label || cg.label, items });
  }

  // 2) Any canonical group the override didn't mention → append (empty for now).
  for (const g of canonical) {
    if (usedGroups.has(g.key)) continue;
    usedGroups.add(g.key);
    out.push({ key: g.key, label: g.label, items: [] });
  }

  // 3) Any canonical item not placed yet → append to its home group, in canonical
  //    order, so a tool added in a later version is never hidden by an old blob.
  const outByKey = new Map(out.map((g) => [g.key, g]));
  for (const g of canonical) {
    for (const it of g.items) {
      if (usedItems.has(it.key)) continue;
      usedItems.add(it.key);
      const home = outByKey.get(itemHomeGroup.get(it.key) ?? g.key) ?? outByKey.get(g.key)!;
      home.items.push(it);
    }
  }

  return out.filter((g) => g.items.length > 0);
}
