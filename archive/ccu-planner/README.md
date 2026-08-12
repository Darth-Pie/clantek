# Star Citizen CCU upgrade planner — archived 2026-08-11

Members laid out CCU (Cross Chassis Upgrade) chains on their profile: a hull
they own, plus the upgrades that take it to the ship they want. A step was
either **owned** — a reference into their imported hangar, by RSI pledge id — or
**planned**, an upgrade they had yet to buy, named inline.

It worked and it shipped. It was pulled because the builder itself was clunky
to use, not because the model behind it was wrong. **The data model, the
sanitiser and the RSI rules in `src/shared/ccu.ts` are the good part and are
worth keeping when this comes back.** The part that needs rethinking is
`CcuPlanner.tsx` — specifically the drag-to-reorder chain editor and the
add-step flow.

Live in the build from `be50f66` to `69c43b2`. Tag **`archive/ccu-planner-live`**
is the last commit where it was wired up and running.

## What's here

| Path | Notes |
| --- | --- |
| `src/shared/ccu.ts` | 390 lines. The contract, the sanitiser, and `resolveChain`. The authority on RSI's upgrade rules. |
| `src/server/routes/ccu.ts` | 118 lines. `GET`/`PUT /api/ccu/:userId`, visibility, estimate-blanking. |
| `src/client/components/CcuPlanner.tsx` | 472 lines. The profile UI. **The weak link — rework this.** |
| `styles.ccu.css` | 177 lines of `.ccu-*`, lifted verbatim out of `src/client/styles.css`. |
| `drizzle/0022_rainy_mystique.sql` | Reference copy. The real one is still in `drizzle/` — see below. |

Paths mirror where the files came from, so restoring them is a straight copy
back into the repo root.

## The database is untouched

`sc_ccu_boards` still exists — in production, in `drizzle/0022_rainy_mystique.sql`,
in the drizzle journal, in `src/db/migrations.generated.ts`, and as a table
declaration in `src/db/schema.ts`. **Members' saved boards were not deleted.**

The schema declaration is deliberately kept, with its `board` column loosened
from `$type<CcuBoard>()` to a plain JSON type so it no longer imports from this
directory. Removing the table from `schema.ts` instead would have been a trap:
drizzle-kit diffs `schema.ts` against the last snapshot, so the next unrelated
`npm run db:generate` would have emitted `DROP TABLE sc_ccu_boards` and the next
deploy would have destroyed every member's saved plans. A dormant empty table on
a fresh install is a much smaller cost than that.

When the planner returns, put `$type<CcuBoard>()` back and the existing rows
type-check again — the stored JSON shape never changed.

## Every place the app touched it

Eight hooks, all small. This is the complete list; the feature owned no other
surface.

1. **`src/server/index.ts`** — `import ccuRoutes from './routes/ccu';` and
   `app.route('/api/ccu', ccuRoutes);`
2. **`src/server/modules.ts`** — `ccuEnabled: boolean` on `ScConfig`, plus
   `ccuEnabled: stored.ccuEnabled !== false` in `loadScConfig` and
   `ccuEnabled: o.ccuEnabled !== false` in `cleanScConfig`.
3. **`src/client/lib/modules.ts`** — the same `ccuEnabled: boolean` on the
   client's `ScConfig`, plus `ccuEnabled: true` in `SC_DEFAULT`.
4. **`src/client/pages/MemberDetail.tsx`** — the import, and the render:
   ```tsx
   {sc.hangarEnabled && sc.ccuEnabled && (
     <CcuPlanner userId={member.id} isSelf={isSelf} refreshKey={hangarKey} />
   )}
   ```
5. **`src/client/pages/ModulesAdmin.tsx`** — one `.module-row` inside the
   "Star Citizen — feature kill switches" option set. The `Switch` used
   `checked={sc.ccuEnabled && sc.hangarEnabled}`,
   `disabled={busy || !sc.hangarEnabled}` and
   `stateText={!sc.hangarEnabled ? 'Off (needs hangar)' : undefined}` — it read
   OFF whenever the hangar was off, because a switch painted "on" next to the
   words "Off (needs hangar)" contradicts itself.
6. **`src/db/schema.ts`** — `import type { CcuBoard } from '../shared/ccu';` and
   the `$type<CcuBoard>()` on `scCcuBoards.board`. The table itself stays.
7. **`src/client/styles.css`** — the `.ccu-*` block, now `styles.ccu.css` here.
8. **`drizzle/`** — nothing was removed. 0022 stays applied and in the journal.

## Restoring it

The removal is a single commit, so the fastest route is to revert it:

```bash
git revert --no-commit $(git log --diff-filter=A --format=%H -- archive/ccu-planner/README.md)
```

That puts back the three source files, the CSS block, all eight hooks, and
deletes this directory in one move. Check `src/db/schema.ts` afterwards — the
revert restores `$type<CcuBoard>()`, which is what you want.

Doing it by hand instead: copy `src/**` back to the repo root, paste
`styles.ccu.css` into `src/client/styles.css` (it sat between the `.seo-og-preview`
rule and the `.site-link` comment), then re-apply the eight hooks above.

**One caveat either way.** `cleanScConfig` replaces the whole stored SC settings
blob on every save, so the first time an admin saves anything under Star Citizen
after this removal, the `ccuEnabled` key is dropped from the database. On
restore, `ccuEnabled: stored.ccuEnabled !== false` reads an absent key as *on* —
so an install that had deliberately switched the planner **off** will find it
back **on**. Harmless as long as you know to check it, which is why it's written
down here.

## Design notes worth not relearning

- **Deliberately not a market optimiser** like ccu.game. That needs the whole CCU
  market scraped sale by sale — a maintenance treadmill and a far bigger RSI ToS
  surface. This added no new RSI traffic at all: owned steps resolve against the
  hangar that is already imported.
- **`resolveChain` reports per-step status rather than rejecting.** Ship-name
  matching across RSI's inconsistent pledge naming is unavoidably fuzzy, and a
  false mismatch that blocked the builder would be worse than one a member can
  see and ignore. A broken link does not cascade into the steps after it.
- **Visibility reused `hangar.view` plus the owner's opt-in** instead of adding a
  permission — a board only references hangar items, so a separate perm would be
  a second lock on the same door. Chains resolve client-side against whatever
  hangar the viewer may see, so `hangar.value` withholding came for free; the
  route additionally blanked planned-step estimates, which are stored inline and
  would otherwise have bypassed that rule.
- **Never verified against a real specimen:** owned-CCU auto-detection was never
  tested on a hangar that actually contained unapplied CCUs. Treat that path as
  unproven when you pick this up.
