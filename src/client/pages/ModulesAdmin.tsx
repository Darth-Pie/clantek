/**
 * Settings → Modules — turn optional per-install features on or off.
 *
 * Star Citizen is the first: enabling it surfaces the hangar import + display on
 * member profiles. Everything defaults off so a fresh install stays lean.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import {
  clearModulesCache,
  clearScConfigCache,
  clearGalleryConfigCache,
  type ModuleFlags,
  type ScConfig,
  type GalleryConfig,
} from '../lib/modules';

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
  {
    key: 'gallery',
    label: 'Gallery',
    description:
      'Adds a Gallery page of photo and video albums, each shown to everyone, to members, or to one role. Manage albums under Content → Gallery.',
  },
];

const NO_MODULES: ModuleFlags = { starcitizen: false, gallery: false };

export default function ModulesAdmin() {
  const [flags, setFlags] = useState<ModuleFlags | null>(null);
  const [sc, setSc] = useState<ScConfig | null>(null);
  const [orgSidDraft, setOrgSidDraft] = useState('');
  const [gal, setGal] = useState<GalleryConfig | null>(null);
  const [heroTitleDraft, setHeroTitleDraft] = useState('');
  const [heroTaglineDraft, setHeroTaglineDraft] = useState('');
  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ modules: ModuleFlags }>('/settings/modules')
      .then(({ modules }) => setFlags(modules))
      .catch(() => setFlags(NO_MODULES));
    api
      .get<{ sc: ScConfig }>('/settings/sc')
      .then(({ sc }) => {
        setSc(sc);
        setOrgSidDraft(sc.orgSid);
      })
      .catch(() => {});
    api
      .get<{ gallery: GalleryConfig }>('/settings/gallery')
      .then(({ gallery }) => {
        setGal(gallery);
        setHeroTitleDraft(gallery.heroTitle);
        setHeroTaglineDraft(gallery.heroTagline);
      })
      .catch(() => {});
  }, []);

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

  // Same full-blob rule as the SC config: every save replaces the stored object,
  // so editing the copy can't drop the hero switch and vice-versa.
  const saveGallery = (next: GalleryConfig, okMsg = 'Saved.') =>
    run(async () => {
      const { gallery: saved } = await api.put<{ gallery: GalleryConfig }>('/settings/gallery', {
        gallery: next,
      });
      setGal(saved);
      setHeroTitleDraft(saved.heroTitle);
      setHeroTaglineDraft(saved.heroTagline);
      clearGalleryConfigCache();
      return okMsg;
    });

  const toggle = (key: keyof ModuleFlags, value: boolean) =>
    run(async () => {
      const next = { ...(flags ?? NO_MODULES), [key]: value };
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
            <div className="module-row">
              <div className="module-info">
                <span className="module-name">CCU upgrade planner</span>
                <span className="muted small">
                  Members lay out ship upgrade chains on top of their imported hangar. Touches RSI
                  only through the hangar, so it turns off with it.
                </span>
              </div>
              <label className="module-toggle">
                <input
                  type="checkbox"
                  checked={sc.ccuEnabled}
                  disabled={busy || !sc.hangarEnabled}
                  onChange={(e) => void saveSc({ ...sc, ccuEnabled: e.target.checked })}
                />
                <span>{!sc.hangarEnabled ? 'Off (needs hangar)' : sc.ccuEnabled ? 'On' : 'Off'}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {flags.gallery && gal && (
        <div className="module-config">
          <h3>Gallery settings</h3>
          <p className="muted small">
            Albums live under <strong>Content → Gallery</strong>. Each album decides its own
            audience, so a public album and a leadership-only one can sit side by side.
          </p>

          <div className="module-row">
            <div className="module-info">
              <span className="module-name">Scrolling hero</span>
              <span className="muted small">
                A drifting collage at the top of the gallery page, sampled from your{' '}
                <strong>public</strong> albums only. With no public albums there’s nothing safe to
                sample, so the hero simply doesn’t render.
              </span>
            </div>
            <label className="module-toggle">
              <input
                type="checkbox"
                checked={gal.heroEnabled}
                disabled={busy}
                onChange={(e) => void saveGallery({ ...gal, heroEnabled: e.target.checked })}
              />
              <span>{gal.heroEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>

          {gal.heroEnabled && (
            <>
              <label>
                Hero heading
                <input
                  type="text"
                  value={heroTitleDraft}
                  placeholder="Gallery"
                  maxLength={80}
                  disabled={busy}
                  onChange={(e) => setHeroTitleDraft(e.target.value)}
                />
              </label>
              <label>
                Hero tagline
                <div className="module-config-row">
                  <input
                    type="text"
                    value={heroTaglineDraft}
                    placeholder="Moments from the org."
                    maxLength={200}
                    disabled={busy}
                    onChange={(e) => setHeroTaglineDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="primary small"
                    disabled={
                      busy ||
                      (heroTitleDraft.trim() === gal.heroTitle &&
                        heroTaglineDraft.trim() === gal.heroTagline)
                    }
                    onClick={() =>
                      void saveGallery({
                        ...gal,
                        heroTitle: heroTitleDraft.trim(),
                        heroTagline: heroTaglineDraft.trim(),
                      })
                    }
                  >
                    Save
                  </button>
                </div>
                <span className="muted small">Leave either blank to use the built-in wording.</span>
              </label>
            </>
          )}
        </div>
      )}
    </section>
  );
}
