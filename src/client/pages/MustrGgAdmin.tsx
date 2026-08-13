/**
 * Settings → mustr.gg — options that apply ONLY to the mustr.gg showcase install,
 * never to a buyer's deployment. The whole section is hidden unless the site is
 * running on the mustr.gg host (gated in adminSections + Admin). This is the one
 * place mustr.gg-specific knobs live, so nothing showcase-only leaks into the
 * sellable product's admin.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import Switch from '../components/Switch';

export default function MustrGgAdmin() {
  const [demo, setDemo] = useState<boolean | null>(null);
  const [wordmark, setWordmark] = useState<boolean | null>(null);
  const { run, busy, error, notice, warning } = useAction();

  useEffect(() => {
    api
      .get<{ demo: { pendingPreview: boolean } }>('/settings/demo')
      .then(({ demo }) => setDemo(demo.pendingPreview))
      .catch(() => setDemo(false));
    api
      .get<{ wordmark: { enabled: boolean } }>('/settings/wordmark')
      .then(({ wordmark }) => setWordmark(wordmark.enabled))
      .catch(() => setWordmark(false));
  }, []);

  const toggleDemo = (value: boolean) =>
    run(async () => {
      const { demo: saved } = await api.put<{ demo: { pendingPreview: boolean } }>('/settings/demo', {
        demo: { pendingPreview: value },
      });
      setDemo(saved.pendingPreview);
      return value ? 'Preview mode on.' : 'Preview mode off.';
    });

  const toggleWordmark = (value: boolean) =>
    run(async () => {
      const { wordmark: saved } = await api.put<{ wordmark: { enabled: boolean } }>('/settings/wordmark', {
        wordmark: { enabled: value },
      });
      setWordmark(saved.enabled);
      return value ? 'Wordmark styling on — reload to see it applied.' : 'Wordmark styling off — reload to clear it.';
    });

  return (
    <section className="panel modules-admin">
      <header className="panel-head">
        <h2>mustr.gg</h2>
        <p className="muted">
          Showcase-only options for the mustr.gg site. These never ship to an installed copy of the product — this
          section is hidden on every other host.
        </p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <div className="module-config">
        <h3>The mustr.gg site</h3>
        <div className="module-row">
          <div className="module-info">
            <span className="module-name">Live site</span>
            <span className="muted small">
              The public marketing site as visitors see it. Separate from this app — it’s a static Cloudflare Pages
              project, so nothing here affects it.
            </span>
          </div>
          <a className="site-link" href="https://mustr.gg" target="_blank" rel="noopener noreferrer">
            Open ↗
          </a>
        </div>
        <div className="module-row">
          <div className="module-info">
            <span className="module-name">Cloudflare Pages dashboard</span>
            <span className="muted small">
              Deployments, rollback and build logs for the <code>mustr-site</code> project — where the marketing site
              is actually published from.
            </span>
          </div>
          <a
            className="site-link"
            href="https://dash.cloudflare.com/f9954b71f74407c9f7678cde6a4c21b0/pages/view/mustr-site"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open ↗
          </a>
        </div>
      </div>

      <div className="module-config">
        <h3>Demo / preview mode</h3>
        <div className="module-row">
          <div className="module-info">
            <span className="module-name">Read-only applicant preview</span>
            <span className="muted small">
              When on, people awaiting approval can browse members-only content and the content/people admin panels{' '}
              <strong>read-only</strong> — a live tour for prospective members. Leave it <strong>off</strong> for a
              real community: applicants then see only their own profile. Writes are always blocked for applicants,
              and Settings (secrets) are never exposed.
            </span>
          </div>
          <Switch
            checked={!!demo}
            disabled={busy || demo === null}
            label="Read-only applicant preview"
            onChange={(v) => void toggleDemo(v)}
          />
        </div>
      </div>

      <div className="module-config">
        <h3>Wordmark styling</h3>
        <div className="module-row">
          <div className="module-info">
            <span className="module-name">Auto-style the “mustr” wordmark</span>
            <span className="muted small">
              Wherever the word “mustr” appears in page copy, style its lead letter in the theme’s accent colour and
              the rest of the word in the muted colour — it follows whatever theme is active. Reload after toggling
              to apply or clear it.
            </span>
          </div>
          <Switch
            checked={!!wordmark}
            disabled={busy || wordmark === null}
            label="Auto-style the mustr wordmark"
            onChange={(v) => void toggleWordmark(v)}
          />
        </div>
      </div>
    </section>
  );
}
