/**
 * A single member: identity, rank, self-editable bio, roles, and medals.
 *
 * Admin controls (promote/demote, status, role grants) are each gated on the
 * matching permission via the session's can(). That means holders of the
 * top-level Command role see them, and God is a fallback — not a special case.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';

interface Role {
  id: number;
  name: string;
  color: string | null;
  source?: 'manual' | 'rank';
}
interface Medal {
  id: number;
  name: string;
  imageUrl: string | null;
  citation: string | null;
  awardedAt: number;
}
interface Member {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  status: string;
  joinedAt: number;
  rank: { id: number; name: string; sortOrder: number } | null;
  roles: Role[];
  medals: Medal[];
  bio: string | null;
}
interface Rank {
  id: number;
  name: string;
  sortOrder: number;
}

const STATUSES = ['active', 'inactive', 'loa', 'retired', 'banned'] as const;

function avatarUrl(discordId: string, hash: string | null): string {
  if (!hash) return `https://cdn.discordapp.com/embed/avatars/${(BigInt(discordId) >> 22n) % 6n}.png`;
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${ext}?size=128`;
}

export default function MemberDetail() {
  const { id } = useParams();
  const memberId = Number(id);
  const navigate = useNavigate();
  const { viewer, can } = useSession();

  const [member, setMember] = useState<Member | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [assignable, setAssignable] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmDemote, setConfirmDemote] = useState(false);

  const load = useCallback(async () => {
    const { member } = await api.get<{ member: Member }>(`/members/${memberId}`);
    setMember(member);
  }, [memberId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      load(),
      api.get<{ ranks: Rank[] }>('/ranks').then(({ ranks }) => setRanks(ranks)),
      can('roles.assign')
        ? api.get<{ roles: Role[] }>('/roles/assignable').then(({ roles }) => setAssignable(roles))
        : Promise.resolve(),
    ])
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load member.'))
      .finally(() => setLoading(false));
  }, [load, can]);

  async function run(fn: () => Promise<string | void | null>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      await load();
      if (typeof msg === 'string') setNotice(msg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="loading">Loading member…</div>;
  if (!member) return <div className="empty">Member not found.</div>;

  const isSelf = viewer?.id === member.id;
  const canEditBio = isSelf || can('roster.edit');
  const displayName = member.globalName ?? member.username;

  // Adjacent ranks for one-step promote/demote, and whether the viewer outranks
  // the target (God ignores the ladder).
  const ordered = [...ranks].sort((a, b) => a.sortOrder - b.sortOrder);
  const curOrder = member.rank?.sortOrder ?? -1;
  const nextUp = ordered.find((r) => r.sortOrder > curOrder) ?? null;
  const nextDown = [...ordered].reverse().find((r) => r.sortOrder < curOrder) ?? null;
  const viewerOrder = viewer?.rank?.sortOrder ?? -1;
  const outranksTarget = viewer?.isGod || (curOrder >= 0 && viewerOrder > curOrder) || curOrder < 0;
  const canPromoteTo = (r: Rank | null) => !!r && (viewer?.isGod || viewerOrder > r.sortOrder);

  const setRank = (rankId: number | null, label: string) =>
    run(async () => {
      const res = await api.put<{ rankRoleSync?: { added: string[]; removed: string[]; warnings: string[] } }>(
        `/members/${member.id}/rank`,
        { rankId },
      );
      const s = res.rankRoleSync;
      const changes = [
        s?.added.length ? `roles added: ${s.added.join(', ')}` : '',
        s?.removed.length ? `removed: ${s.removed.join(', ')}` : '',
      ].filter(Boolean).join('; ');
      const warn = s?.warnings.length ? ` ${s.warnings[0]}` : '';
      return `${label}.${changes ? ` (${changes})` : ''}${warn}`;
    });

  const setStatus = (status: string) =>
    run(async () => {
      await api.patch(`/members/${member.id}/status`, { status });
      return `Status set to ${status}.`;
    });

  const grantRole = (roleId: number) =>
    run(async () => {
      const res = await api.post<{ warning?: string }>(`/members/${member.id}/roles`, { roleId });
      return res.warning ?? 'Role granted.';
    });

  const revokeRole = (roleId: number) =>
    run(async () => {
      const res = await api.del<{ warning?: string }>(`/members/${member.id}/roles/${roleId}`);
      return res.warning ?? 'Role removed.';
    });

  const heldRoleIds = new Set(member.roles.map((r) => r.id));
  const grantable = assignable.filter((r) => !heldRoleIds.has(r.id));

  return (
    <section className="panel member-detail">
      <button className="back" onClick={() => navigate('/')}>
        ← Roster
      </button>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <header className="member-head">
        <img src={avatarUrl(member.discordId, member.avatar)} alt="" width={72} height={72} />
        <div>
          <h2>{displayName}</h2>
          <div className="member-sub muted">
            <span className="rank-chip">{member.rank ? member.rank.name : 'Unranked'}</span>
            <span className={`status-chip status-${member.status}`}>{member.status}</span>
            <span>joined {new Date(member.joinedAt * 1000).toLocaleDateString()}</span>
          </div>
        </div>
      </header>

      <div className="member-grid">
        <div className="member-main">
          <section className="block">
            <h3>Bio</h3>
            {canEditBio ? (
              <BioEditor
                bio={member.bio ?? ''}
                busy={busy}
                isSelf={isSelf}
                onSave={(bio) =>
                  run(async () => {
                    await api.patch(`/members/${member.id}/profile`, { bio });
                    return 'Bio saved.';
                  })
                }
              />
            ) : member.bio ? (
              <p className="bio">{member.bio}</p>
            ) : (
              <p className="muted">No bio yet.</p>
            )}
          </section>

          <section className="block">
            <h3>Roles</h3>
            {member.roles.length === 0 && <p className="muted">No roles.</p>}
            <ul className="member-roles">
              {member.roles.map((role) => (
                <li key={role.id}>
                  <span className="dot" style={{ background: role.color ?? 'var(--color-muted)' }} />
                  {role.name}
                  <span className="tag">{role.source === 'rank' ? 'from rank' : 'manual'}</span>
                  {can('roles.assign') && role.source !== 'rank' && (
                    <button
                      className="mini danger"
                      disabled={busy}
                      title="Remove this role"
                      onClick={() => void revokeRole(role.id)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {can('roles.assign') && grantable.length > 0 && (
              <div className="grant-row">
                <select
                  disabled={busy}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      void grantRole(Number(e.target.value));
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">Grant a role…</option>
                  {grantable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <span className="muted small">Rank-derived roles are managed on the rank, not here.</span>
              </div>
            )}
          </section>

          <section className="block">
            <h3>Medals</h3>
            {member.medals.length === 0 ? (
              <p className="muted">No medals yet.</p>
            ) : (
              <ul className="member-medals">
                {member.medals.map((m) => (
                  <li key={m.id} title={m.citation ?? ''}>
                    {m.imageUrl && <img src={m.imageUrl} alt="" width={28} height={28} />}
                    {m.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {(can('roster.promote') || can('roster.edit') || can('roster.remove')) && (
          <aside className="member-admin">
            <h3>Admin</h3>

            {can('roster.promote') && (
              <div className="admin-block">
                <span className="admin-label">Rank</span>
                <div className="current-rank">{member.rank ? member.rank.name : 'Unranked'}</div>

                {!outranksTarget ? (
                  <p className="muted small">This member outranks you — you can’t change their rank.</p>
                ) : confirmDemote ? (
                  <div className="confirm-row">
                    <span className="small">
                      Demote <strong>{displayName}</strong> from {member.rank?.name ?? 'Unranked'} to{' '}
                      <strong>{nextDown?.name}</strong>?
                    </span>
                    <div className="admin-actions">
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          setConfirmDemote(false);
                          if (nextDown) void setRank(nextDown.id, `Demoted to ${nextDown.name}`);
                        }}
                      >
                        Confirm demote
                      </button>
                      <button disabled={busy} onClick={() => setConfirmDemote(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-actions">
                    <button
                      disabled={busy || !canPromoteTo(nextUp)}
                      onClick={() => nextUp && void setRank(nextUp.id, `Promoted to ${nextUp.name}`)}
                      title={nextUp ? `Promote to ${nextUp.name}` : 'Already at the top rank'}
                    >
                      ▲ Promote{nextUp ? ` → ${nextUp.name}` : ''}
                    </button>
                    <button
                      disabled={busy || !nextDown}
                      onClick={() => setConfirmDemote(true)}
                      title={nextDown ? `Demote to ${nextDown.name}` : 'Already at the lowest rank'}
                    >
                      ▼ Demote{nextDown ? ` → ${nextDown.name}` : ''}
                    </button>
                  </div>
                )}
              </div>
            )}

            {(can('roster.edit') || can('roster.remove')) && (
              <div className="admin-block">
                <span className="admin-label">Status</span>
                <select
                  value={member.status}
                  disabled={busy || !outranksTarget}
                  onChange={(e) => void setStatus(e.target.value)}
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                {can('roster.remove') && member.status !== 'retired' && (
                  <button
                    className="danger"
                    disabled={busy || !outranksTarget}
                    onClick={() => void setStatus('retired')}
                    title="Retire this member (keeps their history)"
                  >
                    Remove from roster
                  </button>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function BioEditor({
  bio,
  busy,
  isSelf,
  onSave,
}: {
  bio: string;
  busy: boolean;
  isSelf: boolean;
  onSave: (bio: string) => void;
}) {
  const [text, setText] = useState(bio);
  const dirty = text !== bio;
  return (
    <div className="bio-editor">
      <textarea
        value={text}
        maxLength={2000}
        rows={4}
        placeholder={isSelf ? 'Tell the clan about yourself…' : 'Edit this member’s bio…'}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />
      <div className="bio-actions">
        <button className="primary" disabled={busy || !dirty} onClick={() => onSave(text)}>
          Save bio
        </button>
        {dirty && (
          <button disabled={busy} onClick={() => setText(bio)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
