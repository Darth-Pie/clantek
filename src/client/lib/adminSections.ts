/**
 * The admin section registry — metadata only (key, label, permission), with no
 * component imports. Kept deliberately light so anything that just needs to know
 * *which* admin areas exist or gate on them (the account menu, the primary nav)
 * can import it without pulling the heavy admin pages — and TipTap — into the
 * initial bundle. Admin.tsx maps these keys to their components; this file never
 * imports a page.
 */

import type { Permission } from '../../shared/permissions';

export interface AdminSectionMeta {
  key: string;
  label: string;
  permission: Permission;
}

/** Order here is the sidebar / menu order. */
export const ADMIN_SECTIONS: AdminSectionMeta[] = [
  { key: 'news', label: 'News', permission: 'news.create' },
  { key: 'pages', label: 'Pages', permission: 'pages.manage' },
  { key: 'ranks', label: 'Ranks', permission: 'ranks.manage' },
  { key: 'roles', label: 'Roles', permission: 'roles.manage' },
  { key: 'medals', label: 'Medals', permission: 'medals.manage' },
  { key: 'games', label: 'Games', permission: 'games.manage' },
  { key: 'warrecords', label: 'War Records', permission: 'warrecords.manage' },
  { key: 'announcements', label: 'Announcements', permission: 'settings.manage' },
  { key: 'branding', label: 'Branding', permission: 'settings.manage' },
  { key: 'theme', label: 'Theme', permission: 'theme.manage' },
  { key: 'audit', label: 'Activity Log', permission: 'audit.view' },
];
