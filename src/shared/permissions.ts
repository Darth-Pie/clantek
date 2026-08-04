/**
 * The permission vocabulary.
 *
 * The 2003 version gated actions on `member.rank >= auth.<action>` — a single
 * linear ladder. That made "trusted member who isn't an officer" impossible to
 * express. Here, rank is prestige and roles carry capability; they move
 * independently.
 */

export const PERMISSIONS = {
  'roster.view': 'View the full member roster',
  'roster.edit': 'Edit member details and profiles',
  'roster.promote': 'Change a member’s rank',
  'roster.remove': 'Remove or retire a member',

  'roles.assign': 'Grant and revoke roles on members',
  'roles.manage': 'Create, edit, and delete roles and their permissions',
  'ranks.manage': 'Create, edit, reorder, and delete ranks',

  'news.create': 'Write news posts',
  'news.publish': 'Publish and unpublish news posts',
  'news.delete': 'Delete news posts',

  'medals.award': 'Award and revoke medals',
  'medals.manage': 'Create, edit, and delete medal definitions',

  'games.manage': 'Create, edit, and delete games',
  'matches.record': 'Record match results',
  'matches.manage': 'Edit and delete any match record',

  'warrecords.manage': 'Create, edit, and delete war records',
  'warrecords.award': 'Award and revoke war records',

  'events.view': 'See the events page',
  'events.manage': 'Create, edit, and cancel events',

  'theme.manage': 'Edit site theme and appearance',
  'settings.manage': 'Edit site settings',

  'audit.view': 'View the audit log',
  'discord.sync': 'Trigger Discord role synchronization',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

/** What the session endpoint hands to the React app. */
export interface Viewer {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  displayName: string | null;
  avatar: string | null;
  profileImageUrl: string | null;
  isGod: boolean;
  rank: { id: number; name: string; sortOrder: number } | null;
  roles: { id: number; name: string; color: string | null }[];
  permissions: Permission[];
}

/**
 * The single authority on "can this person do this".
 *
 * God status bypasses everything by design — it is the recovery hatch that
 * prevents anyone, including the founder, from locking themselves out of
 * their own site. Grant it sparingly; it is not assignable through the UI.
 */
export function can(viewer: Viewer | null, permission: Permission): boolean {
  if (!viewer) return false;
  if (viewer.isGod) return true;
  return viewer.permissions.includes(permission);
}

export function canAll(viewer: Viewer | null, ...permissions: Permission[]): boolean {
  return permissions.every((p) => can(viewer, p));
}

export function canAny(viewer: Viewer | null, ...permissions: Permission[]): boolean {
  return permissions.some((p) => can(viewer, p));
}

/**
 * Rank-ladder guard, kept separate from permissions on purpose.
 *
 * Even with `roster.promote`, you should not be able to promote someone above
 * yourself or demote a peer. God ignores this.
 */
export function outranks(
  actor: Pick<Viewer, 'isGod' | 'rank'>,
  targetRankOrder: number | null,
): boolean {
  if (actor.isGod) return true;
  if (actor.rank == null) return false;
  if (targetRankOrder == null) return true;
  return actor.rank.sortOrder > targetRankOrder;
}
