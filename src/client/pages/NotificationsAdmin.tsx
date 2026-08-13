/**
 * Settings → Notifications — route each event to the roles that should get the
 * in-app bell for it. An event with no roles selected is simply off. The event
 * catalog and config shape live in shared/notifications.ts.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import Switch from '../components/Switch';
import { NOTIFICATION_EVENTS, type NotificationRules } from '../../shared/notifications';

interface RoleOpt {
  id: number;
  name: string;
  color: string | null;
}

export default function NotificationsAdmin() {
  const [rules, setRules] = useState<NotificationRules>({});
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [saved, setSaved] = useState('{}');
  const [loading, setLoading] = useState(true);
  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ rules: NotificationRules; roles: RoleOpt[] }>('/notifications/rules')
      .then((d) => {
        setRules(d.rules ?? {});
        setRoles(d.roles ?? []);
        setSaved(JSON.stringify(d.rules ?? {}));
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify(rules) !== saved;

  const toggle = (eventKey: string, roleId: number) =>
    setRules((prev) => {
      const cur = prev[eventKey] ?? [];
      const next = cur.includes(roleId) ? cur.filter((r) => r !== roleId) : [...cur, roleId];
      const copy = { ...prev };
      if (next.length) copy[eventKey] = next;
      else delete copy[eventKey];
      return copy;
    });

  const save = () =>
    run(async () => {
      const { rules: clean } = await api.put<{ rules: NotificationRules }>('/notifications/rules', { rules });
      setRules(clean);
      setSaved(JSON.stringify(clean));
      return 'Saved. Members with these roles will get these notifications.';
    });

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="panel notif-admin">
      <header className="panel-head notif-admin-head">
        <div>
          <h2>Notifications</h2>
          <p className="muted">
            Choose which roles get the in-app bell for each event. An event with no roles is off. For
            example, route “New applicant awaiting approval” to the roles that vet new members.
          </p>
        </div>
        <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      {roles.length === 0 ? (
        <p className="muted">No roles exist yet. Create some on the Roles page first.</p>
      ) : (
        <div className="notif-rules">
          {NOTIFICATION_EVENTS.map((ev) => (
            <div key={ev.key} className="notif-rule">
              <div className="notif-rule-head">
                <span className="notif-rule-label">{ev.label}</span>
                <span className="muted small">{ev.description}</span>
              </div>
              <div className="notif-rule-roles">
                {roles.map((r) => (
                  <div key={r.id} className="check notif-role">
                    <Switch
                      checked={(rules[ev.key] ?? []).includes(r.id)}
                      onChange={() => toggle(ev.key, r.id)}
                      disabled={busy}
                      label={`${r.name} receives ${ev.label}`}
                      hideState
                    />
                    <span className="dot" style={{ background: r.color ?? 'var(--color-muted)' }} />
                    {r.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
