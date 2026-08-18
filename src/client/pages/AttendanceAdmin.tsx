/**
 * Settings → Attendance — configure the attendance & participation feature.
 *
 * Who may check members in (self / officers / both), how long self check-in
 * stays open, the recent-activity window behind the "recent" score, whether the
 * leaderboard is public, and whether/who can view other members' activity
 * heatmaps. Config shape + sanitizer live in shared/attendance.ts.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import Switch from '../components/Switch';
import NumberField from '../components/NumberField';
import MorphingSegments from '../components/MorphingSegments';
import { type AttendanceConfig, type AttendanceMode } from '../../shared/attendance';

interface RoleOpt {
  id: number;
  name: string;
  color: string | null;
}

const MODES: { value: AttendanceMode; label: string; hint: string }[] = [
  { value: 'both', label: 'Members + officers', hint: 'Members check themselves in, and officers can mark anyone.' },
  { value: 'self', label: 'Members only', hint: 'Members check themselves in; no officer override.' },
  { value: 'officers', label: 'Officers only', hint: 'Only events.manage holders mark who attended.' },
];

export default function AttendanceAdmin() {
  const [cfg, setCfg] = useState<AttendanceConfig | null>(null);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ config: AttendanceConfig; roles: RoleOpt[] }>('/attendance/config')
      .then((d) => {
        setCfg(d.config);
        setRoles(d.roles ?? []);
        setSaved(JSON.stringify(d.config));
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = !!cfg && JSON.stringify(cfg) !== saved;
  const patch = (p: Partial<AttendanceConfig>) => setCfg((c) => (c ? { ...c, ...p } : c));
  const toggleRole = (id: number) =>
    setCfg((c) =>
      c
        ? {
            ...c,
            heatmapViewRoleIds: c.heatmapViewRoleIds.includes(id)
              ? c.heatmapViewRoleIds.filter((r) => r !== id)
              : [...c.heatmapViewRoleIds, id],
          }
        : c,
    );

  const save = () =>
    run(async () => {
      if (!cfg) return '';
      const { config } = await api.put<{ config: AttendanceConfig }>('/attendance/config', { config: cfg });
      setCfg(config);
      setSaved(JSON.stringify(config));
      return 'Saved.';
    });

  if (loading || !cfg) return <div className="loading">Loading…</div>;

  return (
    <section className="panel attendance-admin">
      <header className="panel-head">
        <h2>Attendance &amp; participation</h2>
        <p className="muted">
          Members check in to events; that builds a participation score, leaderboards, and an
          activity heatmap on each profile. Award milestone medals automatically by setting a medal’s
          “auto-grant after N events” under <strong>Medals</strong>.
        </p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <div className="attendance-field">
        <div className="field-label">Who marks attendance</div>
        <MorphingSegments
          ariaLabel="Who marks attendance"
          value={cfg.mode}
          onChange={(mode) => patch({ mode })}
          disabled={busy}
          options={MODES.map((m) => ({ key: m.value, label: m.label }))}
        />
        <span className="muted small">{MODES.find((m) => m.value === cfg.mode)?.hint}</span>
      </div>

      <div className="attendance-field-row">
        <label className="inline-field">
          Self check-in stays open (hours after end)
          <NumberField
            min={0}
            max={168}
            value={cfg.checkinWindowHours}
            ariaLabel="Check-in window hours"
            onChange={(v) => patch({ checkinWindowHours: Number(v) })}
          />
        </label>
        <label className="inline-field">
          Recent-activity window (days)
          <NumberField
            min={7}
            max={3650}
            value={cfg.recentWindowDays}
            ariaLabel="Recent window days"
            onChange={(v) => patch({ recentWindowDays: Number(v) })}
          />
        </label>
      </div>

      <div className="module-row">
        <div className="module-info">
          <span className="module-name">Public leaderboard</span>
          <span className="muted small">
            Let logged-out visitors view the participation leaderboard — good for showing off an
            active community to recruits. Off = members only.
          </span>
        </div>
        <Switch
          checked={cfg.leaderboardPublic}
          disabled={busy}
          label="Public leaderboard"
          onChange={(v) => patch({ leaderboardPublic: v })}
        />
      </div>

      <div className="module-row">
        <div className="module-info">
          <span className="module-name">Activity heatmaps</span>
          <span className="muted small">
            Show a GitHub-style activity calendar on member profiles. Members always see their own.
          </span>
        </div>
        <Switch
          checked={cfg.heatmapEnabled}
          disabled={busy}
          label="Activity heatmaps"
          onChange={(v) => patch({ heatmapEnabled: v })}
        />
      </div>

      {cfg.heatmapEnabled && (
        <div className="module-row">
          <div className="module-info">
            <span className="module-name">Track Discord chat activity</span>
            <span className="muted small">
              Count members’ Discord messages toward the activity heatmap. This runs a persistent bot
              connection (a Durable Object) and needs the bot in your server — leave off if you don’t want it.
            </span>
          </div>
          <Switch
            checked={cfg.discordActivity}
            disabled={busy}
            label="Track Discord chat activity"
            onChange={(v) => patch({ discordActivity: v })}
          />
        </div>
      )}

      {cfg.heatmapEnabled && (
        <div className="attendance-field">
          <div className="field-label">Who can view other members’ heatmaps</div>
          <span className="muted small">
            A member always sees their own; gods always can. Pick the roles that may view everyone’s.
          </span>
          {roles.length === 0 ? (
            <p className="muted small">No roles exist yet.</p>
          ) : (
            <div className="attendance-roles">
              {roles.map((r) => (
                <div key={r.id} className="check attendance-role">
                  <Switch
                    checked={cfg.heatmapViewRoleIds.includes(r.id)}
                    onChange={() => toggleRole(r.id)}
                    disabled={busy}
                    label={`${r.name} can view heatmaps`}
                    hideState
                  />
                  <span className="dot" style={{ background: r.color ?? 'var(--color-muted)' }} />
                  {r.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="news-editor-actions">
        <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </section>
  );
}
