/**
 * Events — upcoming clan happenings. Everyone with events.view sees the list
 * and can sign themselves up (optionally picking a role like Tank/Healer/DPS).
 * events.manage adds create/edit/cancel; events.attendees reveals the full
 * "who's coming" roster. Each event mirrors to a Discord scheduled event and a
 * sign-up message whose buttons write the same rows — so the two stay in sync.
 */

import { useEffect, useState, type ChangeEvent } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import { useSession } from '../lib/session';

interface RoleState {
  id: number;
  name: string;
  emoji: string | null;
  capacity: number | null;
  count: number;
}
interface EventItem {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: number;
  endsAt: number;
  location: string;
  gameId: number | null;
  gameName: string | null;
  createdBy: number | null;
  roles: RoleState[];
  signupCount: number;
  mySignup: { roleId: number | null } | null;
}
interface GameOption {
  id: number;
  name: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** unix seconds → the value a <input type="datetime-local"> expects (local time). */
function toLocalInput(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string): number => Math.floor(new Date(v).getTime() / 1000);

function whenLabel(startsAt: number, endsAt: number): string {
  const start = new Date(startsAt * 1000);
  const end = new Date(endsAt * 1000);
  const sameDay = start.toDateString() === end.toDateString();
  const date = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `${date} · ${t(start)} – ${t(end)}` : `${start.toLocaleString()} → ${end.toLocaleString()}`;
}

export default function Events() {
  const { can } = useSession();
  const canManage = can('events.manage');
  const canSeeAttendees = can('events.attendees');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [games, setGames] = useState<GameOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  async function load() {
    const { events } = await api.get<{ events: EventItem[] }>('/events');
    setEvents(events);
  }

  const { run, busy, error, notice, warning } = useAction(load);

  useEffect(() => {
    Promise.all([
      load(),
      canManage
        ? api.get<{ games: GameOption[] }>('/games').then(({ games }) => setGames(games)).catch(() => setGames([]))
        : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [canManage]);

  const create = (payload: EventPayload) =>
    run(async () => {
      await api.post('/events', payload);
      setCreating(false);
      return 'Event created — posting to Discord.';
    });

  const saveEdit = (id: number, payload: EventPayload) =>
    run(async () => {
      await api.patch(`/events/${id}`, payload);
      setEditingId(null);
      return 'Event updated.';
    });

  const remove = (id: number) =>
    run(async () => {
      await api.del(`/events/${id}`);
      setConfirmDelete(null);
      return 'Event cancelled and removed from Discord.';
    });

  const signup = (eventId: number, roleId: number | null) =>
    run(async () => {
      await api.post(`/events/${eventId}/signup`, { roleId });
      return roleId === null ? 'You’re attending.' : 'Signed up.';
    });

  const withdraw = (eventId: number) =>
    run(async () => {
      await api.del(`/events/${eventId}/signup`);
      return 'Withdrawn from the event.';
    });

  if (loading) return <div className="loading">Loading events…</div>;

  return (
    <section className="panel">
      <header className="panel-head news-head">
        <div>
          <h2>Events</h2>
          <p className="muted">
            {events.length === 0 ? 'Nothing scheduled.' : `${events.length} upcoming`}
          </p>
        </div>
        {canManage && !creating && (
          <button onClick={() => { setCreating(true); setEditingId(null); }}>+ New event</button>
        )}
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      {creating && (
        <EventForm games={games} busy={busy} onSave={create} onCancel={() => setCreating(false)} />
      )}

      {events.length === 0 && !creating ? (
        <p className="muted">No upcoming events.</p>
      ) : (
        <ul className="event-list">
          {events.map((ev) =>
            editingId === ev.id ? (
              <li key={ev.id}>
                <EventForm
                  initial={ev}
                  games={games}
                  busy={busy}
                  onSave={(p) => saveEdit(ev.id, p)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={ev.id} className="event-card">
                {ev.imageUrl && <img className="event-banner" src={ev.imageUrl} alt="" />}
                <div className="event-when">{whenLabel(ev.startsAt, ev.endsAt)}</div>
                <h3>{ev.title}</h3>
                <div className="muted small event-meta">
                  📍 {ev.location}
                  {ev.gameName && <> · 🎮 {ev.gameName}</>}
                  {ev.signupCount > 0 && <> · 👥 {ev.signupCount} signed up</>}
                </div>
                {ev.description && <p className="event-desc">{ev.description}</p>}

                <SignupControls
                  event={ev}
                  busy={busy}
                  onSignup={(roleId) => void signup(ev.id, roleId)}
                  onWithdraw={() => void withdraw(ev.id)}
                />

                {canSeeAttendees && <AttendeeRoster eventId={ev.id} count={ev.signupCount} />}

                {canManage && (
                  <div className="event-actions">
                    <button className="mini" disabled={busy} onClick={() => { setEditingId(ev.id); setCreating(false); }}>
                      Edit
                    </button>
                    {confirmDelete === ev.id ? (
                      <span className="confirm-row">
                        <span className="small">Cancel this event?</span>
                        <button className="mini danger" disabled={busy} onClick={() => void remove(ev.id)}>
                          Confirm
                        </button>
                        <button className="mini" disabled={busy} onClick={() => setConfirmDelete(null)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button className="mini danger" disabled={busy} onClick={() => setConfirmDelete(ev.id)}>
                        Cancel event
                      </button>
                    )}
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** The member's own RSVP: role buttons (highlighting their pick) + attend/withdraw. */
function SignupControls({
  event,
  busy,
  onSignup,
  onWithdraw,
}: {
  event: EventItem;
  busy: boolean;
  onSignup: (roleId: number | null) => void;
  onWithdraw: () => void;
}) {
  const my = event.mySignup;
  const myRole = my?.roleId ?? null;
  const attending = my != null;

  return (
    <div className="signup-controls">
      <span className="signup-label">{attending ? "You're in:" : 'Sign up:'}</span>
      {event.roles.map((r) => {
        const selected = attending && myRole === r.id;
        const full = r.capacity != null && r.count >= r.capacity && !selected;
        return (
          <button
            key={r.id}
            className={selected ? 'chip active' : 'chip'}
            disabled={busy || full}
            title={full ? `${r.name} is full` : `Sign up as ${r.name}`}
            onClick={() => onSignup(r.id)}
          >
            {r.emoji ? `${r.emoji} ` : ''}
            {r.name}
            <span className="signup-count">
              {r.count}
              {r.capacity != null ? `/${r.capacity}` : ''}
            </span>
          </button>
        );
      })}
      <button
        className={attending && myRole === null ? 'chip active' : 'chip'}
        disabled={busy}
        onClick={() => onSignup(null)}
        title="Attend without a specific role"
      >
        Attending
      </button>
      {attending && (
        <button className="chip withdraw" disabled={busy} onClick={onWithdraw} title="Withdraw">
          Withdraw
        </button>
      )}
    </div>
  );
}

interface SignupEntry {
  userId: number;
  name: string;
  avatarUrl: string;
  roleId: number | null;
  roleName: string | null;
}

/** Collapsible "who's coming" roster, grouped by role. Fetched on first expand. */
function AttendeeRoster({ eventId, count }: { eventId: number; count: number }) {
  const [open, setOpen] = useState(false);
  const [signups, setSignups] = useState<SignupEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && signups === null) {
      setLoading(true);
      try {
        const { signups } = await api.get<{ signups: SignupEntry[] }>(`/events/${eventId}/signups`);
        setSignups(signups);
      } catch {
        setSignups([]);
      } finally {
        setLoading(false);
      }
    }
  }

  // Group by role name for display; no-role attendees fall under "Attending".
  const groups = new Map<string, SignupEntry[]>();
  for (const su of signups ?? []) {
    const key = su.roleName ?? 'Attending';
    const list = groups.get(key) ?? [];
    list.push(su);
    groups.set(key, list);
  }

  return (
    <div className="attendees">
      <button className="mini link-btn" onClick={() => void toggle()}>
        {open ? '▾' : '▸'} Who’s coming{count > 0 ? ` (${count})` : ''}
      </button>
      {open &&
        (loading ? (
          <p className="muted small">Loading…</p>
        ) : (signups?.length ?? 0) === 0 ? (
          <p className="muted small">No one has signed up yet.</p>
        ) : (
          <div className="attendee-groups">
            {[...groups.entries()].map(([role, members]) => (
              <div key={role} className="attendee-group">
                <div className="attendee-role">
                  {role} <span className="muted">({members.length})</span>
                </div>
                <ul className="attendee-members">
                  {members.map((m) => (
                    <li key={m.userId}>
                      <img className="avatar sm" src={m.avatarUrl} alt="" width={24} height={24} />
                      {m.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

interface RolePayload {
  id?: number;
  name: string;
  emoji: string | null;
  capacity: number | null;
}
interface EventPayload {
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: number;
  endsAt: number;
  location: string;
  gameId: number | null;
  roles: RolePayload[];
}

interface RoleDraft {
  id?: number;
  name: string;
  emoji: string;
  capacity: string;
}

function EventForm({
  initial,
  games,
  busy,
  onSave,
  onCancel,
}: {
  initial?: EventItem;
  games: GameOption[];
  busy: boolean;
  onSave: (payload: EventPayload) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [start, setStart] = useState(initial ? toLocalInput(initial.startsAt) : '');
  const [end, setEnd] = useState(initial ? toLocalInput(initial.endsAt) : '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [gameId, setGameId] = useState<number | null>(initial?.gameId ?? null);
  const [roles, setRoles] = useState<RoleDraft[]>(
    initial?.roles.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji ?? '',
      capacity: r.capacity != null ? String(r.capacity) : '',
    })) ?? [],
  );

  const timesValid = !!start && !!end && fromLocalInput(end) > fromLocalInput(start);
  const valid = title.trim() && location.trim() && timesValid;

  const addRole = () => setRoles((rs) => [...rs, { name: '', emoji: '', capacity: '' }]);
  const updateRole = (i: number, patch: Partial<RoleDraft>) =>
    setRoles((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRole = (i: number) => setRoles((rs) => rs.filter((_, idx) => idx !== i));

  const submit = () =>
    onSave({
      title: title.trim(),
      description: description.trim(),
      imageUrl,
      startsAt: fromLocalInput(start),
      endsAt: fromLocalInput(end),
      location: location.trim(),
      gameId,
      roles: roles
        .filter((r) => r.name.trim())
        .map((r) => ({
          id: r.id,
          name: r.name.trim(),
          emoji: r.emoji.trim() || null,
          capacity: r.capacity.trim() ? Math.max(1, Number(r.capacity)) : null,
        })),
    });

  return (
    <div className="role-editor event-form">
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="Clan war vs. …" />
      </label>

      <EventImageField imageUrl={imageUrl} busy={busy} onSet={setImageUrl} />

      <div className="field-row">
        <label>
          Starts
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy} />
        </label>
        <label>
          Ends
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={busy} />
        </label>
      </div>
      {!timesValid && (start || end) && <p className="small warn">The end must be after the start.</p>}

      <label>
        Location
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={busy}
          placeholder="In-game lobby, Discord voice, …"
        />
      </label>

      <label>
        Game <span className="muted small">(optional)</span>
        <select value={gameId ?? ''} onChange={(e) => setGameId(e.target.value ? Number(e.target.value) : null)} disabled={busy}>
          <option value="">— None —</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Description <span className="muted small">(optional)</span>
        <textarea value={description} rows={3} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
      </label>

      <div className="event-roles-editor">
        <div className="field-label">
          Sign-up roles <span className="muted small">(optional — e.g. Tank, Healer, DPS)</span>
        </div>
        {roles.map((r, i) => (
          <div key={i} className="role-row">
            <input
              className="role-emoji"
              value={r.emoji}
              maxLength={4}
              placeholder="🛡️"
              onChange={(e) => updateRole(i, { emoji: e.target.value })}
              disabled={busy}
            />
            <input
              className="role-name"
              value={r.name}
              maxLength={40}
              placeholder="Role name"
              onChange={(e) => updateRole(i, { name: e.target.value })}
              disabled={busy}
            />
            <input
              className="role-cap"
              type="number"
              min={1}
              value={r.capacity}
              placeholder="cap"
              title="Max sign-ups for this role (optional)"
              onChange={(e) => updateRole(i, { capacity: e.target.value })}
              disabled={busy}
            />
            <button className="mini danger" onClick={() => removeRole(i)} disabled={busy} title="Remove role">
              ✕
            </button>
          </div>
        ))}
        <button className="mini" onClick={addRole} disabled={busy || roles.length >= 20}>
          + Add role
        </button>
      </div>

      <div className="news-editor-actions">
        <button className="primary" disabled={busy || !valid} onClick={submit}>
          {initial ? 'Save changes' : 'Create event'}
        </button>
        <button disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Banner-image upload for an event, mirroring the medal/game icon uploaders. */
function EventImageField({
  imageUrl,
  busy,
  onSet,
}: {
  imageUrl: string | null;
  busy: boolean;
  onSet: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { url } = await api.upload<{ url: string }>('/media/events', file);
      onSet(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="event-image-field">
      <div className="field-label">
        Banner image <span className="muted small">(optional)</span>
      </div>
      {imageUrl && <img className="event-banner preview" src={imageUrl} alt="" />}
      <div className="avatar-controls">
        <label className="upload-btn mini">
          {uploading ? 'Uploading…' : imageUrl ? 'Change' : 'Upload'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => void pickFile(e)}
            disabled={busy || uploading}
            hidden
          />
        </label>
        {imageUrl && (
          <button className="mini" disabled={busy || uploading} onClick={() => onSet(null)} title="Remove image">
            Remove
          </button>
        )}
        {uploadError && <span className="small warn">{uploadError}</span>}
      </div>
    </div>
  );
}
