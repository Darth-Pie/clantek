/**
 * Handles clicks on the tournament announcement buttons (MESSAGE_COMPONENT).
 *
 * custom_id forms (built in discord/tournaments.ts):
 *   trn:register:<tournamentId>   → self-register (individual tournaments)
 *   trn:withdraw:<tournamentId>   → withdraw a self-registration
 *
 * Runs after a deferred-update ack (index.ts) and sends the clicker a private
 * confirmation. Never throws — a failed click just has no visible effect.
 */

import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import * as s from '../../db/schema';
import type { Env } from '../env';
import { addEntrant, isOpenForEntrants } from '../tournaments';
import { followUpEphemeral, type Interaction } from './interactions';

/** True if this component interaction is one of our tournament buttons. */
export function isTournamentComponent(i: Interaction): boolean {
  return !!i.data?.custom_id?.startsWith('trn:');
}

export async function handleTournamentComponent(env: Env, i: Interaction): Promise<void> {
  const customId = i.data?.custom_id;
  if (!customId?.startsWith('trn:')) return;

  const [, kind, idStr] = customId.split(':');
  const tournamentId = Number(idStr);
  if (!Number.isFinite(tournamentId)) return;

  const db = drizzle(env.DB, { schema });
  const discordId = (i.member?.user ?? i.user)?.id;
  if (!discordId) return;

  const note = await run();
  try {
    await followUpEphemeral(i.application_id, i.token, note);
  } catch (err) {
    console.error('Tournament component follow-up failed', err);
  }

  async function run(): Promise<string> {
    const user = await db.query.users.findFirst({ where: eq(s.users.discordId, discordId!) });
    if (!user) return 'You need a mustr account first — sign in on the website once, then try again.';
    if (user.status === 'banned') return 'Your account is not active.';

    const t = await db.query.tournaments.findFirst({ where: eq(s.tournaments.id, tournamentId) });
    if (!t) return '⚠️ That tournament no longer exists.';
    if (t.competitorType !== 'individual') return '⚠️ This is a team tournament — enter your team on the website.';

    if (kind === 'withdraw') {
      if (!isOpenForEntrants(t.status)) return '⚠️ The bracket is already set — you can’t withdraw now.';
      await db
        .delete(s.tournamentEntrants)
        .where(and(eq(s.tournamentEntrants.tournamentId, t.id), eq(s.tournamentEntrants.userId, user.id)));
      return 'You’ve withdrawn from this tournament.';
    }

    if (kind === 'register') {
      if (t.status !== 'registration') return '⚠️ Registration isn’t open for this tournament.';
      const res = await addEntrant(db, t, { userId: user.id });
      return res.ok ? '✅ You’re entered — good luck!' : `⚠️ ${res.error}`;
    }

    return 'Unknown action.';
  }
}
