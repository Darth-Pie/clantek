/**
 * A member's activity — participation score plus a GitHub-style calendar heatmap
 * of their on-site activity (and event attendance), on their profile.
 *
 * Visibility is enforced server-side: a member always sees their own; others are
 * gated by the roles configured in Settings → Attendance (gods always). On a 403
 * or 404 (turned off, or not permitted) the whole section simply renders nothing,
 * so the caller can drop it in unconditionally.
 */

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { unixDay, SECONDS_PER_DAY } from '../../shared/attendance';

interface HeatDay {
  day: number;
  count: number;
}
interface ActivityData {
  days: HeatDay[];
  window: number;
  score: { recent: number; all: number };
  recentWindowDays: number;
}

/** Bucket a day's activity count into an intensity level 0–4 for colouring. */
function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MemberActivity({ userId }: { userId: number }) {
  const [data, setData] = useState<ActivityData | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setData(null);
    setHidden(false);
    api
      .get<ActivityData>(`/attendance/heatmap/${userId}`)
      .then(setData)
      .catch((err) => {
        // 403 (not permitted) / 404 (feature off) → hide the whole section.
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) setHidden(true);
        else setHidden(true);
      });
  }, [userId]);

  if (hidden) return null;
  if (!data) return <div className="block"><h3>Activity</h3><p className="muted small">Loading…</p></div>;

  // Build the calendar: columns are weeks (Sun–Sat), ending today. unixDay 0 is a
  // Thursday, so day-of-week = (unixDay + 4) % 7 with Sunday = 0.
  const today = unixDay(Math.floor(Date.now() / 1000));
  let start = today - data.window;
  while ((start + 4) % 7 !== 0) start--; // back up to the week's Sunday

  const counts = new Map(data.days.map((d) => [d.day, d.count]));
  const weeks: { day: number; count: number; inRange: boolean }[][] = [];
  for (let d = start; d <= today; d += 7) {
    const col: { day: number; count: number; inRange: boolean }[] = [];
    for (let r = 0; r < 7; r++) {
      const day = d + r;
      col.push({ day, count: counts.get(day) ?? 0, inRange: day <= today && day >= today - data.window });
    }
    weeks.push(col);
  }

  // Month labels above the columns where a new month begins.
  const monthLabels = weeks.map((col, i) => {
    const first = new Date(col[0]!.day * SECONDS_PER_DAY * 1000);
    const prev = i > 0 ? new Date(weeks[i - 1]![0]!.day * SECONDS_PER_DAY * 1000) : null;
    return !prev || prev.getMonth() !== first.getMonth() ? MONTHS[first.getMonth()] : '';
  });

  const dateLabel = (day: number) =>
    new Date(day * SECONDS_PER_DAY * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="block member-activity">
      <div className="member-activity-head">
        <h3>Activity</h3>
        <div className="member-activity-score">
          <span className="score-num">{data.score.recent}</span>
          <span className="muted small">events · last {data.recentWindowDays}d</span>
          <span className="score-sep">·</span>
          <span className="score-num">{data.score.all}</span>
          <span className="muted small">all-time</span>
        </div>
      </div>

      <div className="heatmap-scroll">
        <div className="heatmap">
          <div className="heatmap-months" aria-hidden>
            {monthLabels.map((m, i) => (
              <span key={i} className="heatmap-month">
                {m}
              </span>
            ))}
          </div>
          <div className="heatmap-grid">
            {weeks.map((col, i) => (
              <div key={i} className="heatmap-col">
                {col.map((cell) => (
                  <span
                    key={cell.day}
                    className={`heatmap-cell heat-${cell.inRange ? level(cell.count) : 'off'}`}
                    title={cell.inRange ? `${cell.count} on ${dateLabel(cell.day)}` : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-legend muted small">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heatmap-cell heat-${l}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
