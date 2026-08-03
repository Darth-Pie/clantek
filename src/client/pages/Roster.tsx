import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Member {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  status: string;
  joinedAt: number;
  rankName: string | null;
}

function avatarUrl(discordId: string, hash: string | null): string {
  if (!hash) {
    const index = (BigInt(discordId) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${ext}?size=64`;
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
            <img src={avatarUrl(m.discordId, m.avatar)} alt="" width={40} height={40} />
            <div>
              <div className="name">{m.globalName ?? m.username}</div>
              <div className="muted small">
                {m.rankName ?? 'Unranked'} · joined {new Date(m.joinedAt * 1000).toLocaleDateString()}
              </div>
            </div>
            {m.status !== 'active' && <span className="status-chip">{m.status}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
