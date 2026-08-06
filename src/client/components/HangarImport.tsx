/**
 * Import/update your own Star Citizen hangar. Shown only on your own profile.
 *
 * The RSI hangar is login-private with no API, so the member runs a bookmarklet
 * on their hangar (it copies the scraped items to the clipboard) and pastes the
 * result here. A collapsible "how to set up" section carries the bookmarklet and
 * install steps; once installed it's one click + paste per update.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { SC_HANGAR_BOOKMARKLET } from '../../shared/hangar';

export default function HangarImport({ userId, onImported }: { userId: number; onImported: () => void }) {
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  // Own sharing state: whether a hangar exists and whether it's shared.
  const [hasHangar, setHasHangar] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [sharing, setSharing] = useState(false);

  const loadVisibility = () =>
    api
      .get<{ hasHangar: boolean; isPublic: boolean }>('/hangar/me/visibility')
      .then((v) => {
        setHasHangar(v.hasHangar);
        setIsPublic(v.isPublic);
      })
      .catch(() => {});

  useEffect(() => {
    void loadVisibility();
    // Re-check when the parent signals an import/clear happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const togglePublic = async (next: boolean) => {
    setSharing(true);
    setIsPublic(next); // optimistic
    try {
      await api.patch<{ isPublic: boolean }>('/hangar/visibility', { public: next });
    } catch {
      setIsPublic(!next); // revert on failure
    } finally {
      setSharing(false);
    }
  };

  const load = async () => {
    setBusy(true);
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setMsg({ text: 'That doesn’t look like the copied data — re-run the bookmarklet and paste again.', ok: false });
      setBusy(false);
      return;
    }
    try {
      const { itemCount } = await api.put<{ itemCount: number }>('/hangar', { items: parsed });
      setJson('');
      setMsg({ text: `Imported ${itemCount} items — your hangar is updated below.`, ok: true });
      void loadVisibility();
      onImported();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Import failed.', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!window.confirm('Remove your imported hangar?')) return;
    setBusy(true);
    try {
      await api.del('/hangar');
      setMsg({ text: 'Hangar cleared.', ok: true });
      setHasHangar(false);
      setIsPublic(false);
      onImported();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hangar-import">
      <details className="hangar-setup" open={setupOpen} onToggle={(e) => setSetupOpen((e.target as HTMLDetailsElement).open)}>
        <summary>How to import your hangar</summary>
        <ol className="hangar-setup-steps">
          <li>
            <strong>One-time setup:</strong> create a bookmark named <em>Grab SC hangar</em>, and paste this as its URL
            (right-click your bookmarks bar → Add page → paste in the URL field):
            <textarea className="hangar-bookmarklet" readOnly rows={3} value={SC_HANGAR_BOOKMARKLET} onClick={(e) => e.currentTarget.select()} />
            <button type="button" className="ghost small" onClick={() => void navigator.clipboard.writeText(SC_HANGAR_BOOKMARKLET).catch(() => {})}>
              Copy bookmarklet
            </button>
          </li>
          <li>
            Open your <a href="https://robertsspaceindustries.com/en/account/pledges" target="_blank" rel="noopener noreferrer">RSI hangar</a>,
            let it finish loading, and <strong>click the bookmark</strong>. It copies your hangar to the clipboard (nothing is uploaded from your browser to anyone but this site).
          </li>
          <li>Paste it in the box below and press <strong>Import</strong>.</li>
        </ol>
      </details>

      <div className="hangar-import-row">
        <textarea
          className="hangar-json"
          rows={2}
          placeholder="Paste your copied hangar here…"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          disabled={busy}
        />
        <div className="hangar-import-actions">
          <button className="primary" disabled={busy || !json.trim()} onClick={() => void load()}>
            {busy ? 'Importing…' : 'Import'}
          </button>
          <button className="ghost small" disabled={busy} onClick={() => void clear()} title="Remove your imported hangar">
            Clear
          </button>
        </div>
      </div>

      {msg && <p className={msg.ok ? 'muted small' : 'small warn'}>{msg.text}</p>}

      {hasHangar && (
        <label className="hangar-share">
          <input
            type="checkbox"
            checked={isPublic}
            disabled={sharing}
            onChange={(e) => void togglePublic(e.target.checked)}
          />
          <span>
            <strong>Show my hangar to other members</strong>
            <span className="muted small">
              {isPublic
                ? 'Members with permission to view hangars can see yours.'
                : 'Only you can see your hangar. Turn this on to share it with authorized members.'}
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
