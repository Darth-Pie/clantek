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
import type { AppContext, Env } from '../env';
import { requireAuth } from '../middleware/auth';

const usage = new Hono<AppContext>();

const GB = 1024 * 1024 * 1024;
const R2_STORAGE_LIMIT = 10 * GB;
const D1_STORAGE_LIMIT = 5 * GB;
const WORKERS_REQUESTS_PER_DAY = 100_000;
const D1_ROWS_READ_PER_DAY = 5_000_000;
const D1_ROWS_WRITTEN_PER_DAY = 100_000;

// Must match wrangler.jsonc (worker name + d1 database_id).
const SCRIPT_NAME = 'clantek';
const D1_DATABASE_ID = '19d7ebe6-e379-411b-8597-17b630cb8394';

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
async function fetchRates(env: Env): Promise<{ rates: Rates | null; error: string | null }> {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
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
        authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          account: env.CLOUDFLARE_ACCOUNT_ID,
          script: SCRIPT_NAME,
          db: D1_DATABASE_ID,
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

usage.get('/', requireAuth, async (c) => {
  const [r2, d1Bytes, rateResult] = await Promise.all([
    c.env.MEDIA ? measureR2(c.env.MEDIA) : Promise.resolve(null),
    measureD1(c.env.DB),
    fetchRates(c.env),
  ]);

  return c.json({
    generatedAt: Math.floor(Date.now() / 1000),
    storage: {
      r2: r2 ? { ...r2, limitBytes: R2_STORAGE_LIMIT } : null,
      d1: { bytes: d1Bytes, limitBytes: D1_STORAGE_LIMIT },
    },
    rates: rateResult.rates,
    ratesConfigured: Boolean(c.env.CLOUDFLARE_API_TOKEN && c.env.CLOUDFLARE_ACCOUNT_ID),
    ratesError: rateResult.error,
  });
});

export default usage;
