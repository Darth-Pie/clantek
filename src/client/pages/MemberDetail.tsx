/**
 * A single member: identity, rank, self-editable bio, roles, and medals.
 *
 * Admin controls (promote/demote, status, role grants) are each gated on the
 * matching permission via the session's can(). That means holders of the
 * top-level Command role see them, and God is a fallback — not a special case.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import { useSession } from '../lib/session';
import { memberName } from '../../shared/names';

interface Role {
  id: number;
  name: string;
  color: string | null;
  source?: 'manual' | 'rank';
}
interface Medal {
  awardId: number;
  id: number;
  name: string;
  imageUrl: string | null;
  citation: string | null;
  // NULL = awarded automatically by the tenure sweep, not by a person.
  awardedBy: number | null;
  awardedAt: number;
}
/** A medal definition, for the award picker. */
interface MedalDef {
  id: number;
  name: string;
  imageUrl: string | null;
  autoGrantMonths: number | null;
}
interface Member {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  displayName: string | null;
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
  const [medalCatalog, setMedalCatalog] = useState<MedalDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDemote, setConfirmDemote] = useState(false);

  const load = useCallback(async () => {
    const { member } = await api.get<{ member: Member }>(`/members/${memberId}`);
    setMember(member);
  }, [memberId]);

  const { run, busy, error, notice, warning, setError } = useAction(load);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      load(),
      api.get<{ ranks: Rank[] }>('/ranks').then(({ ranks }) => setRanks(ranks)),
      can('roles.assign')
        ? api.get<{ roles: Role[] }>('/roles/assignable').then(({ roles }) => setAssignable(roles))
        : Promise.resolve(),
      can('medals.award')
        ? api.get<{ medals: MedalDef[] }>('/medals').then(({ medals }) => setMedalCatalog(medals))
        : Promise.resolve(),
    ])
      .catch(() => setError('Failed to load member.'))
      .finally(() => setLoading(false));
  }, [load, can, setError]);

  if (loading) return <div className="loading">Loading member…</div>;
  if (!member) return <div className="empty">Member not found.</div>;

  const isSelf = viewer?.id === member.id;
  const canEditProfile = isSelf || can('roster.edit');
  const displayName = memberName(member);
  // The underlying Discord identity, shown when a display name overrides it.
  const discordHandle = member.globalName ?? member.username;
  const showsDiscordHandle = displayName !== discordHandle;

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
      ]
        .filter(Boolean)
        .join('; ');
      const summary = `${label}.${changes ? ` (${changes})` : ''}`;
      return s?.warnings.length ? { warning: `${summary} ${s.warnings[0]}` } : summary;
    });

  const setStatus = (status: string) =>
    run(async () => {
      await api.patch(`/members/${member.id}/status`, { status });
      return `Status set to ${status}.`;
    });

  const resyncDiscord = () =>
    run(async () => {
      const res = await api.post<{ ok: boolean; added?: number; removed?: number; warning?: string }>(
        `/members/${member.id}/resync`,
      );
      if (res.warning) return { warning: res.warning };
      const n = (res.added ?? 0) + (res.removed ?? 0);
      return n === 0
        ? 'Discord already matches the website.'
        : `Discord synced — ${res.added} added, ${res.removed} removed.`;
    });

  const grantRole = (roleId: number) =>
    run(async () => {
      const res = await api.post<{ warning?: string }>(`/members/${member.id}/roles`, { roleId });
      return res.warning ? { warning: res.warning } : 'Role granted.';
    });

  const revokeRole = (roleId: number) =>
    run(async () => {
      const res = await api.del<{ warning?: string }>(`/members/${member.id}/roles/${roleId}`);
      return res.warning ? { warning: res.warning } : 'Role removed.';
    });

  const awardMedal = (medalId: number, citation: string) =>
    run(async () => {
      await api.post(`/members/${member.id}/medals`, {
        medalId,
        citation: citation.trim() || undefined,
      });
      return 'Medal awarded.';
    });

  const revokeMedal = (awardId: number) =>
    run(async () => {
      await api.del(`/members/${member.id}/medals/${awardId}`);
      return 'Medal revoked.';
    });

  const heldRoleIds = new Set(member.roles.map((r) => r.id));
  const grantable = assignable.filter((r) => !heldRoleIds.has(r.id));

  const heldMedalIds = new Set(member.medals.map((m) => m.id));
  const awardable = medalCatalog.filter((m) => !heldMedalIds.has(m.id));

  return (
    <section className="panel member-detail">
      <button className="back" onClick={() => navigate('/')}>
        ← Roster
      </button>

      <Alerts error={error} warning={warning} notice={notice} />

      <header className="member-head">
        <img src={avatarUrl(member.discordId, member.avatar)} alt="" width={72} height={72} />
        <div>
          <h2>{displayName}</h2>
          {showsDiscordHandle && <div className="muted small">Discord: {discordHandle}</div>}
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
            <h3>Profile</h3>
            {canEditProfile ? (
              <ProfileEditor
                displayName={member.displayName ?? ''}
                bio={member.bio ?? ''}
                busy={busy}
                isSelf={isSelf}
                onSave={({ displayName, bio }) =>
                  run(async () => {
                    const res = await api.patch<{
                      discordSync?: { synced: boolean; warning?: string };
                    }>(`/members/${member.id}/profile`, { displayName, bio });
                    if (res.discordSync?.warning) return { warning: res.discordSync.warning };
                    if (res.discordSync?.synced)
                      return 'Saved — the Discord nickname was updated to match.';
                    return 'Profile saved.';
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
                  <li key={m.awardId} title={m.citation ?? ''}>
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt="" width={28} height={28} />
                    ) : (
                      <span className="medal-thumb-empty small">★</span>
                    )}
                    <span className="medal-label">
                      {m.name}
                      {m.citation && <span className="medal-citation">{m.citation}</span>}
                    </span>
                    {m.awardedBy === null && <span className="tag">auto</span>}
                    {can('medals.award') && (
                      <button
                        className="mini danger"
                        disabled={busy}
                        title="Revoke this medal"
                        onClick={() => void revokeMedal(m.awardId)}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {can('medals.award') &&
              (awardable.length > 0 ? (
                <AwardMedalRow medals={awardable} busy={busy} onAward={awardMedal} />
              ) : (
                medalCatalog.length > 0 && (
                  <p className="muted small">This member holds every medal in the catalog.</p>
                )
              ))}
          </section>
        </div>

        {(can('roster.promote') ||
          can('roster.edit') ||
          can('roster.remove') ||
          can('discord.sync')) && (
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

            {can('discord.sync') && (
              <div className="admin-block">
                <span className="admin-label">Discord</span>
                <button disabled={busy} onClick={() => void resyncDiscord()}>
                  Re-sync roles to Discord
                </button>
                <span className="muted small">
                  Forces this member’s Discord roles to match the website now. Runs automatically
                  every few minutes.
                </span>
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

/**
 * Pick a medal and (optionally) write a citation, then award it. Kept as its
 * own component so the select + citation input have local state that resets
 * after each award.
 */
function AwardMedalRow({
  medals,
  busy,
  onAward,
}: {
  medals: MedalDef[];
  busy: boolean;
  onAward: (medalId: number, citation: string) => void;
}) {
  const [medalId, setMedalId] = useState<number | ''>('');
  const [citation, setCitation] = useState('');

  return (
    <div className="award-row">
      <select
        value={medalId}
        disabled={busy}
        onChange={(e) => setMedalId(e.target.value ? Number(e.target.value) : '')}
      >
        <option value="">Award a medal…</option>
        {medals.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.autoGrantMonths != null ? ' (tenure)' : ''}
          </option>
        ))}
      </select>
      <input
        value={citation}
        placeholder="Citation (optional)"
        maxLength={300}
        disabled={busy || medalId === ''}
        onChange={(e) => setCitation(e.target.value)}
      />
      <button
        disabled={busy || medalId === ''}
        onClick={() => {
          if (medalId !== '') {
            onAward(medalId, citation);
            setMedalId('');
            setCitation('');
          }
        }}
      >
        Award
      </button>
    </div>
  );
}

function ProfileEditor({
  displayName,
  bio,
  busy,
  isSelf,
  onSave,
}: {
  displayName: string;
  bio: string;
  busy: boolean;
  isSelf: boolean;
  onSave: (v: { displayName: string; bio: string }) => void;
}) {
  const [name, setName] = useState(displayName);
  const [text, setText] = useState(bio);
  const dirty = name !== displayName || text !== bio;

  return (
    <div className="bio-editor">
      <label className="field">
        Display name
        <input
          value={name}
          maxLength={32}
          placeholder={isSelf ? 'Your in-game name (optional)' : 'Set a display name'}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>
      <p className="muted small">
        Shown across the site instead of the Discord name, and applied as the member’s Discord
        nickname. Leave blank to use the Discord name.
      </p>

      <label className="field">
        Bio
        <textarea
          value={text}
          maxLength={2000}
          rows={4}
          placeholder={isSelf ? 'Tell the clan about yourself…' : 'Edit this member’s bio…'}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
      </label>

      <div className="bio-actions">
        <button
          className="primary"
          disabled={busy || !dirty}
          onClick={() => onSave({ displayName: name, bio: text })}
        >
          Save profile
        </button>
        {dirty && (
          <button
            disabled={busy}
            onClick={() => {
              setName(displayName);
              setText(bio);
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
