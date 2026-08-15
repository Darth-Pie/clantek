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
import {
  applyAdminNav,
  type AdminGroup,
  type AdminItem,
  type AdminTab,
  type AdminNavOverride,
} from '../../shared/adminNav';

// The tree's shapes live in shared/adminNav.ts (so the server can sanitise a
// saved arrangement without importing this file). Re-exported for existing
// consumers that import the types from here.
export type { AdminGroup, AdminItem, AdminTab };

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    key: 'content',
    label: 'Content',
    items: [
      { key: 'pages', label: 'Pages', tabs: [{ key: 'pages', label: 'Pages', permission: 'pages.manage' }] },
      {
        key: 'navigation',
        label: 'Navigation',
        tabs: [
          { key: 'navigation', label: 'Navigation', permission: 'pages.manage' },
          { key: 'adminmenu', label: 'Admin Menu', permission: 'settings.manage' },
        ],
      },
      { key: 'news', label: 'News', tabs: [{ key: 'news', label: 'News', permission: 'news.create' }] },
      { key: 'gallery', label: 'Gallery', tabs: [{ key: 'gallery', label: 'Gallery', permission: 'gallery.manage' }] },
      { key: 'training', label: 'Training', tabs: [{ key: 'training', label: 'Training', permission: 'training.manage' }] },
    ],
  },
  {
    key: 'people',
    label: 'People',
    items: [
      {
        key: 'admissions',
        label: 'Applicants & Bans',
        tabs: [
          { key: 'applicants', label: 'Applicants', permission: 'members.approve' },
          { key: 'bans', label: 'Bans', permission: 'members.ban' },
        ],
      },
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
      {
        key: 'discord',
        label: 'Discord Bot',
        tabs: [
          { key: 'identity', label: 'Identity', permission: 'settings.manage' },
          { key: 'announcements', label: 'Bot Settings', permission: 'settings.manage' },
        ],
      },
      { key: 'analytics', label: 'Analytics', tabs: [{ key: 'analytics', label: 'Analytics', permission: 'settings.manage' }] },
      { key: 'modules', label: 'Modules', tabs: [{ key: 'modules', label: 'Modules', permission: 'settings.manage' }] },
      {
        key: 'appearance',
        label: 'Theme & Branding',
        tabs: [
          { key: 'theme', label: 'Theme', permission: 'theme.manage' },
          { key: 'branding', label: 'Branding', permission: 'settings.manage' },
          { key: 'seo', label: 'SEO & Sharing', permission: 'settings.manage' },
          { key: 'footer', label: 'Footer', permission: 'settings.manage' },
        ],
      },
      { key: 'notifications', label: 'Notifications', tabs: [{ key: 'notifications', label: 'Notifications', permission: 'settings.manage' }] },
      { key: 'logs', label: 'Logs', tabs: [{ key: 'audit', label: 'Logs', permission: 'audit.view' }] },
      {
        key: 'backups',
        label: 'Backups',
        // God-only: a restore wipes and reloads the whole database, so it sits
        // above every permission (see requireGod on the server). The tab's own
        // permission is only a formality — the godOnly gate is what hides it.
        godOnly: true,
        tabs: [{ key: 'backups', label: 'Backups', permission: 'settings.manage' }],
      },
      {
        key: 'mustrgg',
        label: 'mustr.gg',
        mustrOnly: true,
        tabs: [{ key: 'mustrgg', label: 'mustr.gg', permission: 'settings.manage' }],
      },
    ],
  },
];

type Can = (permission: Permission) => boolean;

/** The tree pruned to what a viewer may see: tabs → items → groups they can reach.
 *  `onMustrHost` gates mustr.gg-only items (hidden everywhere else); `isGod` gates
 *  god-only items (e.g. Backups). An optional saved `override` re-orders and
 *  relabels first (via applyAdminNav, which can't widen access — every item keeps
 *  its code-defined tabs), then we filter. */
export function visibleAdminGroups(
  can: Can,
  onMustrHost = false,
  override?: AdminNavOverride | null,
  isGod = false,
): AdminGroup[] {
  return applyAdminNav(ADMIN_GROUPS, override)
    .map((g) => ({
      ...g,
      items: g.items
        .map((i) => ({ ...i, tabs: i.tabs.filter((t) => can(t.permission)) }))
        .filter(
          (i) => i.tabs.length > 0 && (!i.mustrOnly || onMustrHost) && (!i.godOnly || isGod),
        ),
    }))
    .filter((g) => g.items.length > 0);
}

/** Which group an item belongs to (for tagging recently-viewed records). */
export function groupKeyForItem(itemKey: string): string | undefined {
  return ADMIN_GROUPS.find((g) => g.items.some((i) => i.key === itemKey))?.key;
}

export function canAccessAdmin(can: Can): boolean {
  return visibleAdminGroups(can).length > 0;
}
