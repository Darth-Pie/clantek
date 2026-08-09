/**
 * First-run setup wizard (/setup) — the turnkey install flow.
 *
 * Renders full-bleed (outside the normal app chrome) whenever the install is
 * unclaimed; App swaps it in ahead of everything else. Four steps:
 *   1. Unlock     — the SETUP_TOKEN.
 *   2. Identity   — site name/URL + Discord app credentials, with the exact
 *                   redirect + interactions URLs to paste into Discord, and a
 *                   live bot/guild check.
 *   3. Claim      — sign in with Discord to become the owner (god admin).
 *
 * The wizard drives its step from the server's status so a refresh resumes where
 * you left off. Every error is shown inline with the fix — this flow is the whole
 * reason the product can ship with no support.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface SetupStatus {
  claimed: boolean;
  tokenConfigured: boolean;
  unlocked: boolean;
  identity: {
    siteName: string;
    siteUrl: string;
    discord: {
      clientId: string;
      guildId: string;
      publicKeySet: boolean;
      clientSecretSet: boolean;
      botTokenSet: boolean;
    };
  };
  urls: { redirect: string; claimRedirect: string; interactions: string };
}

export async function fetchSetupStatus(): Promise<SetupStatus | null> {
  try {
    return await api.get<SetupStatus>('/setup/status');
  } catch {
    return null;
  }
}

type Step = 'unlock' | 'identity' | 'claim';

function stepFrom(s: SetupStatus): Step {
  if (!s.unlocked) return 'unlock';
  const d = s.identity.discord;
  const ready = d.clientId && d.guildId && d.publicKeySet && d.clientSecretSet && d.botTokenSet;
  return ready ? 'claim' : 'identity';
}

/** A read-only value with a copy button — for the URLs the buyer pastes into Discord. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="setup-copy">
      <label>{label}</label>
      <div className="setup-copy-row">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function Setup({ status: initial }: { status: SetupStatus }) {
  const [status, setStatus] = useState<SetupStatus>(initial);
  const [step, setStep] = useState<Step>(stepFrom(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Surface an error handed back from the OAuth claim redirect (?error=…).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const err = p.get('error');
    if (err) {
      const detail = p.get('detail');
      setError(
        err === 'state'
          ? 'The sign-in didn’t match this browser session. Please try again.'
          : err === 'locked'
            ? 'Your setup session expired. Re-enter the setup token.'
            : err === 'discord'
              ? `Discord sign-in failed${detail ? `: ${detail}` : ''}. Check the Client ID/Secret and redirect URL.`
              : 'Setup could not complete. Please try again.',
      );
      window.history.replaceState({}, '', '/setup');
    }
  }, []);

  const refresh = async () => {
    const s = await fetchSetupStatus();
    if (s) {
      setStatus(s);
      setStep(stepFrom(s));
    }
  };

  if (status.claimed) {
    return (
      <div className="setup-wrap">
        <div className="setup-card">
          <h1>Setup complete</h1>
          <p className="muted">This install is already set up.</p>
          <a className="setup-btn primary" href="/">
            Go to the site
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-wrap">
      <div className="setup-card">
        <div className="setup-brand">
          mu<span>str</span> · setup
        </div>
        <ol className="setup-steps" aria-label="Setup progress">
          <li className={step === 'unlock' ? 'on' : 'done'}>1 · Unlock</li>
          <li className={step === 'identity' ? 'on' : step === 'claim' ? 'done' : ''}>2 · Connect Discord</li>
          <li className={step === 'claim' ? 'on' : ''}>3 · Claim ownership</li>
        </ol>

        {error && <div className="setup-error">{error}</div>}

        {step === 'unlock' && <UnlockStep status={status} busy={busy} setBusy={setBusy} setError={setError} onDone={refresh} />}
        {step === 'identity' && (
          <IdentityStep status={status} busy={busy} setBusy={setBusy} setError={setError} onDone={refresh} />
        )}
        {step === 'claim' && <ClaimStep status={status} onBack={() => setStep('identity')} />}
      </div>
    </div>
  );
}

/* ---------------- Step 1: unlock ---------------- */
function UnlockStep({
  status,
  busy,
  setBusy,
  setError,
  onDone,
}: {
  status: SetupStatus;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string) => void;
  onDone: () => Promise<void>;
}) {
  const [token, setToken] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/setup/unlock', { token });
      await onDone();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not unlock setup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-step">
      <h1>Welcome — let’s get you set up</h1>
      <p className="muted">
        This one-time wizard configures your instance and makes you the owner, then locks itself for good. Use the
        Discord account you actually want in charge — there’s no take-backs button.
      </p>
      {!status.tokenConfigured ? (
        <div className="setup-note warn">
          <strong>Set your setup token first.</strong> In the Cloudflare dashboard, open{' '}
          <em>Workers &amp; Pages → your Worker → Settings → Variables and Secrets</em>, add a secret named{' '}
          <code>SETUP_TOKEN</code> with a value only you know, deploy, then reload this page.
        </div>
      ) : (
        <p className="muted small">
          Enter the <code>SETUP_TOKEN</code> you set as a secret on this Worker.
        </p>
      )}
      <label className="setup-field">
        Setup token
        <input
          type="password"
          value={token}
          autoFocus
          disabled={busy || !status.tokenConfigured}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && token) void submit();
          }}
          placeholder={status.tokenConfigured ? 'your setup token' : 'set SETUP_TOKEN first'}
        />
      </label>
      <button className="setup-btn primary" disabled={busy || !token || !status.tokenConfigured} onClick={() => void submit()}>
        {busy ? 'Unlocking…' : 'Unlock setup'}
      </button>
    </div>
  );
}

/* ---------------- Step 2: identity + Discord ---------------- */
function IdentityStep({
  status,
  busy,
  setBusy,
  setError,
  onDone,
}: {
  status: SetupStatus;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string) => void;
  onDone: () => Promise<void>;
}) {
  const d = status.identity.discord;
  const [siteName, setSiteName] = useState(status.identity.siteName || 'mustr');
  const [siteUrl, setSiteUrl] = useState(status.identity.siteUrl || window.location.origin);
  const [clientId, setClientId] = useState(d.clientId);
  const [guildId, setGuildId] = useState(d.guildId);
  const [publicKey, setPublicKey] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [botToken, setBotToken] = useState('');
  const [validating, setValidating] = useState(false);
  const [validateMsg, setValidateMsg] = useState('');

  const save = async (): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await api.post('/setup/identity', {
        identity: {
          siteName,
          siteUrl,
          discord: { clientId, guildId, publicKey, clientSecret, botToken },
        },
      });
      return true;
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not save configuration.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAndValidate = async () => {
    if (!(await save())) return;
    setValidating(true);
    setValidateMsg('');
    try {
      const res = await api.post<{ ok: boolean; error?: string; bot?: string; guild?: string }>(
        '/setup/validate-discord',
      );
      setValidateMsg(res.ok ? `✅ Connected as ${res.bot} — can see “${res.guild}”.` : `⚠️ ${res.error}`);
    } catch (e) {
      setValidateMsg(`⚠️ ${(e as { message?: string }).message ?? 'Validation failed.'}`);
    } finally {
      setValidating(false);
    }
  };

  const saveAndContinue = async () => {
    if (await save()) await onDone();
  };

  return (
    <div className="setup-step">
      <h1>Connect Discord</h1>
      <p className="muted">
        Create a Discord application at{' '}
        <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer">
          discord.com/developers
        </a>
        , then paste its details here. Add both URLs below as OAuth2 redirects, and the interactions URL under
        General Information.
      </p>

      <div className="setup-grid">
        <label className="setup-field">
          Site name
          <input value={siteName} disabled={busy} onChange={(e) => setSiteName(e.target.value)} />
        </label>
        <label className="setup-field">
          Site URL
          <input value={siteUrl} disabled={busy} onChange={(e) => setSiteUrl(e.target.value)} />
        </label>
        <label className="setup-field">
          Discord Client ID
          <input value={clientId} disabled={busy} onChange={(e) => setClientId(e.target.value)} placeholder="numeric" />
        </label>
        <label className="setup-field">
          Discord Server (Guild) ID
          <input value={guildId} disabled={busy} onChange={(e) => setGuildId(e.target.value)} placeholder="numeric" />
        </label>
        <label className="setup-field">
          Public Key
          <input
            value={publicKey}
            disabled={busy}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder={d.publicKeySet ? '•••••• (set — leave blank to keep)' : '64 hex characters'}
          />
        </label>
        <label className="setup-field">
          Client Secret
          <input
            type="password"
            value={clientSecret}
            disabled={busy}
            autoComplete="new-password"
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={d.clientSecretSet ? '•••••• (set — leave blank to keep)' : 'from the OAuth2 page'}
          />
        </label>
        <label className="setup-field setup-span">
          Bot Token
          <input
            type="password"
            value={botToken}
            disabled={busy}
            autoComplete="new-password"
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={d.botTokenSet ? '•••••• (set — leave blank to keep)' : 'from the Bot page'}
          />
        </label>
      </div>

      <div className="setup-urls">
        <CopyRow label="OAuth2 redirect (login)" value={status.urls.redirect} />
        <CopyRow label="OAuth2 redirect (setup claim)" value={status.urls.claimRedirect} />
        <CopyRow label="Interactions endpoint URL" value={status.urls.interactions} />
      </div>

      {validateMsg && <div className="setup-note">{validateMsg}</div>}

      <div className="setup-actions">
        <button className="setup-btn" disabled={busy || validating} onClick={() => void saveAndValidate()}>
          {validating ? 'Checking…' : 'Save & test Discord'}
        </button>
        <button className="setup-btn primary" disabled={busy || validating} onClick={() => void saveAndContinue()}>
          Save & continue
        </button>
      </div>
    </div>
  );
}

/* ---------------- Step 3: claim ---------------- */
function ClaimStep({ status, onBack }: { status: SetupStatus; onBack: () => void }) {
  return (
    <div className="setup-step">
      <h1>Claim ownership</h1>
      <p className="muted">
        Sign in with Discord to become the <strong>owner</strong> of {status.identity.siteName || 'this site'}. The
        account you use gets full control, and setup closes for good.
      </p>
      <p className="setup-note">
        Make sure you added <code>{status.urls.claimRedirect}</code> as an OAuth2 redirect in your Discord app, or
        this step will fail.
      </p>
      <div className="setup-actions">
        <button className="setup-btn" onClick={onBack}>
          ← Back to Discord settings
        </button>
        <a className="setup-btn primary" href="/api/setup/claim/start">
          Sign in with Discord to claim ownership
        </a>
      </div>
    </div>
  );
}
