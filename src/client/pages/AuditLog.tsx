/**
 * The activity log — a read-only feed of who did what, gated on audit.view.
 *
 * Every mutation elsewhere on the site writes an entry; this surfaces them,
 * newest first, with the actor, the member affected, the reason (mandatory on
 * negative actions), and where it happened (web or a Discord slash command).
 * Category chips narrow to the action group; "Load more" pages through.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Alerts, useAction } from '../lib/action';
import { memberAvatar } from '../../shared/avatar';

interface Actor {
  id: number;
  name: string;
  discordId: string;
  avatar: string | null;
  profileImageUrl: string | null;
}
interface AuditEntry {
  id: number;
  action: string;
  reason: string | null;
  meta: Record<string, unknown> | null;
  source: 'web' | 'discord' | 'system';
  createdAt: number;
  targetType: string | null;
  targetId: string | null;
  actor: Actor | null;
  target: { id: number; name: string } | null;
}

const PAGE = 50;

// Category chips → the `action` prefix they filter on. Empty = everything.
const CATEGORIES: { key: string; label: string; prefix: string }[] = [
  { key: 'all', label: 'All', prefix: '' },
  { key: 'members', label: 'Members', prefix: 'member' },
  { key: 'medals', label: 'Medals', prefix: 'medal' },
  { key: 'warrecords', label: 'War records', prefix: 'warrecord' },
  { key: 'roles', label: 'Roles', prefix: 'role' },
];

// Human labels for the known actions; anything else falls back to a title-case
// of the raw string so a new action type still reads sensibly.
const ACTION_LABELS: Record<string, string> = {
  'member.rank_change': 'Rank change',
  'member.promote': 'Promoted',
  'member.status': 'Status change',
  'member.display_name': 'Display name changed',
  'member.join': 'Joined',
  'medal.award': 'Medal awarded',
  'medal.revoke': 'Medal revoked',
  'warrecord.award': 'War record awarded',
  'warrecord.revoke': 'War record revoked',
  'role.grant': 'Role granted',
  'role.revoke': 'Role revoked',
};

// Negative actions are called out with a red chip.
const NEGATIVE = new Set([
  'medal.revoke',
  'warrecord.revoke',
  'role.revoke',
]);

function actionLabel(entry: AuditEntry): string {
  if (entry.action === 'member.rank_change' && entry.meta?.demotion) return 'Demoted';
  return ACTION_LABELS[entry.action] ?? titleCase(entry.action);
}

function isNegative(entry: AuditEntry): boolean {
  if (NEGATIVE.has(entry.action)) return true;
  if (entry.action === 'member.rank_change' && entry.meta?.demotion) return true;
  if (entry.action === 'member.status') {
    const to = entry.meta?.to;
    return to === 'banned' || to === 'retired';
  }
  return false;
}

function titleCase(action: string): string {
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/** A short human detail pulled from the entry's meta (the "what", specifically). */
function detail(entry: AuditEntry): string | null {
  const m = entry.meta ?? {};
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  switch (entry.action) {
    case 'member.rank_change':
    case 'member.promote':
      return `${str(m.from) ?? 'Unranked'} → ${str(m.to) ?? 'Unranked'}`;
    case 'member.status':
      return `${str(m.from) ?? '?'} → ${str(m.to) ?? '?'}`;
    case 'medal.award':
    case 'medal.revoke':
      return str(m.medalName);
    case 'warrecord.award':
    case 'warrecord.revoke':
      return str(m.name);
    case 'role.grant':
    case 'role.revoke':
      return str(m.roleName);
    default:
      return null;
  }
}

function whenLabel(unixSec: number): string {
  const then = unixSec * 1000;
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString();
}

interface ActorOpt {
  id: number;
  name: string;
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [category, setCategory] = useState('all');
  const [actorId, setActorId] = useState<number | null>(null);
  const [actors, setActors] = useState<ActorOpt[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const prefix = CATEGORIES.find((ct) => ct.key === category)?.prefix ?? '';

  const fetchPage = useCallback(
    async (nextOffset: number, replace: boolean) => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(nextOffset) });
      if (prefix) params.set('action', prefix);
      if (actorId) params.set('actorId', String(actorId));
      const { entries: page, hasMore } = await api.get<{ entries: AuditEntry[]; hasMore: boolean }>(
        `/audit?${params.toString()}`,
      );
      setEntries((prev) => (replace ? page : [...prev, ...page]));
      setOffset(nextOffset + page.length);
      setHasMore(hasMore);
    },
    [prefix, actorId],
  );

  const { run, busy, error, notice, warning } = useAction();

  // The set of people who appear in the log, for the "by person" filter.
  useEffect(() => {
    api
      .get<{ actors: ActorOpt[] }>('/audit/actors')
      .then((d) => setActors(d.actors ?? []))
      .catch(() => setActors([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPage(0, true).finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = () => run(() => fetchPage(offset, false));

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Activity Log</h2>
        <p className="muted">
          Who did what across the site. Reasons are recorded on every negative action.
        </p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <div className="audit-filters">
        {CATEGORIES.map((ct) => (
          <button
            key={ct.key}
            className={ct.key === category ? 'chip active' : 'chip'}
            onClick={() => setCategory(ct.key)}
            disabled={busy}
          >
            {ct.label}
          </button>
        ))}

        <label className="audit-person">
          <span className="muted small">By person</span>
          <select
            value={actorId ?? ''}
            disabled={busy || actors.length === 0}
            onChange={(e) => setActorId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Everyone</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="loading">Loading activity…</div>
      ) : entries.length === 0 ? (
        <p className="muted">No activity recorded yet.</p>
      ) : (
        <>
          <ul className="audit-list">
            {entries.map((e) => {
              const det = detail(e);
              const negative = isNegative(e);
              return (
                <li key={e.id} className="audit-row">
                  <div className="audit-actor">
                    {e.actor ? (
                      <>
                        <img
                          className="avatar sm"
                          src={memberAvatar(e.actor, 32)}
                          alt=""
                          width={28}
                          height={28}
                        />
                        <Link to={`/members/${e.actor.id}`}>{e.actor.name}</Link>
                      </>
                    ) : (
                      <span className="muted">System</span>
                    )}
                  </div>

                  <div className="audit-body">
                    <span className={negative ? 'audit-action negative' : 'audit-action'}>
                      {actionLabel(e)}
                    </span>
                    {det && <span className="audit-detail">{det}</span>}
                    {e.target && (
                      <>
                        <span className="muted"> · </span>
                        <Link to={`/members/${e.target.id}`}>{e.target.name}</Link>
                      </>
                    )}
                    {e.reason && <div className="audit-reason">“{e.reason}”</div>}
                  </div>

                  <div className="audit-meta muted small">
                    {e.source === 'discord' && <span className="tag">discord</span>}
                    <span title={new Date(e.createdAt * 1000).toLocaleString()}>
                      {whenLabel(e.createdAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div className="center">
              <button onClick={() => void loadMore()} disabled={busy}>
                {busy ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
