/**
 * The leadership org chart — a drag-and-drop tree of who reports to whom, which
 * (Phase 2) becomes the public face of the roster.
 *
 * GET '/' is for the public tree: any signed-in member may see it, and it returns
 * ONLY the placed members who meet the rank threshold — never the full directory,
 * so it can safely show to members who lack roster.view. GET '/designer' and PUT
 * are gated on ranks.manage (managing the rank structure). The chart itself is
 * portable JSON stored under the 'org_chart' settings key — no migration.
 */

import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { sanitizeOrgChart, EMPTY_ORG_CHART, type OrgChart } from '../../shared/orgchart';

const orgchart = new Hono<AppContext>();
const ORG_KEY = 'org_chart';

type DB = ReturnType<typeof db>;

async function loadChart(database: DB): Promise<OrgChart> {
  const row = await database.query.settings.findFirst({ where: eq(s.settings.key, ORG_KEY) });
  return sanitizeOrgChart(row?.value ?? EMPTY_ORG_CHART);
}

/** Non-banned members with their rank name + sort-order, for chart boxes. */
async function membersWithRank(database: DB) {
  const rows = await database
    .select({
      id: s.users.id,
      discordId: s.users.discordId,
      username: s.users.username,
      globalName: s.users.globalName,
      displayName: s.users.displayName,
      avatar: s.users.avatar,
      profileImageUrl: s.users.profileImageUrl,
      status: s.users.status,
      rankName: s.ranks.name,
      rankSortOrder: s.ranks.sortOrder,
    })
    .from(s.users)
    .leftJoin(s.ranks, eq(s.users.rankId, s.ranks.id));
  return rows.filter((r) => r.status !== 'banned');
}

function meetsThreshold(rankSortOrder: number | null, min: number): boolean {
  if (min <= 0) return true;
  return rankSortOrder != null && rankSortOrder >= min;
}

/** Public tree: the placed members who currently meet the threshold, plus edges. */
orgchart.get('/', requireAuth, async (c) => {
  const database = db(c.env);
  const chart = await loadChart(database);
  const placed = new Set(chart.nodes.map((n) => n.memberId));
  const members = (await membersWithRank(database)).filter(
    (m) => placed.has(m.id) && meetsThreshold(m.rankSortOrder, chart.minRankSortOrder),
  );
  return c.json({ chart, members });
});

/** Designer data: the full directory to place from, plus ranks for the threshold picker. */
orgchart.get('/designer', requirePermission('ranks.manage'), async (c) => {
  const database = db(c.env);
  const [chart, members, ranks] = await Promise.all([
    loadChart(database),
    membersWithRank(database),
    database
      .select({ id: s.ranks.id, name: s.ranks.name, sortOrder: s.ranks.sortOrder })
      .from(s.ranks)
      .orderBy(asc(s.ranks.sortOrder)),
  ]);
  return c.json({ chart, members, ranks });
});

/** Save the chart. */
orgchart.put('/', requirePermission('ranks.manage'), async (c) => {
  const body = await c.req.json<{ chart?: unknown }>();
  const chart = sanitizeOrgChart(body.chart);
  const viewer = c.get('viewer')!;
  const now = Math.floor(Date.now() / 1000);

  await db(c.env)
    .insert(s.settings)
    .values({ key: ORG_KEY, value: chart, updatedBy: viewer.id, updatedAt: now })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: chart, updatedBy: viewer.id, updatedAt: now },
    });

  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'orgchart.save',
    targetType: 'orgchart',
    targetId: ORG_KEY,
    meta: { nodes: chart.nodes.length, edges: chart.edges.length, minRankSortOrder: chart.minRankSortOrder },
  });

  return c.json({ ok: true, chart });
});

export default orgchart;
