/**
 * SEO & Sharing admin — the settings-driven meta tags the Worker injects into
 * the served HTML <head> (title/description/Open Graph/Twitter/robots/verification
 * /JSON-LD), so link previews (Discord, Google, X, Facebook) and search results
 * are correct even though the app is a client-side SPA.
 *
 * Structured fields only — every value is escaped and URL-validated server-side,
 * so an operator can customise robustly without risking script in their own head.
 * The site name/URL live in Identity & Discord; changed there, shown here.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';

interface Seo {
  description?: string;
  keywords?: string;
  noindex?: boolean;
  themeColor?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterHandle?: string;
  googleVerification?: string;
  bingVerification?: string;
  social?: Record<string, string>;
}

const SOCIALS: { key: string; label: string }[] = [
  { key: 'website', label: 'Website' },
  { key: 'discord', label: 'Discord invite' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'twitch', label: 'Twitch' },
  { key: 'twitter', label: 'X / Twitter' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
];

export default function SeoAdmin() {
  const [seo, setSeo] = useState<Seo>({});
  const [site, setSite] = useState<{ name: string; url: string }>({ name: '', url: '' });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ seo: Seo; site: { name: string; url: string } }>('/settings/seo')
      .then(({ seo, site }) => {
        setSeo(seo ?? {});
        setSite(site);
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (patch: Partial<Seo>) => setSeo((s) => ({ ...s, ...patch }));
  const setSocial = (key: string, val: string) =>
    setSeo((s) => ({ ...s, social: { ...(s.social ?? {}), [key]: val } }));

  const save = () =>
    run(async () => {
      const { seo: saved } = await api.put<{ seo: Seo }>('/settings/seo', { seo });
      setSeo(saved ?? {});
      return 'Saved. Link previews and search tags now use these settings.';
    });

  const uploadOg = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.upload<{ url: string }>('/media/branding', file);
      set({ ogImage: res.url });
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="panel seo-admin">
      <header className="panel-head">
        <div>
          <h2>SEO &amp; Sharing</h2>
          <p className="muted">
            These control the browser-tab title, search-engine listing, and the link preview shown
            when your site is shared (Discord, Google, X, Facebook). The site name is{' '}
            <strong>{site.name || 'not set'}</strong> — change it under Identity &amp; Discord.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <fieldset>
        <legend>Search</legend>
        <label>
          Description
          <input
            value={seo.description ?? ''}
            maxLength={300}
            placeholder="One or two sentences about your group — shown under the title in search results."
            onChange={(e) => set({ description: e.target.value })}
            disabled={busy}
          />
        </label>
        <label>
          Keywords <span className="muted small">(comma-separated, optional)</span>
          <input value={seo.keywords ?? ''} maxLength={300} onChange={(e) => set({ keywords: e.target.value })} disabled={busy} />
        </label>
        <label className="inline-field">
          <input
            type="checkbox"
            checked={!!seo.noindex}
            onChange={(e) => set({ noindex: e.target.checked })}
            disabled={busy}
          />
          Hide from search engines (members-only site) — sets <code>noindex</code>.
        </label>
      </fieldset>

      <fieldset>
        <legend>Link preview (Open Graph / Twitter)</legend>
        <p className="muted small">
          This is the card people see when your link is posted in Discord or on social media.
          Defaults to the site name and the description above when left blank.
        </p>
        <label>
          Preview title
          <input value={seo.ogTitle ?? ''} maxLength={120} placeholder={site.name} onChange={(e) => set({ ogTitle: e.target.value })} disabled={busy} />
        </label>
        <label>
          Preview description
          <input
            value={seo.ogDescription ?? ''}
            maxLength={300}
            placeholder="Falls back to the search description above."
            onChange={(e) => set({ ogDescription: e.target.value })}
            disabled={busy}
          />
        </label>
        <label>
          Preview image
          <div className="seo-og">
            {seo.ogImage && <img className="seo-og-preview" src={seo.ogImage} alt="" />}
            <label className="upload-btn mini">
              {uploading ? 'Uploading…' : seo.ogImage ? 'Change image' : 'Upload image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                disabled={busy || uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadOg(f);
                }}
              />
            </label>
            {seo.ogImage && (
              <button type="button" className="mini" disabled={busy} onClick={() => set({ ogImage: '' })}>
                Remove
              </button>
            )}
          </div>
          <span className="muted small">1200×630 works best. Shown large in Discord/Twitter previews.</span>
        </label>
        <label>
          X / Twitter handle <span className="muted small">(optional)</span>
          <input value={seo.twitterHandle ?? ''} maxLength={40} placeholder="@yourhandle" onChange={(e) => set({ twitterHandle: e.target.value })} disabled={busy} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Appearance</legend>
        <label>
          Theme color <span className="muted small">(browser UI tint on mobile / PWA)</span>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(seo.themeColor ?? '') ? seo.themeColor! : '#0f1115'}
            onChange={(e) => set({ themeColor: e.target.value })}
            disabled={busy}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Verification</legend>
        <p className="muted small">Paste the codes to claim your site in each search console.</p>
        <label>
          Google Search Console
          <input value={seo.googleVerification ?? ''} maxLength={200} placeholder="google-site-verification value" onChange={(e) => set({ googleVerification: e.target.value })} disabled={busy} />
        </label>
        <label>
          Bing Webmaster
          <input value={seo.bingVerification ?? ''} maxLength={200} placeholder="msvalidate.01 value" onChange={(e) => set({ bingVerification: e.target.value })} disabled={busy} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Social profiles <span className="muted small">(feed rich-result data)</span></legend>
        {SOCIALS.map((sc) => (
          <label key={sc.key}>
            {sc.label}
            <input
              value={seo.social?.[sc.key] ?? ''}
              maxLength={400}
              placeholder="https://…"
              onChange={(e) => setSocial(sc.key, e.target.value)}
              disabled={busy}
            />
          </label>
        ))}
      </fieldset>

      <div className="news-editor-actions">
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
