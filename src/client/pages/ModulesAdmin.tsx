/**
 * Settings → Modules — turn optional per-install features on or off.
 *
 * Star Citizen is the first: enabling it surfaces the hangar import + display on
 * member profiles. Everything defaults off so a fresh install stays lean.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import { clearModulesCache, type ModuleFlags } from '../lib/modules';

interface ModuleDef {
  key: keyof ModuleFlags;
  label: string;
  description: string;
}

const MODULES: ModuleDef[] = [
  {
    key: 'starcitizen',
    label: 'Star Citizen',
    description:
      'Lets members import their RSI hangar (via a bookmarklet) and shows it, categorised and searchable, at the bottom of their profile.',
  },
];

export default function ModulesAdmin() {
  const [flags, setFlags] = useState<ModuleFlags | null>(null);
  const [orgSid, setOrgSid] = useState('');
  const [orgSidSaved, setOrgSidSaved] = useState('');
  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ modules: ModuleFlags }>('/settings/modules')
      .then(({ modules }) => setFlags(modules))
      .catch(() => setFlags({ starcitizen: false }));
    api
      .get<{ sc: { orgSid: string } }>('/settings/sc')
      .then(({ sc }) => {
        setOrgSid(sc.orgSid);
        setOrgSidSaved(sc.orgSid);
      })
      .catch(() => {});
  }, []);

  const saveOrgSid = () =>
    run(async () => {
      const { sc } = await api.put<{ sc: { orgSid: string } }>('/settings/sc', { sc: { orgSid: orgSid.trim() } });
      setOrgSid(sc.orgSid);
      setOrgSidSaved(sc.orgSid);
      return 'Saved.';
    });

  const toggle = (key: keyof ModuleFlags, value: boolean) =>
    run(async () => {
      const next = { ...(flags ?? { starcitizen: false }), [key]: value };
      const { modules } = await api.put<{ modules: ModuleFlags }>('/settings/modules', { modules: next });
      setFlags(modules);
      clearModulesCache(); // so profiles pick up the change without a reload
      return value ? 'Module enabled.' : 'Module disabled.';
    });

  if (!flags) return <div className="loading">Loading…</div>;

  return (
    <section className="panel modules-admin">
      <header className="panel-head">
        <h2>Modules</h2>
        <p className="muted">Optional features for this site. Turn on only what your group needs.</p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <ul className="modules-list">
        {MODULES.map((m) => (
          <li key={m.key} className="module-row">
            <div className="module-info">
              <span className="module-name">{m.label}</span>
              <span className="muted small">{m.description}</span>
            </div>
            <label className="module-toggle">
              <input
                type="checkbox"
                checked={!!flags[m.key]}
                disabled={busy}
                onChange={(e) => void toggle(m.key, e.target.checked)}
              />
              <span>{flags[m.key] ? 'On' : 'Off'}</span>
            </label>
          </li>
        ))}
      </ul>

      {flags.starcitizen && (
        <div className="module-config">
          <h3>Star Citizen settings</h3>
          <label>
            Org SID
            <div className="module-config-row">
              <input
                type="text"
                value={orgSid}
                placeholder="e.g. F919"
                maxLength={20}
                disabled={busy}
                onChange={(e) => setOrgSid(e.target.value)}
              />
              <button
                type="button"
                className="primary small"
                disabled={busy || orgSid.trim() === orgSidSaved}
                onClick={() => void saveOrgSid()}
              >
                Save
              </button>
            </div>
            <span className="muted small">
              Your org’s RSI Spectrum Identification (the tag in your org URL
              <code>/orgs/&lt;SID&gt;</code>). Used to confirm a member’s verified RSI account
              actually lists your org.
            </span>
          </label>
        </div>
      )}
    </section>
  );
}
