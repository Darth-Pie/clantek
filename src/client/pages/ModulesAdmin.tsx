/**
 * Settings → Modules — turn optional per-install features on or off.
 *
 * Star Citizen is the first: enabling it surfaces the hangar import + display on
 * member profiles. Everything defaults off so a fresh install stays lean.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import { clearModulesCache, clearScConfigCache, type ModuleFlags, type ScConfig } from '../lib/modules';

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
  const [sc, setSc] = useState<ScConfig | null>(null);
  const [orgSidDraft, setOrgSidDraft] = useState('');
  const [demo, setDemo] = useState<boolean | null>(null);
  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ modules: ModuleFlags }>('/settings/modules')
      .then(({ modules }) => setFlags(modules))
      .catch(() => setFlags({ starcitizen: false }));
    api
      .get<{ sc: ScConfig }>('/settings/sc')
      .then(({ sc }) => {
        setSc(sc);
        setOrgSidDraft(sc.orgSid);
      })
      .catch(() => {});
    api
      .get<{ demo: { pendingPreview: boolean } }>('/settings/demo')
      .then(({ demo }) => setDemo(demo.pendingPreview))
      .catch(() => setDemo(false));
  }, []);

  const toggleDemo = (value: boolean) =>
    run(async () => {
      const { demo: saved } = await api.put<{ demo: { pendingPreview: boolean } }>('/settings/demo', {
        demo: { pendingPreview: value },
      });
      setDemo(saved.pendingPreview);
      return value ? 'Preview mode on.' : 'Preview mode off.';
    });

  // Every save sends the FULL SC config (the server replaces the blob), so
  // toggling a kill switch preserves the org SID and vice-versa.
  const saveSc = (next: ScConfig, okMsg = 'Saved.') =>
    run(async () => {
      const { sc: saved } = await api.put<{ sc: ScConfig }>('/settings/sc', { sc: next });
      setSc(saved);
      setOrgSidDraft(saved.orgSid);
      clearScConfigCache(); // profiles pick up a kill switch without a reload
      return okMsg;
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

      <div className="module-config">
        <h3>Demo / preview mode</h3>
        <div className="module-row">
          <div className="module-info">
            <span className="module-name">Read-only applicant preview</span>
            <span className="muted small">
              When on, people awaiting approval can browse members-only content and the content/people admin
              panels <strong>read-only</strong> — a live tour for prospective members. Leave it <strong>off</strong>
              for a real community: applicants then see only their own profile. Writes are always blocked for
              applicants, and Settings (secrets) are never exposed.
            </span>
          </div>
          <label className="module-toggle">
            <input
              type="checkbox"
              checked={!!demo}
              disabled={busy || demo === null}
              onChange={(e) => void toggleDemo(e.target.checked)}
            />
            <span>{demo ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      {flags.starcitizen && sc && (
        <div className="module-config">
          <h3>Star Citizen settings</h3>
          <label>
            Org SID
            <div className="module-config-row">
              <input
                type="text"
                value={orgSidDraft}
                placeholder="e.g. F919"
                maxLength={20}
                disabled={busy}
                onChange={(e) => setOrgSidDraft(e.target.value)}
              />
              <button
                type="button"
                className="primary small"
                disabled={busy || orgSidDraft.trim() === sc.orgSid}
                onClick={() => void saveSc({ ...sc, orgSid: orgSidDraft.trim() })}
              >
                Save
              </button>
            </div>
            <span className="muted small">
              Your org’s RSI Spectrum Identification (the tag in your org URL{' '}
              <code>/orgs/&lt;SID&gt;</code>). Used to confirm a member’s verified RSI account
              actually lists your org.
            </span>
          </label>

          <div className="module-killswitch">
            <span className="module-killswitch-title muted small">
              Feature kill switches — turn either off instantly (e.g. if RSI / Cloud Imperium
              requests it). Turning the whole module off above disables both.
            </span>
            <div className="module-row">
              <div className="module-info">
                <span className="module-name">Hangar import &amp; display</span>
                <span className="muted small">
                  Members export their own hangar (client-side bookmarklet) and it shows on profiles.
                  No server-side access to RSI.
                </span>
              </div>
              <label className="module-toggle">
                <input
                  type="checkbox"
                  checked={sc.hangarEnabled}
                  disabled={busy}
                  onChange={(e) => void saveSc({ ...sc, hangarEnabled: e.target.checked })}
                />
                <span>{sc.hangarEnabled ? 'On' : 'Off'}</span>
              </label>
            </div>
            <div className="module-row">
              <div className="module-info">
                <span className="module-name">RSI account verification</span>
                <span className="muted small">
                  Reads a member’s public RSI profile to confirm account ownership + org membership.
                  This is the only feature that fetches RSI server-side.
                </span>
              </div>
              <label className="module-toggle">
                <input
                  type="checkbox"
                  checked={sc.verifyEnabled}
                  disabled={busy}
                  onChange={(e) => void saveSc({ ...sc, verifyEnabled: e.target.checked })}
                />
                <span>{sc.verifyEnabled ? 'On' : 'Off'}</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
