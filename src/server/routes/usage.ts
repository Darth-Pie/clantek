/**
 * Free-tier usage for the admin dashboard.
 *
 * Two tiers of data:
 *  - Storage (R2 bytes/objects, D1 size) is measured from inside the Worker,
 *    so it always works.
 *  - Daily rate counters (Workers requests, D1 rows read/written) come from
 *    Cloudflare's GraphQL Analytics API and only appear when a read-only
 *    "Account Analytics: Read" token is configured (CLOUDFLARE_API_TOKEN +
 *    CLOUDFLARE_ACCOUNT_ID). Absent or failing → rates are null with a reason.
 *
 * Limits below are the current free-tier allowances; they're sent to the client
 * so the gauges stay correct if Cloudflare changes them (edit here).
 */

import { Hono } from 'hono';
import type { AppContext } from '../env';
import { db, requireAuth } from '../middleware/auth';
import { loadAnalytics, type AnalyticsConfig } from '../config';

const usage = new Hono<AppContext>();

const GB = 1024 * 1024 * 1024;
const R2_STORAGE_LIMIT = 10 * GB;
const D1_STORAGE_LIMIT = 5 * GB;
const WORKERS_REQUESTS_PER_DAY = 100_000;
const D1_ROWS_READ_PER_DAY = 5_000_000;
const D1_ROWS_WRITTEN_PER_DAY = 100_000;

/** Sum every object's size in the media bucket. Clan-scale buckets are small; cap the paging to stay cheap. */
async function measureR2(bucket: R2Bucket): Promise<{ bytes: number; objects: number; truncated: boolean }> {
  let bytes = 0;
  let objects = 0;
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await bucket.list({ limit: 1000, cursor });
    for (const o of page.objects) {
      bytes += o.size;
      objects += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
    pages += 1;
  } while (cursor && pages < 25); // 25k objects ceiling — beyond that report truncated
  return { bytes, objects, truncated: Boolean(cursor) };
}

/** D1 reports the database's total size in the `meta.size_after` of any query. */
async function measureD1(db: D1Database): Promise<number> {
  const res = await db.prepare('SELECT 1').all();
  return (res.meta as { size_after?: number } | undefined)?.size_after ?? 0;
}

interface Rates {
  windowHours: number;
  workersRequests: { used: number; limit: number };
  d1RowsRead: { used: number; limit: number };
  d1RowsWritten: { used: number; limit: number };
}

/** Query the GraphQL Analytics API for the last 24h. Returns null + a reason on any problem. */
export async function fetchRates(cfg: AnalyticsConfig): Promise<{ rates: Rates | null; error: string | null }> {
  if (!cfg.apiToken || !cfg.accountId) {
    return { rates: null, error: null }; // not configured — not an error
  }

  const until = new Date();
  const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);

  const query = `
    query Usage($account: String!, $script: String!, $db: String!, $since: Time!, $until: Time!) {
      viewer {
        accounts(filter: { accountTag: $account }) {
          workersInvocationsAdaptive(limit: 10000, filter: { scriptName: $script, datetime_geq: $since, datetime_leq: $until }) {
            sum { requests }
          }
          d1AnalyticsAdaptiveGroups(limit: 10000, filter: { databaseId: $db, datetimeHour_geq: $since, datetimeHour_leq: $until }) {
            sum { rowsRead rowsWritten }
          }
        }
      }
    }`;

  try {
    const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiToken}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          account: cfg.accountId,
          script: cfg.scriptName,
          db: cfg.d1DatabaseId,
          since: since.toISOString(),
          until: until.toISOString(),
        },
      }),
    });

    const json = (await resp.json()) as {
      data?: { viewer?: { accounts?: Array<Record<string, Array<{ sum?: Record<string, number> }>>> } };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      return { rates: null, error: json.errors.map((e) => e.message).join('; ') };
    }

    const acct = json.data?.viewer?.accounts?.[0];
    if (!acct) return { rates: null, error: 'Analytics returned no data for this account.' };

    const sumField = (groups: Array<{ sum?: Record<string, number> }> | undefined, field: string) =>
      (groups ?? []).reduce((n, g) => n + (g.sum?.[field] ?? 0), 0);

    return {
      rates: {
        windowHours: 24,
        workersRequests: { used: sumField(acct.workersInvocationsAdaptive, 'requests'), limit: WORKERS_REQUESTS_PER_DAY },
        d1RowsRead: { used: sumField(acct.d1AnalyticsAdaptiveGroups, 'rowsRead'), limit: D1_ROWS_READ_PER_DAY },
        d1RowsWritten: { used: sumField(acct.d1AnalyticsAdaptiveGroups, 'rowsWritten'), limit: D1_ROWS_WRITTEN_PER_DAY },
      },
      error: null,
    };
  } catch (err) {
    return { rates: null, error: `Could not reach the Analytics API: ${(err as Error).message}` };
  }
}

interface HistoryDay {
  date: string;
  requests: number;
  rowsRead: number;
  rowsWritten: number;
}

/** YYYY-MM-DD in UTC for a Date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Per-day requests + D1 rows for the last `days` days, via the GraphQL Analytics
 * API (grouped by date). Same graceful contract as fetchRates: returns an empty
 * series + a reason string on any problem, never throws. Cloudflare retains
 * ~30 days of this data on the free plan, so `days` is capped accordingly.
 */
export async function fetchHistory(
  cfg: AnalyticsConfig,
  days: number,
): Promise<{ series: HistoryDay[]; error: string | null }> {
  if (!cfg.apiToken || !cfg.accountId) return { series: [], error: null };

  const span = Math.min(Math.max(days, 1), 30);
  const until = new Date();
  const since = new Date(until.getTime() - (span - 1) * 24 * 60 * 60 * 1000);
  const sinceDate = isoDate(since);
  const untilDate = isoDate(until);

  const query = `
    query History($account: String!, $script: String!, $db: String!, $since: Date!, $until: Date!) {
      viewer {
        accounts(filter: { accountTag: $account }) {
          workersInvocationsAdaptiveGroups(
            limit: 100,
            filter: { scriptName: $script, date_geq: $since, date_leq: $until },
            orderBy: [date_ASC]
          ) {
            dimensions { date }
            sum { requests }
          }
          d1AnalyticsAdaptiveGroups(
            limit: 100,
            filter: { databaseId: $db, date_geq: $since, date_leq: $until },
            orderBy: [date_ASC]
          ) {
            dimensions { date }
            sum { rowsRead rowsWritten }
          }
        }
      }
    }`;

  try {
    const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiToken}` },
      body: JSON.stringify({
        query,
        variables: {
          account: cfg.accountId,
          script: cfg.scriptName,
          db: cfg.d1DatabaseId,
          since: sinceDate,
          until: untilDate,
        },
      }),
    });

    const json = (await resp.json()) as {
      data?: {
        viewer?: {
          accounts?: Array<{
            workersInvocationsAdaptiveGroups?: Array<{ dimensions?: { date?: string }; sum?: { requests?: number } }>;
            d1AnalyticsAdaptiveGroups?: Array<{ dimensions?: { date?: string }; sum?: { rowsRead?: number; rowsWritten?: number } }>;
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) return { series: [], error: json.errors.map((e) => e.message).join('; ') };
    const acct = json.data?.viewer?.accounts?.[0];
    if (!acct) return { series: [], error: 'Analytics returned no data for this account.' };

    // Merge the two grouped result sets onto a continuous, gap-filled day axis so
    // the chart has one point per day even when a day had zero traffic.
    const byDate = new Map<string, HistoryDay>();
    for (let i = 0; i < span; i += 1) {
      const d = isoDate(new Date(since.getTime() + i * 24 * 60 * 60 * 1000));
      byDate.set(d, { date: d, requests: 0, rowsRead: 0, rowsWritten: 0 });
    }
    for (const g of acct.workersInvocationsAdaptiveGroups ?? []) {
      const day = g.dimensions?.date && byDate.get(g.dimensions.date);
      if (day) day.requests += g.sum?.requests ?? 0;
    }
    for (const g of acct.d1AnalyticsAdaptiveGroups ?? []) {
      const day = g.dimensions?.date && byDate.get(g.dimensions.date);
      if (day) {
        day.rowsRead += g.sum?.rowsRead ?? 0;
        day.rowsWritten += g.sum?.rowsWritten ?? 0;
      }
    }
    return { series: [...byDate.values()], error: null };
  } catch (err) {
    return { series: [], error: `Could not reach the Analytics API: ${(err as Error).message}` };
  }
}

usage.get('/history', requireAuth, async (c) => {
  const analytics = await loadAnalytics(c.env, db(c.env));
  const days = Math.min(Math.max(Number(c.req.query('days')) || 30, 1), 30);
  const { series, error } = await fetchHistory(analytics, days);
  return c.json({
    days,
    configured: Boolean(analytics.apiToken && analytics.accountId),
    series,
    error,
  });
});

usage.get('/', requireAuth, async (c) => {
  const analytics = await loadAnalytics(c.env, db(c.env));
  const [r2, d1Bytes, rateResult] = await Promise.all([
    c.env.MEDIA ? measureR2(c.env.MEDIA) : Promise.resolve(null),
    measureD1(c.env.DB),
    fetchRates(analytics),
  ]);

  return c.json({
    generatedAt: Math.floor(Date.now() / 1000),
    storage: {
      r2: r2 ? { ...r2, limitBytes: R2_STORAGE_LIMIT } : null,
      d1: { bytes: d1Bytes, limitBytes: D1_STORAGE_LIMIT },
    },
    rates: rateResult.rates,
    ratesConfigured: Boolean(analytics.apiToken && analytics.accountId),
    ratesError: rateResult.error,
  });
});

export default usage;
