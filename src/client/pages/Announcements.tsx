/**
 * Discord announcements admin.
 *
 * Choose the channel the bot posts to and toggle which events announce. "Send
 * test" confirms the bot can actually reach the channel before you rely on it.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import Switch from '../components/Switch';

interface Config {
  channelId: string | null;
  events: { medalAward: boolean; warRecordAward: boolean; promotion: boolean };
}
interface Channel {
  id: string;
  name: string;
  position: number;
}

const EVENT_LABELS: [key: keyof Config['events'], label: string, hint: string][] = [
  ['medalAward', 'Medal awarded', 'Posts when a member is awarded a medal.'],
  ['warRecordAward', 'War record awarded', 'Posts when a member earns a war record.'],
  ['promotion', 'Promotion', 'Posts when a member is promoted (website or /promote).'],
];

export default function Announcements() {
  const [saved, setSaved] = useState<Config | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelWarning, setChannelWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [channelId, setChannelId] = useState('');
  const [events, setEvents] = useState<Config['events']>({
    medalAward: false,
    warRecordAward: false,
    promotion: false,
  });

  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    Promise.all([
      api.get<{ announcements: Config }>('/settings/announcements').then(({ announcements }) => {
        setSaved(announcements);
        setChannelId(announcements.channelId ?? '');
        setEvents(announcements.events);
      }),
      api
        .get<{ channels: Channel[]; warning?: string }>('/settings/discord-channels')
        .then(({ channels, warning }) => {
          setChannels(channels);
          setChannelWarning(warning ?? null);
        })
        .catch(() => setChannelWarning('Could not reach Discord to load channels.')),
    ]).finally(() => setLoading(false));
  }, []);

  const dirty =
    !!saved &&
    (channelId !== (saved.channelId ?? '') ||
      (Object.keys(events) as (keyof Config['events'])[]).some((k) => events[k] !== saved.events[k]));

  const save = () =>
    run(async () => {
      const { announcements } = await api.put<{ announcements: Config }>('/settings/announcements', {
        channelId: channelId || null,
        events,
      });
      setSaved(announcements);
      return 'Saved.';
    });

  const test = () =>
    run(async () => {
      if (!channelId) return { warning: 'Choose a channel first.' };
      await api.post('/settings/announcements/test', { channelId });
      return 'Test message sent — check the channel.';
    });

  const toggle = (key: keyof Config['events']) =>
    setEvents((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Announcements</h2>
        <p className="muted">Have the bot post to Discord when things happen on the site.</p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <label>
        Channel
        {channels.length > 0 ? (
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} disabled={busy}>
            <option value="">— None (announcements off) —</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                #{ch.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={channelId}
            placeholder="Discord channel ID"
            onChange={(e) => setChannelId(e.target.value)}
            disabled={busy}
          />
        )}
      </label>
      {channelWarning && <p className="muted small warn">{channelWarning}</p>}

      <fieldset className="tenure">
        <legend>Announce these events</legend>
        {EVENT_LABELS.map(([key, label, hint]) => (
          <div key={key} className="check announce-event">
            <Switch checked={events[key]} onChange={() => toggle(key)} disabled={busy} label={label} hideState />
            <span>
              {label}
              <span className="muted small"> — {hint}</span>
            </span>
          </div>
        ))}
        <p className="muted small">
          Nothing posts unless a channel is chosen above and the event is ticked.
        </p>
      </fieldset>

      <div className="news-editor-actions">
        <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
          Save
        </button>
        <button disabled={busy || !channelId} onClick={() => void test()} title="Post a test message to the chosen channel">
          Send test
        </button>
      </div>
    </section>
  );
}
