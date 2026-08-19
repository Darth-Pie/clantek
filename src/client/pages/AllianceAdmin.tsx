/**
 * Alliance admin — link this org to allied orgs' independent mustr instances so
 * broadcasts (events, announcements) fan out across everyone's Discord servers,
 * each posted by that org's OWN bot.
 *
 * Pairing is a two-way token exchange: adding an ally mints a token you send THEM
 * (so they can call you), and you paste the token THEY gave you (so you can call
 * them). No bot tokens are ever shared. See src/shared/alliance.ts.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import Switch from '../components/Switch';

interface LinkView {
  id: number;
  name: string;
  baseUrl: string;
  channelId: string | null;
  enabled: boolean;
  hasOutbound: boolean;
  inboundPrefix: string | null;
  lastInboundAt: number | null;
}
interface Channel {
  id: string;
  name: string;
}

function when(ts: number | null): string {
  return ts ? new Date(ts * 1000).toLocaleString() : 'never';
}

export default function AllianceAdmin() {
  const { run, busy, error, notice } = useAction();
  const [links, setLinks] = useState<LinkView[] | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [theirToken, setTheirToken] = useState('');
  // A freshly minted token to hand an ally — shown once, then dismissed.
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);

  const load = () =>
    api.get<{ links: LinkView[] }>('/alliance/links').then((r) => setLinks(r.links)).catch(() => setLinks([]));

  useEffect(() => {
    void load();
    api.get<{ channels: Channel[] }>('/settings/discord-channels').then((r) => setChannels(r.channels ?? [])).catch(() => {});
  }, []);

  const addAlly = () =>
    run(async () => {
      const r = await api.post<{ link: LinkView; inboundToken: string }>('/alliance/links', {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        outboundToken: theirToken.trim() || undefined,
      });
      setFresh({ name: r.link.name, token: r.inboundToken });
      setName('');
      setBaseUrl('');
      setTheirToken('');
      await load();
      return `Linked “${r.link.name}”. Copy the token below and send it to them.`;
    });

  const patch = (id: number, body: Record<string, unknown>) =>
    run(async () => {
      await api.patch(`/alliance/links/${id}`, body);
      await load();
      return '';
    });

  const remove = (l: LinkView) =>
    run(async () => {
      if (!window.confirm(`Remove the link to “${l.name}”? Broadcasts to and from them stop immediately.`)) return '';
      await api.del(`/alliance/links/${l.id}`);
      await load();
      return 'Link removed.';
    });

  const rotate = (l: LinkView) =>
    run(async () => {
      const r = await api.post<{ inboundToken: string }>(`/alliance/links/${l.id}/rotate`);
      setFresh({ name: l.name, token: r.inboundToken });
      return 'New token minted. Send it to them; the old one no longer works.';
    });

  const sendTest = () =>
    run(async () => {
      await api.post('/alliance/test');
      return 'Test broadcast sent to every enabled ally. Check their Discord channels.';
    });

  const enabledCount = (links ?? []).filter((l) => l.enabled).length;

  return (
    <section className="panel account-settings">
      <header className="panel-head">
        <div>
          <h2>Alliance</h2>
          <p className="muted">
            Link allied orgs so events and announcements fan out across everyone’s Discord — each posted by
            that org’s own bot. You stay independent; no bot tokens are ever shared.
          </p>
        </div>
        <button type="button" className="primary" disabled={busy || enabledCount === 0} onClick={() => void sendTest()} title={enabledCount === 0 ? 'Add and enable an ally first' : 'Send a test broadcast to every enabled ally'}>
          Send test broadcast
        </button>
      </header>

      <Alerts error={error} notice={notice} />

      {fresh && (
        <div className="token-reveal">
          <strong>Send this token to {fresh.name}. It’s shown only once.</strong>
          <p className="muted small">They paste it into their own Alliance panel (as the token to call <em>you</em>).</p>
          <div className="token-reveal-row">
            <code className="token-value">{fresh.token}</code>
            <button type="button" className="primary" onClick={() => void navigator.clipboard?.writeText(fresh.token)}>
              Copy
            </button>
          </div>
          <button type="button" className="ghost" onClick={() => setFresh(null)}>
            Done
          </button>
        </div>
      )}

      <h3 className="account-subhead">Add an allied org</h3>
      <p className="muted">
        Enter their org name and the base URL of their mustr site (e.g. <code>https://allies.example</code>).
        You’ll get a token to send them; paste the token they give you into “their token”.
      </p>
      <div className="alliance-add">
        <input type="text" placeholder="Org name (e.g. Red Talon)" value={name} maxLength={80} disabled={busy} onChange={(e) => setName(e.target.value)} />
        <input type="url" placeholder="https://their-mustr-site" value={baseUrl} maxLength={200} disabled={busy} onChange={(e) => setBaseUrl(e.target.value)} />
        <input type="text" placeholder="Their token (optional, paste later)" value={theirToken} maxLength={200} disabled={busy} onChange={(e) => setTheirToken(e.target.value)} />
        <button type="button" className="primary" disabled={busy || !name.trim() || !baseUrl.trim()} onClick={() => void addAlly()}>
          Add ally
        </button>
      </div>

      <h3 className="account-subhead">Linked orgs</h3>
      {links === null ? (
        <p className="muted">Loading…</p>
      ) : links.length === 0 ? (
        <p className="muted">No allies linked yet.</p>
      ) : (
        <ul className="alliance-list">
          {links.map((l) => (
            <li key={l.id} className="alliance-row">
              <div className="alliance-row-head">
                <div>
                  <b>{l.name}</b>
                  <span className="muted small"> · {l.baseUrl}</span>
                </div>
                <Switch checked={l.enabled} onChange={(v) => void patch(l.id, { enabled: v })} label={`Enable ${l.name}`} />
              </div>
              <div className="alliance-row-controls">
                <label className="inline-field">
                  <span className="muted small">Post their broadcasts to</span>
                  <select value={l.channelId ?? ''} disabled={busy} onChange={(e) => void patch(l.id, { channelId: e.target.value || null })}>
                    <option value="">— pick a channel —</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                </label>
                <span className={`alliance-flag${l.hasOutbound ? ' ok' : ''}`}>{l.hasOutbound ? '↔ two-way' : '→ inbound only (add their token)'}</span>
                <span className="muted small">last received: {when(l.lastInboundAt)}</span>
                <div className="alliance-row-actions">
                  <button type="button" className="ghost mini" disabled={busy} onClick={() => void rotate(l)} title="Mint a new token for them (invalidates the old)">
                    New token
                  </button>
                  <button type="button" className="mini danger" disabled={busy} onClick={() => void remove(l)}>
                    Remove
                  </button>
                </div>
              </div>
              {!l.channelId && (
                <p className="muted small">Pick a channel so their broadcasts have somewhere to land.</p>
              )}
              {l.hasOutbound === false && (
                <details className="alliance-settoken">
                  <summary className="muted small">Paste their token</summary>
                  <SetToken id={l.id} onSet={(t) => patch(l.id, { outboundToken: t })} busy={busy} />
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Small inline form to set/replace the token an ally issued us. */
function SetToken({ id, onSet, busy }: { id: number; onSet: (t: string) => void; busy: boolean }) {
  const [v, setV] = useState('');
  return (
    <div className="alliance-settoken-row">
      <input type="text" placeholder="Token they sent you" value={v} maxLength={200} disabled={busy} onChange={(e) => setV(e.target.value)} data-link={id} />
      <button type="button" className="primary mini" disabled={busy || !v.trim()} onClick={() => onSet(v.trim())}>
        Save
      </button>
    </div>
  );
}
