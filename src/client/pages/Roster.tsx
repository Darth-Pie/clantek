import { useEffect, useState } from 'react';
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

export default function Roster() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ members: Member[] }>('/members')
      .then(({ members }) => setMembers(members))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading roster…</div>;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Roster</h2>
        <p className="muted">{members.length} members</p>
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
    </section>
  );
}
