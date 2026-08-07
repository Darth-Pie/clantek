/**
 * Analytics admin — wire up (or fix) the live usage dashboard's request &
 * query-rate gauges without editing wrangler.jsonc or redeploying.
 *
 * The storage gauges (R2 bytes, D1 size) always work — they're measured inside
 * the Worker. The daily *rate* gauges need Cloudflare's GraphQL Analytics API,
 * which requires a read-only token plus the account/worker/database this install
 * runs on. Those four values are edited here; saved values override the deploy
 * defaults. The API token is write-only — the form only knows whether one is set.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';

interface Analytics {
  accountId: string;
  scriptName: string;
  d1DatabaseId: string;
  apiTokenSet: boolean;
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
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Analytics | null>(null);

  const [accountId, setAccountId] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [d1DatabaseId, setD1DatabaseId] = useState('');
  // Write-only: empty means "leave unchanged".
  const [apiToken, setApiToken] = useState('');

  const { run, busy, error, notice, warning } = useAction();

  const apply = (a: Analytics) => {
    setSaved(a);
    setAccountId(a.accountId);
    setScriptName(a.scriptName);
    setD1DatabaseId(a.d1DatabaseId);
    setApiToken('');
  };

  useEffect(() => {
    api
      .get<{ analytics: Analytics }>('/settings/analytics')
      .then(({ analytics }) => apply(analytics))
      .finally(() => setLoading(false));
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
      apply(analytics);
      return 'Saved. The usage dashboard now uses these settings.';
    });

  const test = () =>
    run(async () => {
      const res = await api.post<{ ok: boolean; requests?: number; error?: string }>(
        '/settings/analytics/test',
      );
      if (!res.ok) return { warning: res.error ?? 'The Analytics API could not be reached.' };
      return `Connected — Cloudflare reports ${res.requests?.toLocaleString() ?? 0} requests in the last 24h.`;
    });

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="panel analytics-admin">
      <header className="panel-head">
        <h2>Analytics</h2>
        <p className="muted">
          Storage gauges always work. The daily request &amp; query-rate gauges need a read-only
          Cloudflare Analytics token and the IDs for this install. Saved values override the deploy
          defaults; leave a field blank to fall back to the default.
        </p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <fieldset>
        <legend>Cloudflare Analytics</legend>
        <p className="muted small">
          These come from your{' '}
          <Ext href="https://dash.cloudflare.com/">Cloudflare dashboard</Ext>. If you deployed this
          site yourself, the Worker name and D1 ID are already in your <code>wrangler.jsonc</code>.
        </p>
        <label>
          Account ID
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={busy}
            placeholder="32 hex characters"
          />
          <span className="muted small">
            Not secret. Dashboard → <strong>Workers &amp; Pages</strong> → the Account ID is in the
            right-hand sidebar (and in your dashboard URL).{' '}
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
            <Ext href="https://dash.cloudflare.com/profile/api-tokens">Create a token ↗</Ext> →
            “Create Custom Token” → add the <strong>Account · Account Analytics · Read</strong>{' '}
            permission. Stored in this site's database — see the note below.
          </span>
        </label>
        <label>
          Worker name
          <input
            value={scriptName}
            onChange={(e) => setScriptName(e.target.value)}
            disabled={busy}
            placeholder="e.g. mustr"
          />
          <span className="muted small">
            The <code>name</code> in your <code>wrangler.jsonc</code> — its requests are counted. Also
            shown under Dashboard → <strong>Workers &amp; Pages</strong>.
          </span>
        </label>
        <label>
          D1 Database ID
          <input
            value={d1DatabaseId}
            onChange={(e) => setD1DatabaseId(e.target.value)}
            disabled={busy}
            placeholder="36-character UUID"
          />
          <span className="muted small">
            The <code>database_id</code> in your <code>wrangler.jsonc</code> — its rows read/written
            are counted. Also under Dashboard → <strong>Storage &amp; Databases → D1</strong> → your
            database.
          </span>
        </label>
      </fieldset>

      <p className="muted small warn">
        Note: the API token is stored in this site's database (not an encrypted Cloudflare secret),
        so anyone with database access or god-admin rights can read it. Use a read-only token scoped
        to analytics only.
      </p>

      <div className="news-editor-actions">
        <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
          Save
        </button>
        <button
          disabled={busy}
          onClick={() => void test()}
          title="Query the Analytics API with the saved token to confirm it works"
        >
          Test connection
        </button>
      </div>
    </section>
  );
}
