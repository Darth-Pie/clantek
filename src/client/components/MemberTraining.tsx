/**
 * A member's private training status, shown on their profile. Visible to the
 * member themselves and to holders of training.view; nobody else. A training.view
 * officer who also holds training.manage can mark courses here; a member can tick
 * off their own self-attested courses. Renders nothing when there are no courses.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

interface StatusRow {
  id: number;
  title: string;
  completionMode: 'self' | 'officer';
  required: boolean;
  completed: boolean;
  completedAt: number | null;
}

export default function MemberTraining({ userId, isSelf }: { userId: number; isSelf: boolean }) {
  const { can } = useSession();
  const canManage = can('training.manage');
  const [rows, setRows] = useState<StatusRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () =>
    api
      .get<{ trainings: StatusRow[] }>(`/training/status/${userId}`)
      .then((d) => setRows(d.trainings))
      .catch(() => setRows([]));

  useEffect(() => {
    void load();
  }, [userId]);

  const canToggle = (r: StatusRow) => canManage || (isSelf && r.completionMode === 'self');

  const toggle = async (r: StatusRow) => {
    setBusy(r.id);
    try {
      if (r.completed) await api.del(`/training/${r.id}/complete`, { userId });
      else await api.post(`/training/${r.id}/complete`, { userId });
      await load();
    } catch {
      /* leave as-is on failure */
    } finally {
      setBusy(null);
    }
  };

  if (rows === null || rows.length === 0) return null;

  // Required-but-incomplete first (what needs attention), then the rest.
  const ordered = [...rows].sort((a, b) => {
    const aw = a.required && !a.completed ? 0 : 1;
    const bw = b.required && !b.completed ? 0 : 1;
    return aw - bw;
  });

  return (
    <section className="member-training">
      <h3>Training</h3>
      <ul className="member-training-list">
        {ordered.map((r) => (
          <li key={r.id} className={r.completed ? 'done' : r.required ? 'required' : ''}>
            <span className="member-training-check" aria-hidden>
              {r.completed ? '✓' : '○'}
            </span>
            <span className="member-training-name">
              {r.title}
              {r.required && <span className="training-req">Required</span>}
            </span>
            {r.completedAt && (
              <span className="muted small">{new Date(r.completedAt * 1000).toLocaleDateString()}</span>
            )}
            {canToggle(r) && (
              <button type="button" className="mini" disabled={busy === r.id} onClick={() => void toggle(r)}>
                {r.completed ? 'Unmark' : 'Mark done'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
