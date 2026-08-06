/**
 * Branding admin — upload a header logo and set how big it sits at the top of
 * the page. The logo replaces the "ClanTek" wordmark in the header: oversized and
 * overhanging the bar at the top of a page, shrinking to fit inside the bar once
 * the visitor scrolls. Saving updates the live header immediately (shared
 * BrandingProvider), and clearing it falls back to the site-name text.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useBranding, type Branding } from '../lib/branding';

export default function BrandingAdmin() {
  const { branding, preview, save } = useBranding();
  const [draft, setDraft] = useState<Branding>(branding);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Seed the draft from the loaded branding once it arrives.
  useEffect(() => {
    setDraft(branding);
    // Only when the persisted value changes (load/save), not on every preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding.logoUrl]);

  /** Update the draft and push a live header preview so changes are visible at once. */
  function edit(patch: Partial<Branding>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    preview(next);
    setMessage(null);
  }

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      await save(draft);
      setMessage('Saved. The header logo is live.');
    } catch {
      setMessage('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel branding-admin">
      <header className="panel-head">
        <div>
          <h2>Branding</h2>
          <p className="muted">
            Upload a logo for the header. It shows in place of the site name — large and
            overhanging the bar at the top of the page, shrinking into the bar as visitors
            scroll.
          </p>
        </div>
        <button type="button" className="primary" onClick={onSave} disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      {message && <div className="notice">{message}</div>}

      <div className="branding-grid">
        <div className="branding-controls">
          {draft.logoUrl && (
            <div className="branding-preview" style={{ ['--h' as string]: `${draft.logoSize}px` }}>
              <img src={draft.logoUrl} alt="Logo preview" />
            </div>
          )}

          <div className="avatar-controls">
            <label className="upload-btn">
              {uploading ? 'Uploading…' : draft.logoUrl ? 'Change logo' : 'Upload logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                hidden
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setErr(null);
                  setUploading(true);
                  try {
                    const res = await api.upload<{ url: string }>('/media/branding', file);
                    edit({ logoUrl: res.url });
                  } catch (e2) {
                    setErr(e2 instanceof Error ? e2.message : 'Upload failed.');
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            {draft.logoUrl && (
              <button
                type="button"
                className="ghost"
                disabled={uploading}
                onClick={() => edit({ logoUrl: '' })}
              >
                Remove logo
              </button>
            )}
          </div>
          {err && <p className="muted small branding-err">{err}</p>}

          <label className="branding-size">
            Logo size at the top of the page
            <input
              type="range"
              min={48}
              max={160}
              step={2}
              value={draft.logoSize}
              disabled={!draft.logoUrl}
              onChange={(e) => edit({ logoSize: Number(e.target.value) })}
            />
            <span className="muted small">{draft.logoSize}px tall (shrinks to 38px on scroll)</span>
          </label>

          {!draft.logoUrl && (
            <p className="muted small">With no logo uploaded, the header shows the site name as text.</p>
          )}

          <div className="branding-favicon">
            <div className="branding-favicon-head">
              {draft.faviconUrl ? (
                <img className="branding-favicon-preview" src={draft.faviconUrl} alt="Favicon preview" />
              ) : (
                <span className="branding-favicon-preview placeholder" aria-hidden />
              )}
              <div>
                <strong>Browser tab icon</strong>
                <p className="muted small">
                  The little icon shown in the browser tab and bookmarks (the favicon). A square
                  PNG works best — 512×512 with a transparent background.
                </p>
              </div>
            </div>
            <div className="avatar-controls">
              <label className="upload-btn">
                {uploading ? 'Uploading…' : draft.faviconUrl ? 'Change icon' : 'Upload icon'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  hidden
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setErr(null);
                    setUploading(true);
                    try {
                      const res = await api.upload<{ url: string }>('/media/branding', file);
                      edit({ faviconUrl: res.url });
                    } catch (e2) {
                      setErr(e2 instanceof Error ? e2.message : 'Upload failed.');
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
              {draft.faviconUrl && (
                <button
                  type="button"
                  className="ghost"
                  disabled={uploading}
                  onClick={() => edit({ faviconUrl: '' })}
                >
                  Remove icon
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="branding-hint muted small">
          <p><strong>Tips</strong></p>
          <ul>
            <li>A transparent PNG looks best — the header background shows through.</li>
            <li>A wide wordmark or a compact emblem both work; the size slider sets its height.</li>
            <li>Scroll the page after saving to see it dock into the bar.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
