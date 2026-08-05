/**
 * The leadership org-chart contract, shared by the server (stores + sanitizes)
 * and the client (renders + edits).
 *
 * The chart is portable JSON: a rank threshold, a set of NODES (a member id at an
 * x/y position) and EDGES (who reports to whom, member id → member id). Members
 * are referenced by id only — their display name, rank and avatar are resolved
 * live at render time, so a rename or promotion updates the chart automatically,
 * and a member who drops below the threshold (or leaves) simply stops appearing.
 * The same JSON drives the web view now and a native app later.
 */

export interface OrgNode {
  memberId: number;
  x: number;
  y: number;
}

export interface OrgEdge {
  /** Manager. */
  from: number;
  /** Direct report. */
  to: number;
}

export interface OrgChart {
  version: 1;
  /**
   * Only members whose rank sort-order is >= this appear on the public tree.
   * 0 = everyone eligible. (Higher sort-order = higher rank; see outranks().)
   */
  minRankSortOrder: number;
  nodes: OrgNode[];
  edges: OrgEdge[];
}

export const EMPTY_ORG_CHART: OrgChart = { version: 1, minRankSortOrder: 0, nodes: [], edges: [] };

const MAX_NODES = 400;
const MAX_EDGES = 800;
const MAX_COORD = 8000;

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function clampCoord(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_COORD, Math.max(0, n));
}

/**
 * Coerce arbitrary JSON into a valid OrgChart: integer member ids, clamped
 * coordinates, no duplicate nodes, and edges only between nodes that exist (so a
 * stale or hostile payload can't dangle an edge or blow up the renderer).
 */
export function sanitizeOrgChart(raw: unknown): OrgChart {
  const root = asObject(raw);

  const minRank = Math.round(Number(root.minRankSortOrder));
  const nodesIn = Array.isArray(root.nodes) ? root.nodes : [];
  const edgesIn = Array.isArray(root.edges) ? root.edges : [];

  const nodes: OrgNode[] = [];
  const ids = new Set<number>();
  for (const n of nodesIn.slice(0, MAX_NODES)) {
    const o = asObject(n);
    const memberId = Math.round(Number(o.memberId));
    if (!Number.isInteger(memberId) || memberId <= 0 || ids.has(memberId)) continue;
    ids.add(memberId);
    nodes.push({ memberId, x: clampCoord(o.x), y: clampCoord(o.y) });
  }

  const edges: OrgEdge[] = [];
  const seenEdge = new Set<string>();
  for (const e of edgesIn.slice(0, MAX_EDGES)) {
    const o = asObject(e);
    const from = Math.round(Number(o.from));
    const to = Math.round(Number(o.to));
    if (from === to || !ids.has(from) || !ids.has(to)) continue;
    const key = `${from}->${to}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push({ from, to });
  }

  return {
    version: 1,
    minRankSortOrder: Number.isFinite(minRank) ? Math.max(0, minRank) : 0,
    nodes,
    edges,
  };
}
