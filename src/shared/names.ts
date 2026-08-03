/**
 * The one place that decides what name to show for a member.
 *
 * Order: the member's self-set display (game/clan) name, then their Discord
 * global name, then their Discord username as a last resort. Used on both the
 * server (slash commands) and the client so a name never renders two ways.
 */
export function memberName(u: {
  displayName?: string | null;
  globalName?: string | null;
  username: string;
}): string {
  return u.displayName?.trim() || u.globalName?.trim() || u.username;
}
