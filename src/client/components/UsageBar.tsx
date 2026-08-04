/**
 * Free-tier usage gauges, shown across the top of the admin panel.
 *
 * Storage always renders; the daily request/query rates render once a
 * read-only Cloudflare Analytics token is configured (otherwise a short setup
 * hint takes their place). Each bar shifts from green toward red as it nears
 * its limit. Non-critical: if the endpoint fails, the bar just hides itself.
 */

import { useEffect, useState } from 'react';
import { MorphIcon } from 'morphicons/react';
import { ChevronDown, ChevronRight } from 'lucide';
import { api } from '../lib/api';

interface Metric {
  used: number;
  limit: number;
}
interface Usage {
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

/** 0% → green, 100% → red, interpolated through amber. */
function gaugeColor(pct: number): string {
  return `hsl(${Math.max(0, 1 - pct) * 140}, 68%, 46%)`;
}

function Gauge({
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
    <div className="usage-gauge">
      <div className="usage-gauge-head">
        <span className="usage-label">
          {label}
          {sub && <span className="usage-sub"> · {sub}</span>}
        </span>
        <span className="usage-value">
          {format(used)} <span className="muted">/ {format(limit)}</span>
        </span>
      </div>
      <div className="usage-track">
        <div className="usage-fill" style={{ width: `${Math.max(shown, 1.5)}%`, background: color }} />
      </div>
      <div className="usage-pct" style={{ color }}>
        {shown < 1 ? shown.toFixed(1) : Math.round(shown)}%
      </div>
    </div>
  );
}

export default function UsageBar() {
  const [data, setData] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  useEffect(() => {
    api
      .get<Usage>('/usage')
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  if (!data) return <div className="usage-bar usage-loading">Loading usage…</div>;

  return (
    <div className="usage-bar">
      <div className="usage-gauges">
        {data.storage.r2 && (
          <Gauge label="R2 storage" used={data.storage.r2.bytes} limit={data.storage.r2.limitBytes} format={formatBytes} />
        )}
        <Gauge label="D1 storage" used={data.storage.d1.bytes} limit={data.storage.d1.limitBytes} format={formatBytes} />

        {data.rates ? (
          <>
            <Gauge label="Requests" sub="24h" used={data.rates.workersRequests.used} limit={data.rates.workersRequests.limit} format={formatNum} />
            <Gauge label="D1 rows read" sub="24h" used={data.rates.d1RowsRead.used} limit={data.rates.d1RowsRead.limit} format={formatNum} />
            <Gauge label="D1 rows written" sub="24h" used={data.rates.d1RowsWritten.used} limit={data.rates.d1RowsWritten.limit} format={formatNum} />
          </>
        ) : (
          <details
            className="usage-connect"
            onToggle={(e) => setConnectOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary>
              <MorphIcon
                className="disclosure-caret"
                icon={connectOpen ? ChevronDown : ChevronRight}
                size={14}
                aria-hidden
              />
              Connect Analytics for live request &amp; query rates
            </summary>
            <ol className="small muted">
              <li>Create a Cloudflare API token with <strong>Account Analytics: Read</strong>.</li>
              <li>
                Set <code>CLOUDFLARE_ACCOUNT_ID</code> in <code>wrangler.jsonc</code>, then run{' '}
                <code>npx wrangler secret put CLOUDFLARE_API_TOKEN</code> and redeploy.
              </li>
            </ol>
          </details>
        )}
      </div>

      {data.ratesError && (
        <div className="usage-error small">Live rates unavailable: {data.ratesError}</div>
      )}
    </div>
  );
}
