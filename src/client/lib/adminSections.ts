/**
 * The admin menu tree — metadata only (keys, labels, permissions), with no
 * component imports, so lightweight consumers (the account menu, the primary
 * nav) can gate on "can this viewer reach any admin tool" without pulling the
 * heavy admin pages — and TipTap — into the initial bundle. Admin.tsx maps tab
 * keys to components; this file never imports a page.
 *
 * Structure: GROUPS (Content / People / Settings) → ITEMS (a sidebar entry, a
 * route at /admin/:item) → TABS (one or more tools shown as tabs inside the
 * item, each gated on its own permission). An item with a single tab shows no
 * tab bar. A tab is visible if the viewer holds its permission; an item is
 * visible if any tab is; a group is visible if any item is.
 */

import type { Permission } from '../../shared/permissions';

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
}

export interface AdminGroup {
  key: string;
  label: string;
  items: AdminItem[];
}

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    key: 'content',
    label: 'Content',
    items: [
      { key: 'pages', label: 'Pages', tabs: [{ key: 'pages', label: 'Pages', permission: 'pages.manage' }] },
      { key: 'navigation', label: 'Navigation', tabs: [{ key: 'navigation', label: 'Navigation', permission: 'pages.manage' }] },
      { key: 'news', label: 'News', tabs: [{ key: 'news', label: 'News', permission: 'news.create' }] },
    ],
  },
  {
    key: 'people',
    label: 'People',
    items: [
      {
        key: 'ranks-roles',
        label: 'Ranks & Roles',
        tabs: [
          { key: 'ranks', label: 'Ranks', permission: 'ranks.manage' },
          { key: 'roles', label: 'Roles', permission: 'roles.manage' },
        ],
      },
      {
        key: 'medals-records',
        label: 'Medals & Records',
        tabs: [
          { key: 'medals', label: 'Medals', permission: 'medals.manage' },
          { key: 'warrecords', label: 'War Records', permission: 'warrecords.manage' },
          { key: 'games', label: 'Games', permission: 'games.manage' },
        ],
      },
      { key: 'org-chart', label: 'Org Chart', tabs: [{ key: 'orgchart', label: 'Org Chart', permission: 'ranks.manage' }] },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [
      { key: 'identity', label: 'Identity & Discord', tabs: [{ key: 'identity', label: 'Identity & Discord', permission: 'settings.manage' }] },
      { key: 'bot', label: 'Bot Settings', tabs: [{ key: 'announcements', label: 'Bot Settings', permission: 'settings.manage' }] },
      { key: 'analytics', label: 'Analytics', tabs: [{ key: 'analytics', label: 'Analytics', permission: 'settings.manage' }] },
      { key: 'modules', label: 'Modules', tabs: [{ key: 'modules', label: 'Modules', permission: 'settings.manage' }] },
      {
        key: 'appearance',
        label: 'Theme & Branding',
        tabs: [
          { key: 'theme', label: 'Theme', permission: 'theme.manage' },
          { key: 'branding', label: 'Branding', permission: 'settings.manage' },
          { key: 'seo', label: 'SEO & Sharing', permission: 'settings.manage' },
        ],
      },
      { key: 'logs', label: 'Logs', tabs: [{ key: 'audit', label: 'Logs', permission: 'audit.view' }] },
    ],
  },
];

type Can = (permission: Permission) => boolean;

/** The tree pruned to what a viewer may see: tabs → items → groups they can reach. */
export function visibleAdminGroups(can: Can): AdminGroup[] {
  return ADMIN_GROUPS.map((g) => ({
    ...g,
    items: g.items
      .map((i) => ({ ...i, tabs: i.tabs.filter((t) => can(t.permission)) }))
      .filter((i) => i.tabs.length > 0),
  })).filter((g) => g.items.length > 0);
}

/** Which group an item belongs to (for tagging recently-viewed records). */
export function groupKeyForItem(itemKey: string): string | undefined {
  return ADMIN_GROUPS.find((g) => g.items.some((i) => i.key === itemKey))?.key;
}

export function canAccessAdmin(can: Can): boolean {
  return visibleAdminGroups(can).length > 0;
}
