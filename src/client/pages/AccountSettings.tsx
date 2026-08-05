/**
 * Personal account settings. Today this is "API access": a member mints and
 * revokes personal access tokens for the mobile/native app (or scripts). The
 * raw token is shown exactly once, right after it's created — after that only
 * its label and short prefix are ever visible.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

interface ApiToken {
  id: number;
  label: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
}

interface CreatedToken extends ApiToken {
  token: string;
}

function when(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AccountSettings() {
  const { viewer } = useSession();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The one-time full token value, shown until the member dismisses it.
  const [fresh, setFresh] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    api
      .get<{ tokens: ApiToken[] }>('/auth/tokens')
      .then(({ tokens }) => setTokens(tokens))
      .catch(() => setTokens([]));

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<CreatedToken>('/auth/tokens', { label: label.trim() || 'Mobile app' });
      setFresh(created);
      setCopied(false);
      setLabel('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the token.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number, name: string) {
    if (!window.confirm(`Revoke “${name}”? Any app or script using it will stop working immediately.`)) return;
    try {
      await api.del(`/auth/tokens/${id}`);
      if (fresh?.id === id) setFresh(null);
      await load();
    } catch {
      setError('Could not revoke the token.');
    }
  }

  async function copyFresh() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.token);
      setCopied(true);
    } catch {
      /* Clipboard blocked — the value is selectable in the box regardless. */
    }
  }

  return (
    <section className="panel account-settings">
      <header className="panel-head">
        <div>
          <h2>Account</h2>
          <p className="muted">Signed in as {viewer ? viewer.username : ''}. Manage access for apps and scripts below.</p>
        </div>
      </header>

      <h3 className="account-subhead">API access</h3>
      <p className="muted">
        A personal access token lets the mobile app (or a script) sign in as you. It carries exactly your
        permissions. Treat it like a password — anyone with it can act as you until you revoke it.
      </p>

      {error && <div className="notice error">{error}</div>}

      {fresh && (
        <div className="token-reveal">
          <strong>Copy your new token now — it won’t be shown again.</strong>
          <div className="token-reveal-row">
            <code className="token-value">{fresh.token}</code>
            <button type="button" className="primary" onClick={copyFresh}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <button type="button" className="ghost" onClick={() => setFresh(null)}>
            Done
          </button>
        </div>
      )}

      <div className="token-create">
        <input
          type="text"
          value={label}
          maxLength={60}
          placeholder="Name this token (e.g. “My iPhone”)"
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
        />
        <button type="button" className="primary" onClick={() => void create()} disabled={busy}>
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </div>

      {tokens === null ? (
        <p className="muted">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="muted">No tokens yet.</p>
      ) : (
        <table className="token-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Token</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td><code>{t.prefix}…</code></td>
                <td>{when(t.createdAt)}</td>
                <td>{when(t.lastUsedAt)}</td>
                <td>{when(t.expiresAt)}</td>
                <td>
                  <button type="button" className="mini danger" onClick={() => void revoke(t.id, t.label)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
