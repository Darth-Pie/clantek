/**
 * Analytics & Usage — the admin dashboard for this install's Cloudflare footprint.
 *
 * Two data sources, both graceful:
 *  - /usage        — storage (R2 bytes/objects, D1 size) measured inside the
 *                    Worker (always works) + 24h request/row rates from the
 *                    GraphQL Analytics API (needs a token).
 *  - /usage/history — per-day requests & D1 rows for the last 30 days (needs a
 *                    token; empty otherwise).
 *
 * The page leads with current usage + a plain-language cost verdict, then a
 * 30-day trend, and finally the connection settings (collapsed once wired up).
 * The daily *rate* gauges and the trend only appear when a read-only
 * "Account Analytics: Read" token is configured — the form at the bottom is how
 * you set that, no redeploy needed. The API token is write-only here: the form
 * only knows whether one is set.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';

/* ---------- shared shapes (mirror the server payloads) ---------- */
interface Metric {
  used: number;
  limit: number;
}
interface Usage {
  generatedAt: number;
  storage: {
    r2: { bytes: number; objects: number; truncated: boolean; limitBytes: number } | null;
    d1: { bytes: number; limitBytes: number };
  };
  rates: {
    windowHours: number;
    workersRequests: Metric;
    d1RowsRead: Metric;
    d1RowsWritten: Metric;
  } | null;
  ratesConfigured: boolean;
  ratesError: string | null;
}
interface HistoryDay {
  date: string;
  requests: number;
  rowsRead: number;
  rowsWritten: number;
}
interface History {
  days: number;
  configured: boolean;
  series: HistoryDay[];
  error: string | null;
}

interface Analytics {
  accountId: string;
  scriptName: string;
  d1DatabaseId: string;
  apiTokenSet: boolean;
}

const R2_OVERAGE_PER_GB = 0.015;

/* ---------- formatting ---------- */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const formatNum = (n: number) => compact.format(n);
/** 0% → green, 100% → red, interpolated through amber (matches the top usage bar). */
function gaugeColor(pct: number): string {
  return `hsl(${Math.max(0, 1 - pct) * 140}, 68%, 46%)`;
}

/* ---------- a big usage card with a bar ---------- */
function UsageCard({
  label,
  sub,
  used,
  limit,
  format,
}: {
  label: string;
  sub?: string;
  used: number;
  limit: number;
  format: (n: number) => string;
}) {
  const pct = limit > 0 ? Math.min(1, used / limit) : 0;
  const color = gaugeColor(pct);
  const shown = pct * 100;
  return (
    <div className="usage-card">
      <div className="usage-card-label">
        {label}
        {sub && <span className="usage-card-sub"> · {sub}</span>}
      </div>
      <div className="usage-card-value">{format(used)}</div>
      <div className="usage-card-of muted">of {format(limit)}</div>
      <div className="usage-track">
        <div className="usage-fill" style={{ width: `${Math.max(shown, 1.5)}%`, background: color }} />
      </div>
      <div className="usage-card-pct" style={{ color }}>
        {shown < 1 ? shown.toFixed(1) : Math.round(shown)}% used
      </div>
    </div>
  );
}

/* ---------- an inline SVG sparkline (bars) ---------- */
function Sparkline({
  series,
  pick,
  color,
  format,
}: {
  series: HistoryDay[];
  pick: (d: HistoryDay) => number;
  color: string;
  format: (n: number) => string;
}) {
  const w = 100;
  const h = 32;
  const gap = 1.2;
  const n = series.length;
  if (n === 0) return null;
  const max = Math.max(1, ...series.map(pick));
  const bw = (w - gap * (n - 1)) / n;
  const total = series.reduce((s, d) => s + pick(d), 0);
  const peak = series.reduce((m, d) => (pick(d) > pick(m) ? d : m), series[0]!);
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="spark-svg" role="img" aria-label="30-day trend">
        {series.map((d, i) => {
          const val = pick(d);
          const bh = Math.max(val > 0 ? 1.5 : 0, (val / max) * h);
          return (
            <rect
              key={d.date}
              x={i * (bw + gap)}
              y={h - bh}
              width={bw}
              height={bh}
              rx={0.6}
              fill={color}
              opacity={0.35 + 0.65 * (val / max)}
            >
              <title>{`${d.date}: ${format(val)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="spark-foot muted small">
        <span>30-day total {format(total)}</span>
        {peak && <span>peak {format(pick(peak))} · {peak.date.slice(5)}</span>}
      </div>
    </div>
  );
}

/** A plain external link that opens safely in a new tab. */
function Ext({ href, children }: { href: string; children: string }) {
  return (
    <a className="ext-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function AnalyticsAdmin() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);
  const [history, setHistory] = useState<History | null>(null);

  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saved, setSaved] = useState<Analytics | null>(null);
  const [accountId, setAccountId] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [d1DatabaseId, setD1DatabaseId] = useState('');
  const [apiToken, setApiToken] = useState(''); // write-only: empty = leave unchanged

  const { run, busy, error, notice, warning } = useAction();

  const loadUsage = () => {
    api.get<Usage>('/usage').then(setUsage).catch(() => setUsageFailed(true));
    api.get<History>('/usage/history?days=30').then(setHistory).catch(() => setHistory(null));
  };

  const applyCfg = (a: Analytics) => {
    setSaved(a);
    setAccountId(a.accountId);
    setScriptName(a.scriptName);
    setD1DatabaseId(a.d1DatabaseId);
    setApiToken('');
  };

  useEffect(() => {
    loadUsage();
    api
      .get<{ analytics: Analytics }>('/settings/analytics')
      .then(({ analytics }) => applyCfg(analytics))
      .finally(() => setLoadingCfg(false));
  }, []);

  const dirty =
    !!saved &&
    (accountId !== saved.accountId ||
      scriptName !== saved.scriptName ||
      d1DatabaseId !== saved.d1DatabaseId ||
      apiToken !== '');

  const save = () =>
    run(async () => {
      const { analytics } = await api.put<{ analytics: Analytics }>('/settings/analytics', {
        analytics: { accountId, scriptName, d1DatabaseId, apiToken },
      });
      applyCfg(analytics);
      loadUsage(); // re-pull now that the token may be live
      return 'Saved. Live rates and the 30-day trend now use these settings.';
    });

  const test = () =>
    run(async () => {
      const res = await api.post<{ ok: boolean; requests?: number; error?: string }>('/settings/analytics/test');
      if (!res.ok) return { warning: res.error ?? 'The Analytics API could not be reached.' };
      return `Connected — Cloudflare reports ${res.requests?.toLocaleString() ?? 0} requests in the last 24h.`;
    });

  // Cost verdict — mirrors the /about math: everything is free unless stored
  // images pass the 10 GB R2 tier, billed at $0.015/GB-month.
  const r2Bytes = usage?.storage.r2?.bytes ?? 0;
  const r2LimitBytes = usage?.storage.r2?.limitBytes ?? 10 * 1024 ** 3;
  const overGB = Math.max(0, (r2Bytes - r2LimitBytes) / 1024 ** 3);
  const monthlyCost = overGB * R2_OVERAGE_PER_GB;

  const connected = usage?.ratesConfigured ?? false;

  return (
    <section className="panel analytics-admin">
      <header className="panel-head">
        <h2>Analytics &amp; Usage</h2>
        <p className="muted">
          This install's live Cloudflare footprint against the free-tier limits. Storage is measured
          directly; request &amp; query rates and the 30-day trend need a read-only Analytics token
          (set below).
        </p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      {/* Cost verdict */}
      <div className={`analytics-verdict ${monthlyCost > 0 ? 'over' : 'ok'}`}>
        {monthlyCost > 0 ? (
          <>
            <strong>~${monthlyCost < 0.01 ? '0.01' : monthlyCost.toFixed(2)}/month</strong> — stored media is
            over the 10&nbsp;GB free tier by {overGB.toFixed(2)}&nbsp;GB. Everything else is free.
          </>
        ) : (
          <>
            <strong>$0/month to Cloudflare.</strong> Comfortably inside every free-tier limit — the only running
            cost is your domain name.
          </>
        )}
      </div>

      {/* Current usage */}
      {usageFailed ? (
        <p className="empty">Couldn’t load live usage right now.</p>
      ) : !usage ? (
        <div className="loading">Loading usage…</div>
      ) : (
        <>
          <h3 className="analytics-h">Current usage</h3>
          <div className="usage-cards">
            {usage.storage.r2 && (
              <UsageCard label="Media storage" sub="R2" used={usage.storage.r2.bytes} limit={usage.storage.r2.limitBytes} format={formatBytes} />
            )}
            <UsageCard label="Database" sub="D1" used={usage.storage.d1.bytes} limit={usage.storage.d1.limitBytes} format={formatBytes} />
            {usage.rates ? (
              <>
                <UsageCard label="Requests" sub="24h" used={usage.rates.workersRequests.used} limit={usage.rates.workersRequests.limit} format={formatNum} />
                <UsageCard label="Rows read" sub="24h" used={usage.rates.d1RowsRead.used} limit={usage.rates.d1RowsRead.limit} format={formatNum} />
                <UsageCard label="Rows written" sub="24h" used={usage.rates.d1RowsWritten.used} limit={usage.rates.d1RowsWritten.limit} format={formatNum} />
              </>
            ) : null}
          </div>
          {usage.storage.r2?.truncated && (
            <p className="muted small">Media total is a lower bound — the bucket has more objects than a single scan counts.</p>
          )}
          {usage.storage.r2 && (
            <p className="muted small">
              {usage.storage.r2.objects.toLocaleString()} stored image{usage.storage.r2.objects === 1 ? '' : 's'}.
            </p>
          )}
          {!connected && (
            <p className="muted small">
              Request &amp; query rates are hidden until an Analytics token is connected below.
            </p>
          )}
          {usage.ratesError && <p className="muted small warn">Live rates unavailable: {usage.ratesError}</p>}
        </>
      )}

      {/* 30-day trend */}
      {connected && (
        <>
          <h3 className="analytics-h">Last 30 days</h3>
          {history && history.series.length > 0 ? (
            <div className="usage-cards">
              <div className="usage-card wide">
                <div className="usage-card-label">Requests / day</div>
                <Sparkline series={history.series} pick={(d) => d.requests} color="var(--color-accent, #5b8cff)" format={formatNum} />
              </div>
              <div className="usage-card wide">
                <div className="usage-card-label">D1 rows read / day</div>
                <Sparkline series={history.series} pick={(d) => d.rowsRead} color="#22c55e" format={formatNum} />
              </div>
              <div className="usage-card wide">
                <div className="usage-card-label">D1 rows written / day</div>
                <Sparkline series={history.series} pick={(d) => d.rowsWritten} color="#f59e0b" format={formatNum} />
              </div>
            </div>
          ) : history?.error ? (
            <p className="muted small warn">Trend unavailable: {history.error}</p>
          ) : (
            <p className="muted small">No trend data yet — Cloudflare needs a day or two of history.</p>
          )}
        </>
      )}

      {/* Connection settings */}
      <details className="analytics-connect" open={!loadingCfg && !connected}>
        <summary>
          Connection {connected ? '(connected)' : '(not connected)'}
        </summary>

        {loadingCfg ? (
          <div className="loading">Loading…</div>
        ) : (
          <>
            <fieldset>
              <legend>Cloudflare Analytics</legend>
              <p className="muted small">
                These come from your <Ext href="https://dash.cloudflare.com/">Cloudflare dashboard</Ext>. If you
                deployed this site yourself, the Worker name and D1 ID are already in your{' '}
                <code>wrangler.jsonc</code>.
              </p>
              <label>
                Account ID
                <input value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={busy} placeholder="32 hex characters" />
                <span className="muted small">
                  Not secret. Dashboard → <strong>Workers &amp; Pages</strong> → the Account ID is in the right-hand
                  sidebar (and in your dashboard URL).{' '}
                  <Ext href="https://dash.cloudflare.com/?to=/:account/workers-and-pages">Open ↗</Ext>
                </span>
              </label>
              <label>
                API Token
                <input
                  type="password"
                  value={apiToken}
                  placeholder={saved?.apiTokenSet ? '•••••••• (set — leave blank to keep)' : 'not set'}
                  onChange={(e) => setApiToken(e.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                />
                <span className="muted small">
                  <Ext href="https://dash.cloudflare.com/profile/api-tokens">Create a token ↗</Ext> → “Create Custom
                  Token” → add the <strong>Account · Account Analytics · Read</strong> permission. Stored in this
                  site's database — see the note below.
                </span>
              </label>
              <label>
                Worker name
                <input value={scriptName} onChange={(e) => setScriptName(e.target.value)} disabled={busy} placeholder="e.g. mustr" />
                <span className="muted small">
                  The <code>name</code> in your <code>wrangler.jsonc</code> — its requests are counted.
                </span>
              </label>
              <label>
                D1 Database ID
                <input value={d1DatabaseId} onChange={(e) => setD1DatabaseId(e.target.value)} disabled={busy} placeholder="36-character UUID" />
                <span className="muted small">
                  The <code>database_id</code> in your <code>wrangler.jsonc</code> — its rows read/written are counted.
                </span>
              </label>
            </fieldset>

            <p className="muted small warn">
              Note: the API token is stored in this site's database (not an encrypted Cloudflare secret), so anyone
              with database access or god-admin rights can read it. Use a read-only token scoped to analytics only.
            </p>

            <div className="news-editor-actions">
              <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
                Save
              </button>
              <button disabled={busy} onClick={() => void test()} title="Query the Analytics API with the saved token to confirm it works">
                Test connection
              </button>
            </div>
          </>
        )}
      </details>
    </section>
  );
}
