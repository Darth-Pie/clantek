/**
 * Star Citizen CCU planner — a member's upgrade chains, gated on the SC module.
 *
 * Visibility mirrors the hangar exactly: a member always sees their own board,
 * and seeing SOMEONE ELSE'S takes both `hangar.view` AND that member having
 * opted their plans public. The board only references hangar items, so a
 * separate permission would just be a second lock on the same door.
 *
 * Chains are stored, never resolved here — resolveChain runs on the client
 * against whatever hangar the viewer is entitled to see, so a board can't leak
 * item names or values that the hangar route would have withheld.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth } from '../middleware/auth';
import { loadModules, loadScConfig } from '../modules';
import { sanitizeCcuBoard, EMPTY_CCU_BOARD, type CcuBoard } from '../../shared/ccu';
import { can } from '../../shared/permissions';

const ccu = new Hono<AppContext>();

/**
 * Planner available? The SC module must be on, the hangar feature alive (plans
 * are built from hangar items), and the planner's own kill switch not thrown.
 */
async function ccuEnabled(env: AppContext['Bindings']): Promise<boolean> {
  const [mods, cfg] = await Promise.all([loadModules(env, db(env)), loadScConfig(env, db(env))]);
  return mods.starcitizen && cfg.hangarEnabled && cfg.ccuEnabled;
}

/**
 * Strip the cost off planned steps. Owned steps carry no value of their own —
 * they resolve against the hangar, which does its own `hangar.value` withholding
 * — but a planned step's estimate is stored inline here and would otherwise walk
 * straight past that rule.
 */
function withoutValues(board: CcuBoard): CcuBoard {
  return {
    ...board,
    chains: board.chains.map((c) => ({
      ...c,
      steps: c.steps.map((step) => (step.kind === 'planned' ? { ...step, value: 0 } : step)),
    })),
  };
}

/** A member's board — subject to the same opt-in visibility as their hangar. */
ccu.get('/:userId', requireAuth, async (c) => {
  if (!(await ccuEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const userId = Number(c.req.param('userId'));
  const self = viewer.id === userId;

  if (!self && !can(viewer, 'hangar.view')) {
    return c.json({ board: null, self: false, canView: false, isPublic: false });
  }

  const row = await db(c.env).query.scCcuBoards.findFirst({ where: eq(s.scCcuBoards.userId, userId) });
  const isPublic = !!row?.isPublic;
  const allowed = self || isPublic;

  const stored = allowed && row ? row.board : null;
  const canValue = self || can(viewer, 'hangar.value');
  const board = stored ? (canValue ? stored : withoutValues(stored)) : null;

  return c.json({ board, self, canView: allowed, isPublic, updatedAt: row?.updatedAt ?? null });
});

/** The signed-in member's own sharing state (for their toggle). */
ccu.get('/me/visibility', requireAuth, async (c) => {
  if (!(await ccuEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const row = await db(c.env).query.scCcuBoards.findFirst({ where: eq(s.scCcuBoards.userId, viewer.id) });
  return c.json({ hasBoard: !!row, isPublic: !!row?.isPublic });
});

/** Set whether the signed-in member's own plans are shared (self-service). */
ccu.patch('/visibility', requireAuth, async (c) => {
  if (!(await ccuEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ public?: unknown }>().catch(() => ({}) as { public?: unknown });
  const isPublic = body.public === true;
  await db(c.env).update(s.scCcuBoards).set({ isPublic }).where(eq(s.scCcuBoards.userId, viewer.id));
  return c.json({ ok: true, isPublic });
});

/**
 * Save (replace) the signed-in member's own board. An empty board is legal —
 * that's how the last chain gets deleted — so there's no minimum-content check.
 * `is_public` is deliberately absent from the update set so saving a plan never
 * silently re-shares it.
 */
ccu.put('/', requireAuth, async (c) => {
  if (!(await ccuEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ board?: unknown }>().catch(() => ({}) as { board?: unknown });
  const board = sanitizeCcuBoard(body.board ?? EMPTY_CCU_BOARD);

  const now = Math.floor(Date.now() / 1000);
  await db(c.env)
    .insert(s.scCcuBoards)
    .values({ userId: viewer.id, board, updatedAt: now })
    .onConflictDoUpdate({ target: s.scCcuBoards.userId, set: { board, updatedAt: now } });

  return c.json({ ok: true, board });
});

/** Clear the signed-in member's own board. */
ccu.delete('/', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  await db(c.env).delete(s.scCcuBoards).where(eq(s.scCcuBoards.userId, viewer.id));
  return c.json({ ok: true });
});

export default ccu;
