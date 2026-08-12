# archive/

Features that were built, worked, and were then taken out of the live build —
kept whole so they can come back without being rewritten.

Nothing in here is compiled, bundled or served. `tsconfig.json` only includes
`src`, Vite's root is `src/client`, and Wrangler's entry is `src/server`, so
this directory is invisible to every build step. It is source in cold storage,
not source that is merely unused.

Each subdirectory holds one feature: the files it owned, verbatim, laid out at
the paths they came from, plus a `README.md` recording every place the rest of
the app touched it and how to put it back.

| Feature | Archived | Live between | Restore point |
| --- | --- | --- | --- |
| [`ccu-planner/`](ccu-planner/) | 2026-08-11 | `be50f66` … `69c43b2` | tag `archive/ccu-planner-live` |

**If a feature owned database tables, those tables are still there.** Archiving
removes code, never data. See the feature's README for which tables it left
behind and why they are still declared in `src/db/schema.ts`.
