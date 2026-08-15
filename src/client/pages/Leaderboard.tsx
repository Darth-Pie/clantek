/**
 * The participation leaderboard — members ranked by events attended, either
 * within the recent window or all-time. Members-only unless the admin has flipped
 * the leaderboard public (Settings → Attendance), in which case logged-out
 * visitors can see it too. Data comes from GET /api/attendance/leaderboard.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { memberAvatar } from '../../shared/avatar';

interface LeaderRow {
  id: number;
  name: string;
  avatar: string | null;
  profileImageUrl: string | null;
  discordId: string;
  count: number;
}

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [mode, setMode] = useState<'recent' | 'all'>('recent');
  const [recentDays, setRecentDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ leaderboard: LeaderRow[]; recentWindowDays: number }>(`/attendance/leaderboard?window=${mode}`)
      .then((d) => {
        setRows(d.leaderboard);
        setRecentDays(d.recentWindowDays);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof ApiError && err.status === 401 ? 'Sign in to view the leaderboard.' : 'Could not load the leaderboard.'),
      )
      .finally(() => setLoading(false));
  }, [mode]);

  return (
    <section className="panel">
      <header className="panel-head roster-head">
        <div>
          <h2>Leaderboard</h2>
          <p className="muted">Ranked by events attended{mode === 'recent' ? ` in the last ${recentDays} days` : ', all-time'}.</p>
        </div>
        <div className="seg-control">
          <button type="button" className={mode === 'recent' ? 'seg active' : 'seg'} onClick={() => setMode('recent')}>
            Recent
          </button>
          <button type="button" className={mode === 'all' ? 'seg active' : 'seg'} onClick={() => setMode('all')}>
            All-time
          </button>
        </div>
      </header>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : error ? (
        <p className="muted">{error}</p>
      ) : rows.length === 0 ? (
        <p className="muted">No attendance recorded yet. Check in to an event to get on the board.</p>
      ) : (
        <ol className="leaderboard">
          {rows.map((m, i) => (
            <li key={m.id} className={`leaderboard-row rank-${i + 1 <= 3 ? i + 1 : 'n'}`}>
              <span className="leaderboard-rank">{i + 1}</span>
              <Link to={`/members/${m.id}`} className="leaderboard-member">
                <img className="avatar" src={memberAvatar(m, 64)} alt="" width={36} height={36} loading="lazy" />
                <span className="name">{m.name}</span>
              </Link>
              <span className="leaderboard-count">
                {m.count}
                <span className="muted small"> event{m.count === 1 ? '' : 's'}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
