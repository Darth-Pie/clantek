/**
 * Rank administration — add, rename, reorder, delete, and choose which roles
 * each rank grants.
 *
 * This screen is the reason for the rewrite: the 2003 version rendered 21
 * hardcoded rows of `<input name="name_9">` because ranks were columns. It now
 * also drives roles — assigning a rank hands out its roles, which cascade to
 * Discord.
 */

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';

interface Rank {
  id: number;
  name: string;
  abbreviation: string | null;
  sortOrder: number;
  reqDays: number;
  reqWins: number;
  isDefault: boolean;
  memberCount: number;
  roleIds: number[];
}

interface Role {
  id: number;
  name: string;
  color: string | null;
}

export default function Ranks() {
  const { can } = useSession();
  const canManageRoles = can('roles.manage');

  const [ranks, setRanks] = useState<Rank[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRankId, setSelectedRankId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { ranks } = await api.get<{ ranks: Rank[] }>('/ranks');
    setRanks([...ranks].sort((a, b) => b.sortOrder - a.sortOrder));
  }

  useEffect(() => {
    void load();
    if (canManageRoles) {
      api
        .get<{ roles: Role[] }>('/roles')
        .then(({ roles }) => setRoles(roles))
        .catch(() => setRoles([]));
    }
  }, [canManageRoles]);

  async function run(fn: () => Promise<string | void | null>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await fn();
      await load();
      if (typeof message === 'string') setNotice(message);
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

  const move = (index: number, direction: -1 | 1) =>
    run(() => {
      const next = [...ranks];
      const target = index + direction;
      if (target < 0 || target >= next.length) return Promise.resolve();
      [next[index], next[target]] = [next[target]!, next[index]!];
      return api.put('/ranks/order', { order: next.map((r) => r.id).reverse() });
    });

  const saveRankRoles = (rankId: number, roleIds: number[]) =>
    run(async () => {
      const res = await api.put<{
        applied: { members: number; warnings: string[] };
      }>(`/ranks/${rankId}/roles`, { roleIds });
      const { members, warnings } = res.applied;
      const base =
        members > 0
          ? `Saved. Applied to ${members} member${members === 1 ? '' : 's'} at this rank.`
          : 'Saved.';
      return warnings.length ? `${base} ${warnings[0]}` : base;
    });

  const selectedRank = ranks.find((r) => r.id === selectedRankId) ?? null;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Ranks</h2>
        <p className="muted">
          {ranks.length} rank{ranks.length === 1 ? '' : 's'}. Highest first.
        </p>
      </header>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

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
            {canManageRoles && <th>Roles</th>}
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
              {canManageRoles && (
                <td>
                  <button
                    className={rank.id === selectedRankId ? 'active' : ''}
                    onClick={() => setSelectedRankId(rank.id === selectedRankId ? null : rank.id)}
                  >
                    Roles ({rank.roleIds.length})
                  </button>
                </td>
              )}
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

      {canManageRoles && selectedRank && (
        <RankRolesEditor
          key={selectedRank.id}
          rank={selectedRank}
          roles={roles}
          busy={busy}
          onSave={(roleIds) => saveRankRoles(selectedRank.id, roleIds)}
          onClose={() => setSelectedRankId(null)}
        />
      )}
    </section>
  );
}

function RankRolesEditor({
  rank,
  roles,
  busy,
  onSave,
  onClose,
}: {
  rank: Rank;
  roles: Role[];
  busy: boolean;
  onSave: (roleIds: number[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(rank.roleIds));

  const dirty =
    selected.size !== rank.roleIds.length || rank.roleIds.some((id) => !selected.has(id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="rank-roles-editor">
      <div className="rre-head">
        <h3>Roles granted by “{rank.name}”</h3>
        <button onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <p className="muted small">
        Members at this rank receive these roles automatically. Changing this updates everyone
        currently at the rank, and mapped Discord roles follow.
      </p>

      {roles.length === 0 ? (
        <p className="muted">No roles exist yet. Create some on the Roles page first.</p>
      ) : (
        <div className="rre-roles">
          {roles.map((role) => (
            <label key={role.id} className="rre-role">
              <input
                type="checkbox"
                checked={selected.has(role.id)}
                onChange={() => toggle(role.id)}
                disabled={busy}
              />
              <span className="dot" style={{ background: role.color ?? 'var(--color-muted)' }} />
              {role.name}
            </label>
          ))}
        </div>
      )}

      <button className="primary" disabled={busy || !dirty} onClick={() => onSave([...selected])}>
        Save rank roles
      </button>
    </div>
  );
}
