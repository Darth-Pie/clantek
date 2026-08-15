/**
 * Settings → Backups (God only) — the site's restore points.
 *
 * A backup is a full copy of the database (every setting, page, rank, role,
 * member, and piece of content). Restoring one rolls the whole site back to
 * exactly that state; the server auto-saves the current state first, so a
 * restore is itself undoable, and re-issues this God's session so they stay
 * signed in. Uploaded image/media files are not part of a backup.
 *
 * Gated God-only in the admin nav and again on every /api/snapshots route.
 */

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAction, Alerts } from '../lib/action';

interface Snapshot {
  id: string;
  name: string;
  note: string | null;
  sizeBytes: number;
  tableCounts: Record<string, number>;
  kind: 'manual' | 'auto';
  createdAt: number;
}

function rowTotal(counts: Record<string, number>): number {
  return Object.values(counts ?? {}).reduce((a, b) => a + (b || 0), 0);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function when(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SnapshotsAdmin() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  // Which snapshot is armed for restore (two-step confirm), and whether a
  // restore is mid-flight (blocks the whole page — it's rewriting everything).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const { run, busy, error, notice, warning, setError } = useAction();

  const load = () =>
    api
      .get<{ snapshots: Snapshot[] }>('/snapshots')
      .then((d) => setSnaps(d.snapshots ?? []))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const save = () =>
    run(async () => {
      await api.post('/snapshots', { name: name.trim() || undefined, note: note.trim() || undefined });
      setName('');
      setNote('');
      await load();
      return 'Backup saved.';
    });

  const remove = (snap: Snapshot) =>
    run(async () => {
      await api.del(`/snapshots/${snap.id}`);
      setSnaps((prev) => prev.filter((s) => s.id !== snap.id));
      return 'Backup deleted.';
    });

  // Restore is deliberately NOT routed through useAction's transient notice —
  // it ends by reloading the page, so success is shown as a blocking overlay.
  const restore = async (snap: Snapshot) => {
    setConfirmId(null);
    setRestoring(snap.id);
    try {
      const res = await api.post<{ restored: string; rows: number }>(`/snapshots/${snap.id}/restore`);
      // The server re-issued our session cookie and rewrote the whole database.
      // A hard reload re-fetches the session and every page from the restored
      // state — far safer than trying to reconcile in-memory React state.
      sessionStorage.setItem(
        'ct-restore-toast',
        `Restored “${res.restored}” — ${res.rows.toLocaleString()} rows.`,
      );
      window.location.assign('/admin/backups');
    } catch (err) {
      setRestoring(null);
      setError(err instanceof ApiError ? err.message : 'Restore failed.');
      await load();
    }
  };

  // Show the post-reload confirmation once.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const t = sessionStorage.getItem('ct-restore-toast');
    if (t) {
      setToast(t);
      sessionStorage.removeItem('ct-restore-toast');
      const id = setTimeout(() => setToast(null), 8000);
      return () => clearTimeout(id);
    }
  }, []);

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="panel snapshots-admin">
      <header className="panel-head">
        <h2>Backups</h2>
        <p className="muted">
          A backup is a complete copy of this site’s database — every setting, page, rank, role,
          member, and piece of content. <strong>Restore</strong> one to roll the whole site back to
          exactly that state. A restore auto-saves the current state first, so you can undo it too.
          Uploaded images and files aren’t part of a backup.
        </p>
      </header>

      {toast && <div className="notice">{toast}</div>}
      <Alerts error={error} warning={warning} notice={notice} />

      {restoring && (
        <div className="restore-overlay" role="status" aria-live="assertive">
          <div className="restore-overlay-card">
            <div className="spinner" aria-hidden />
            <strong>Restoring the site…</strong>
            <span className="muted small">Rewriting the database. This page will reload when it’s done.</span>
          </div>
        </div>
      )}

      {/* Save a new restore point. */}
      <div className="snapshot-save">
        <div className="field">
          <label htmlFor="snap-name">Name this backup</label>
          <input
            id="snap-name"
            type="text"
            placeholder="e.g. Before the demo, known-good"
            value={name}
            maxLength={80}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="snap-note">Note (optional)</label>
          <input
            id="snap-note"
            type="text"
            placeholder="Anything worth remembering about this state"
            value={note}
            maxLength={500}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save current state'}
        </button>
      </div>

      {snaps.length === 0 ? (
        <p className="muted">No backups yet. Save one now so you have a known-good state to return to.</p>
      ) : (
        <ul className="snapshot-list">
          {snaps.map((snap) => (
            <li key={snap.id} className={`snapshot-row${confirmId === snap.id ? ' confirming' : ''}`}>
              <div className="snapshot-main">
                <div className="snapshot-name">
                  {snap.name}
                  <span className={`snapshot-kind ${snap.kind}`}>
                    {snap.kind === 'auto' ? 'Auto' : 'Manual'}
                  </span>
                </div>
                {snap.note && <div className="snapshot-note muted small">{snap.note}</div>}
                <div className="snapshot-meta muted small">
                  {when(snap.createdAt)} · {rowTotal(snap.tableCounts).toLocaleString()} rows ·{' '}
                  {formatBytes(snap.sizeBytes)}
                </div>
              </div>

              {confirmId === snap.id ? (
                <div className="snapshot-confirm">
                  <span className="snapshot-warn small">
                    Overwrite the entire site with “{snap.name}”?
                  </span>
                  <button className="danger" disabled={busy} onClick={() => void restore(snap)}>
                    Yes, restore
                  </button>
                  <button className="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="snapshot-actions">
                  <button className="primary" disabled={busy} onClick={() => setConfirmId(snap.id)}>
                    Restore
                  </button>
                  <a className="btn ghost" href={`/api/snapshots/${snap.id}/download`}>
                    Download
                  </a>
                  <button
                    className="ghost danger-text"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Delete the backup “${snap.name}”? This can’t be undone.`)) void remove(snap);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
