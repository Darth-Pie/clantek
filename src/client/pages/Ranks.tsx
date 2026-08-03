/**
 * Rank administration — add, rename, reorder, and delete freely.
 *
 * This screen is the reason for the rewrite: the 2003 version rendered 21
 * hardcoded rows of `<input name="name_9">` because ranks were columns.
 */

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

interface Rank {
  id: number;
  name: string;
  abbreviation: string | null;
  sortOrder: number;
  reqDays: number;
  reqWins: number;
  isDefault: boolean;
  memberCount: number;
}

export default function Ranks() {
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { ranks } = await api.get<{ ranks: Rank[] }>('/ranks');
    // Highest rank first reads more naturally than storage order.
    setRanks([...ranks].sort((a, b) => b.sortOrder - a.sortOrder));
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const addRank = () =>
    run(async () => {
      if (!newName.trim()) return;
      await api.post('/ranks', { name: newName.trim() });
      setNewName('');
    });

  const rename = (id: number, name: string) => run(() => api.patch(`/ranks/${id}`, { name }));

  const setDefault = (id: number) => run(() => api.patch(`/ranks/${id}`, { isDefault: true }));

  const remove = (id: number) => run(() => api.del(`/ranks/${id}`));

  /** Sends the full order lowest-first, which is how the API stores it. */
  const move = (index: number, direction: -1 | 1) =>
    run(() => {
      const next = [...ranks];
      const target = index + direction;
      if (target < 0 || target >= next.length) return Promise.resolve();
      [next[index], next[target]] = [next[target]!, next[index]!];
      return api.put('/ranks/order', { order: next.map((r) => r.id).reverse() });
    });

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Ranks</h2>
        <p className="muted">
          {ranks.length} rank{ranks.length === 1 ? '' : 's'}. Highest first.
        </p>
      </header>

      {error && <div className="alert">{error}</div>}

      <div className="add-row">
        <input
          value={newName}
          placeholder="New rank name"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addRank()}
          disabled={busy}
        />
        <button onClick={() => void addRank()} disabled={busy || !newName.trim()}>
          Add rank
        </button>
      </div>

      <table className="grid">
        <thead>
          <tr>
            <th>Order</th>
            <th>Name</th>
            <th>Members</th>
            <th>Default</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ranks.map((rank, index) => (
            <tr key={rank.id}>
              <td className="reorder">
                <button onClick={() => void move(index, -1)} disabled={busy || index === 0}>
                  ↑
                </button>
                <button
                  onClick={() => void move(index, 1)}
                  disabled={busy || index === ranks.length - 1}
                >
                  ↓
                </button>
              </td>
              <td>
                <input
                  defaultValue={rank.name}
                  onBlur={(e) =>
                    e.target.value !== rank.name && void rename(rank.id, e.target.value)
                  }
                  disabled={busy}
                />
              </td>
              <td>{rank.memberCount}</td>
              <td>
                <input
                  type="radio"
                  name="default-rank"
                  checked={rank.isDefault}
                  onChange={() => void setDefault(rank.id)}
                  disabled={busy}
                  title="Rank given to new recruits on first sign-in"
                />
              </td>
              <td>
                <button
                  className="danger"
                  onClick={() => void remove(rank.id)}
                  disabled={busy || rank.memberCount > 0}
                  title={
                    rank.memberCount > 0
                      ? 'Reassign the members holding this rank first'
                      : 'Delete this rank'
                  }
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
