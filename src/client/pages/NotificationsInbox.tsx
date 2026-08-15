/**
 * Admin → Notifications → Your notifications (first tab).
 *
 * The viewer's own role-gated notification feed, with a shared "Mark as
 * reviewed" action. Reviews are first-come and single: once one recipient
 * reviews a notification, everyone who received it sees who reviewed it (here
 * and in the header bell). Marking one reviewed also clears its unread state.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';

interface Reviewer {
  id: number;
  name: string;
}
interface Notif {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: number;
  read: boolean;
  reviewedAt: number | null;
  reviewer: Reviewer | null;
}

function when(sec: number): string {
  return new Date(sec * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsInbox() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const { busy, error, notice, warning, setError } = useAction();

  useEffect(() => {
    api
      .get<{ notifications: Notif[] }>('/notifications')
      .then((d) => {
        setItems(d.notifications ?? []);
        // Viewing the inbox is the "seen" signal — clear the bell's unread count.
        if ((d.notifications ?? []).some((n) => !n.read)) void api.post('/notifications/read').catch(() => {});
      })
      .catch(() => setError('Could not load your notifications.'))
      .finally(() => setLoading(false));
  }, [setError]);

  const review = (id: number) =>
    api
      .post<{ reviewedAt: number | null; reviewer: Reviewer | null }>(`/notifications/${id}/review`)
      .then((d) =>
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, reviewedAt: d.reviewedAt, reviewer: d.reviewer } : n))),
      )
      .catch(() => setError('Could not mark that reviewed.'));

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="panel notif-inbox">
      <header className="panel-head">
        <h2>Your notifications</h2>
        <p className="muted">
          Notifications routed to your roles. Marking one <strong>reviewed</strong> shows your name to
          everyone else who received it, so the rest of the team knows it’s handled.
        </p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      {items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="notif-inbox-list">
          {items.map((n) => (
            <li key={n.id} className={`notif-inbox-row${n.read ? '' : ' unread'}`}>
              <div className="notif-inbox-main">
                <div className="notif-inbox-title">
                  {n.link ? <Link to={n.link}>{n.title}</Link> : n.title}
                </div>
                {n.body && <div className="muted small">{n.body}</div>}
                <div className="muted small notif-inbox-when">{when(n.createdAt)}</div>
              </div>
              <div className="notif-inbox-review">
                {n.reviewer ? (
                  <span className="notif-reviewed">
                    ✓ Reviewed by <strong>{n.reviewer.name}</strong>
                    {n.reviewedAt && <span className="muted small"> · {when(n.reviewedAt)}</span>}
                  </span>
                ) : (
                  <button type="button" className="primary small" disabled={busy} onClick={() => void review(n.id)}>
                    Mark as reviewed
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
