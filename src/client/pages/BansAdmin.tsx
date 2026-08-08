/**
 * The ban list — Discord ids blocked from signing in. Lifting a ban lets them
 * sign in again (as an applicant, or a member if they're in the guild).
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Ban {
  discordId: string;
  username: string | null;
  reason: string | null;
  bannedAt: number;
  bannedBy: string | null;
}

export default function BansAdmin() {
  const [bans, setBans] = useState<Ban[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    api
      .get<{ bans: Ban[] }>('/bans')
      .then((d) => setBans(d.bans))
      .catch(() => setBans([]));

  useEffect(() => {
    void load();
  }, []);

  async function unban(b: Ban) {
    if (!window.confirm(`Lift the ban on ${b.username ?? b.discordId}? They’ll be able to sign in again.`)) return;
    setBusy(b.discordId);
    setMessage(null);
    try {
      await api.del(`/bans/${b.discordId}`);
      setMessage('Ban lifted.');
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not lift the ban.');
    } finally {
      setBusy(null);
    }
  }

  if (!bans) return <div className="loading">Loading…</div>;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Bans</h2>
      </header>
      <p className="muted small">
        Discord users blocked from signing in. A ban survives removing the member, so it always holds. Lifting a
        ban lets them sign in again.
      </p>
      {message && <div className="notice">{message}</div>}
      {bans.length === 0 ? (
        <p className="empty">No one is banned.</p>
      ) : (
        <ul className="people-review-list">
          {bans.map((b) => (
            <li key={b.discordId} className="people-review-item">
              <div className="people-review-info">
                <div className="name">{b.username ?? b.discordId}</div>
                <div className="muted small">
                  Banned {new Date(b.bannedAt * 1000).toLocaleDateString()}
                  {b.bannedBy ? ` by ${b.bannedBy}` : ''} · {b.discordId}
                </div>
                {b.reason && <p className="people-review-bio">{b.reason}</p>}
              </div>
              <div className="people-review-actions">
                <button type="button" className="ghost" disabled={busy === b.discordId} onClick={() => unban(b)}>
                  Unban
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
