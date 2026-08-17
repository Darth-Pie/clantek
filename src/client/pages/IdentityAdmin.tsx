/**
 * Identity & Discord admin — the setup/config surface for a self-hosted install.
 *
 * Everything Discord-login and site-identity related that used to live only in
 * wrangler.jsonc is editable here: point the site at your own Discord app and
 * domain without redeploying. Saved values override the deploy defaults; blank
 * fields fall back to them. Secret values (client secret, bot token) are never
 * sent back from the server — the form only knows whether one is set — so a
 * blank secret field means "keep the current one".
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import { BOT_PERMISSIONS } from '../../shared/botPermissions';

interface Identity {
  siteName: string;
  siteUrl: string;
  discord: {
    clientId: string;
    guildId: string;
    publicKey: string;
    clientSecretSet: boolean;
    botTokenSet: boolean;
  };
}

interface Urls {
  redirectUri: string;
  interactionsUrl: string;
  /** Pre-scoped, least-privilege bot invite — empty until the Client ID is set. */
  botInvite: string;
}

/** A plain external link that opens safely in a new tab. */
function Ext({ href, children }: { href: string; children: string }) {
  return (
    <a className="ext-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the value is still visible to select manually */
    }
  };
  return (
    <div className="identity-url">
      <span className="identity-url-label muted small">{label}</span>
      <div className="identity-url-row">
        <code>{value}</code>
        <button type="button" className="ghost small" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function IdentityAdmin() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Identity | null>(null);
  const [urls, setUrls] = useState<Urls | null>(null);

  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [guildId, setGuildId] = useState('');
  const [publicKey, setPublicKey] = useState('');
  // Secrets are write-only: empty means "leave unchanged".
  const [clientSecret, setClientSecret] = useState('');
  const [botToken, setBotToken] = useState('');

  const { run, busy, error, notice, warning } = useAction();

  const apply = (id: Identity) => {
    setSaved(id);
    setSiteName(id.siteName);
    setSiteUrl(id.siteUrl);
    setClientId(id.discord.clientId);
    setGuildId(id.discord.guildId);
    setPublicKey(id.discord.publicKey);
    setClientSecret('');
    setBotToken('');
  };

  useEffect(() => {
    api
      .get<{ identity: Identity; urls: Urls }>('/settings/identity')
      .then(({ identity, urls }) => {
        apply(identity);
        setUrls(urls);
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty =
    !!saved &&
    (siteName !== saved.siteName ||
      siteUrl !== saved.siteUrl ||
      clientId !== saved.discord.clientId ||
      guildId !== saved.discord.guildId ||
      publicKey !== saved.discord.publicKey ||
      clientSecret !== '' ||
      botToken !== '');

  const save = () =>
    run(async () => {
      const { identity } = await api.put<{ identity: Identity }>('/settings/identity', {
        identity: {
          siteName,
          siteUrl,
          discord: { clientId, guildId, publicKey, clientSecret, botToken },
        },
      });
      apply(identity);
      return 'Saved. Discord login now uses these settings.';
    });

  const test = () =>
    run(async () => {
      const res = await api.post<{ ok: boolean; channelCount?: number; error?: string }>(
        '/settings/identity/test',
      );
      if (!res.ok) return { warning: res.error ?? 'The bot could not connect.' };
      return `Bot connected — it can see ${res.channelCount} text channel${res.channelCount === 1 ? '' : 's'}.`;
    });

  const registerCommands = () =>
    run(async () => {
      const res = await api.post<{ ok: boolean; count?: number; error?: string }>(
        '/settings/identity/register-commands',
      );
      if (!res.ok) return { warning: res.error ?? 'Could not register commands.' };
      return `Registered ${res.count} slash command${res.count === 1 ? '' : 's'} with Discord.`;
    });

  if (loading) return <div className="loading">Loading…</div>;

  // Deep-link straight to this app's pages once the Client ID is known; otherwise
  // send them to the applications list to pick (or create) the app.
  const appBase = clientId
    ? `https://discord.com/developers/applications/${clientId}`
    : 'https://discord.com/developers/applications';

  return (
    <section className="panel identity-admin">
      <header className="panel-head">
        <h2>Identity &amp; Discord</h2>
        <p className="muted">
          Point this site at your own Discord application and domain. Saved values override the
          deploy defaults; leave a field blank to fall back to the default.
        </p>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      <fieldset>
        <legend>Site</legend>
        <label>
          Site name
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} disabled={busy} maxLength={80} />
        </label>
        <label>
          Canonical site URL
          <input
            value={siteUrl}
            placeholder="https://mustr.gg"
            onChange={(e) => setSiteUrl(e.target.value)}
            disabled={busy}
          />
          <span className="muted small">
            Used to build absolute links in Discord embeds. Blank = use the deploy default.
          </span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Discord application</legend>
        <p className="muted small">
          All four values come from{' '}
          <Ext href="https://discord.com/developers/applications">the Discord Developer Portal</Ext>.
          Create an application there (or open your existing one), then copy each value from the page
          noted below. {clientId && <>Quick links open <em>your</em> app.</>}
        </p>
        <label>
          Client ID
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={busy} inputMode="numeric" />
          <span className="muted small">
            Your app → <strong>General Information</strong> → “Application ID”.{' '}
            <Ext href={clientId ? `${appBase}/information` : appBase}>Open ↗</Ext>
          </span>
        </label>
        <label>
          Server (Guild) ID
          <input value={guildId} onChange={(e) => setGuildId(e.target.value)} disabled={busy} inputMode="numeric" />
          <span className="muted small">
            Login is gated on membership in this Discord server. In Discord, enable{' '}
            <strong>Settings → Advanced → Developer Mode</strong>, then right-click your server icon →
            “Copy Server ID”.{' '}
            <Ext href="https://support.discord.com/hc/en-us/articles/206346498">How ↗</Ext>
          </span>
        </label>
        <label>
          Public Key
          <input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} disabled={busy} />
          <span className="muted small">
            64 hex characters. Your app → <strong>General Information</strong> → “Public Key”.{' '}
            <Ext href={clientId ? `${appBase}/information` : appBase}>Open ↗</Ext>
          </span>
        </label>
        <label>
          Client Secret
          <input
            type="password"
            value={clientSecret}
            placeholder={saved?.discord.clientSecretSet ? '•••••••• (set — leave blank to keep)' : 'not set'}
            onChange={(e) => setClientSecret(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
          <span className="muted small">
            Your app → <strong>OAuth2</strong> → “Reset Secret” (shown once). Powers Discord login.{' '}
            <Ext href={clientId ? `${appBase}/oauth2` : appBase}>Open ↗</Ext>
          </span>
        </label>
        <label>
          Bot Token
          <input
            type="password"
            value={botToken}
            placeholder={saved?.discord.botTokenSet ? '•••••••• (set — leave blank to keep)' : 'not set'}
            onChange={(e) => setBotToken(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
          <span className="muted small">
            Your app → <strong>Bot</strong> → “Reset Token” (shown once). Powers announcements and role
            sync. Stored in this site's database — see the note below.{' '}
            <Ext href={clientId ? `${appBase}/bot` : appBase}>Open ↗</Ext>
          </span>
        </label>
      </fieldset>

      {urls && (
        <fieldset>
          <legend>Paste these into Discord</legend>
          <p className="muted small">
            In the Discord Developer Portal for your app, add the redirect URL under{' '}
            <strong>OAuth2 → Redirects</strong>, and set the{' '}
            <strong>Interactions Endpoint URL</strong> under General Information. They must match
            this site's address exactly.
          </p>
          <CopyField label="OAuth2 redirect URL" value={urls.redirectUri} />
          <CopyField label="Interactions Endpoint URL" value={urls.interactionsUrl} />
        </fieldset>
      )}

      {urls?.botInvite && (
        <fieldset>
          <legend>Invite the bot</legend>
          <p className="muted small">
            A ready-made invite that asks Discord for <strong>only</strong> the permissions mustr
            actually uses — never Administrator. Open it while signed in as your server’s owner (or an
            admin) and pick your server. What each permission is for:
          </p>
          <ul className="bot-perms">
            {BOT_PERMISSIONS.map((p) => (
              <li key={p.name}>
                <strong>{p.name}</strong>
                <span className="muted small"> — {p.why}</span>
              </li>
            ))}
          </ul>
          <div className="news-editor-actions">
            <a className="bot-invite-btn" href={urls.botInvite} target="_blank" rel="noopener noreferrer">
              Open invite in Discord ↗
            </a>
          </div>
          <CopyField label="Or copy the invite link" value={urls.botInvite} />
          <p className="muted small">
            Members wary of bots? Point them at the plain-English rundown of exactly what this bot can
            and can’t do: <Ext href="/bot">mustr.gg/bot</Ext>.{' '}
            After inviting, drag the bot’s role <strong>above</strong> the ranks it manages
            (Server Settings → Roles) so role sync can work.
          </p>
        </fieldset>
      )}

      <p className="muted small warn">
        Note: the client secret and bot token are stored in this site's database (not encrypted
        Cloudflare secrets), so anyone with database access or god-admin rights can read them. Use a
        Discord app dedicated to this site.
      </p>

      <div className="news-editor-actions">
        <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
          Save
        </button>
        <button
          disabled={busy}
          onClick={() => void test()}
          title="Check the saved bot token and Server ID actually reach Discord"
        >
          Test bot connection
        </button>
        <button
          disabled={busy}
          onClick={() => void registerCommands()}
          title="Push the bot's slash commands (/whois, /roster, /event, …) to your Discord server"
        >
          Register slash commands
        </button>
      </div>
    </section>
  );
}
