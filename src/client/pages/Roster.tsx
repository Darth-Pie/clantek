import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { memberName } from '../../shared/names';
import { memberAvatar } from '../../shared/avatar';

interface Member {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  displayName: string | null;
  avatar: string | null;
  profileImageUrl: string | null;
  status: string;
  joinedAt: number;
  rankName: string | null;
}

const PAGE_SIZE = 50;

export default function Roster() {
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fetch one page at the given offset and append it. Reads a page's worth of
  // rows rather than the whole roster, so the cost stays flat as the clan grows.
  const loadPage = useCallback(async (offset: number) => {
    const { members: page, total } = await api.get<{ members: Member[]; total: number }>(
      `/members?limit=${PAGE_SIZE}&offset=${offset}`,
    );
    setTotal(total);
    setMembers((prev) => (offset === 0 ? page : [...prev, ...page]));
  }, []);

  useEffect(() => {
    loadPage(0).finally(() => setLoading(false));
  }, [loadPage]);

  const loadMore = () => {
    setLoadingMore(true);
    loadPage(members.length).finally(() => setLoadingMore(false));
  };

  if (loading) return <div className="loading">Loading roster…</div>;

  const hasMore = members.length < total;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Roster</h2>
        <p className="muted">
          {hasMore ? `${members.length} of ${total}` : total} member{total === 1 ? '' : 's'}
        </p>
      </header>

      <ul className="roster">
        {members.map((m) => (
          <li key={m.id}>
            <Link to={`/members/${m.id}`} className="roster-link">
              <img
                className="avatar"
                src={memberAvatar(m, 64)}
                alt=""
                width={40}
                height={40}
                loading="lazy"
              />
              <div>
                <div className="name">{memberName(m)}</div>
                <div className="muted small">
                  {m.rankName ?? 'Unranked'} · joined{' '}
                  {new Date(m.joinedAt * 1000).toLocaleDateString()}
                </div>
              </div>
              {m.status !== 'active' && <span className="status-chip">{m.status}</span>}
            </Link>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="roster-more">
          <button onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load ${Math.min(PAGE_SIZE, total - members.length)} more`}
          </button>
        </div>
      )}
    </section>
  );
}
