/**
 * The applicant queue — people who signed in with Discord but aren't members yet
 * (status 'pending'). Officers approve them (default rank + Discord roles if
 * they're in the guild) or ban them. Anyone who joins the Discord and signs in
 * again is approved automatically, so this is for the rest.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { memberName } from '../../shared/names';
import { memberAvatar } from '../../shared/avatar';

interface Applicant {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  displayName: string | null;
  avatar: string | null;
  profileImageUrl: string | null;
  createdAt: number;
  bio: string | null;
}

export default function ApplicantsAdmin() {
  const [applicants, setApplicants] = useState<Applicant[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    api
      .get<{ applicants: Applicant[] }>('/members/applicants')
      .then((d) => setApplicants(d.applicants))
      .catch(() => setApplicants([]));

  useEffect(() => {
    void load();
  }, []);

  async function approve(a: Applicant) {
    setBusy(a.id);
    setMessage(null);
    try {
      await api.post(`/members/${a.id}/approve`);
      setMessage(`${memberName(a)} approved.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not approve.');
    } finally {
      setBusy(null);
    }
  }

  async function ban(a: Applicant) {
    const reason = window.prompt(
      `Ban ${memberName(a)}? They can't sign in again until you lift the ban. Reason:`,
    );
    if (!reason || !reason.trim()) return;
    setBusy(a.id);
    setMessage(null);
    try {
      await api.post(`/members/${a.id}/ban`, { reason });
      setMessage(`${memberName(a)} banned.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not ban.');
    } finally {
      setBusy(null);
    }
  }

  if (!applicants) return <div className="loading">Loading…</div>;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Applicants</h2>
      </header>
      <p className="muted small">
        People who signed in with Discord but aren’t members yet. Approving grants the default rank (and its
        Discord roles, if they’re in your server). Anyone who joins your Discord and signs in again is approved
        automatically.
      </p>
      {message && <div className="notice">{message}</div>}
      {applicants.length === 0 ? (
        <p className="empty">No one is waiting for approval.</p>
      ) : (
        <ul className="people-review-list">
          {applicants.map((a) => (
            <li key={a.id} className="people-review-item">
              <img className="avatar" src={memberAvatar(a, 64)} alt="" width={44} height={44} loading="lazy" />
              <div className="people-review-info">
                <div className="name">{memberName(a)}</div>
                <div className="muted small">Applied {new Date(a.createdAt * 1000).toLocaleDateString()}</div>
                {a.bio && <p className="people-review-bio">{a.bio}</p>}
              </div>
              <div className="people-review-actions">
                <button type="button" className="primary" disabled={busy === a.id} onClick={() => approve(a)}>
                  Approve
                </button>
                <button type="button" className="ghost danger" disabled={busy === a.id} onClick={() => ban(a)}>
                  Ban
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
