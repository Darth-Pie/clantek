/**
 * Events — upcoming clan happenings. Everyone with events.view sees the list;
 * events.manage adds the create / edit / cancel controls. Each event mirrors to
 * a Discord scheduled event and an announcement message (handled server-side).
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import { useSession } from '../lib/session';

interface EventItem {
  id: number;
  title: string;
  description: string | null;
  startsAt: number;
  endsAt: number;
  location: string;
  gameId: number | null;
  gameName: string | null;
  createdBy: number | null;
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
  const s = new Date(startsAt * 1000);
  const e = new Date(endsAt * 1000);
  const sameDay = s.toDateString() === e.toDateString();
  const date = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `${date} · ${t(s)} – ${t(e)}` : `${s.toLocaleString()} → ${e.toLocaleString()}`;
}

export default function Events() {
  const { can } = useSession();
  const canManage = can('events.manage');
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
        <EventForm
          games={games}
          busy={busy}
          onSave={create}
          onCancel={() => setCreating(false)}
        />
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
                <div className="event-when">{whenLabel(ev.startsAt, ev.endsAt)}</div>
                <h3>{ev.title}</h3>
                <div className="muted small event-meta">
                  📍 {ev.location}
                  {ev.gameName && <> · 🎮 {ev.gameName}</>}
                </div>
                {ev.description && <p className="event-desc">{ev.description}</p>}
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

interface EventPayload {
  title: string;
  description: string;
  startsAt: number;
  endsAt: number;
  location: string;
  gameId: number | null;
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
  const [start, setStart] = useState(initial ? toLocalInput(initial.startsAt) : '');
  const [end, setEnd] = useState(initial ? toLocalInput(initial.endsAt) : '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [gameId, setGameId] = useState<number | null>(initial?.gameId ?? null);

  const timesValid = !!start && !!end && fromLocalInput(end) > fromLocalInput(start);
  const valid = title.trim() && location.trim() && timesValid;

  return (
    <div className="role-editor event-form">
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="Clan war vs. …" />
      </label>

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

      <div className="news-editor-actions">
        <button
          className="primary"
          disabled={busy || !valid}
          onClick={() =>
            onSave({
              title: title.trim(),
              description: description.trim(),
              startsAt: fromLocalInput(start),
              endsAt: fromLocalInput(end),
              location: location.trim(),
              gameId,
            })
          }
        >
          {initial ? 'Save changes' : 'Create event'}
        </button>
        <button disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
