/**
 * Star Citizen account verification — badge + (on your own profile) the flow.
 *
 * Proves a member controls an RSI account by having them paste a one-time code
 * into their public RSI Short Bio; the server fetches the profile, confirms the
 * code, and records org membership. Verification is informational — it gates
 * nothing. Everyone viewing the SC section sees the badge; only the owner sees
 * the claim/confirm controls.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface VerifyStatus {
  verified: boolean;
  rsiHandle: string | null;
  orgSid: string | null;
  orgRank: string | null;
  inOrg: boolean;
  orgVisible: boolean;
  verifiedAt: number | null;
  pending: { code: string; handle: string } | null;
}

const RSI_PROFILE_SETTINGS = 'https://robertsspaceindustries.com/account/profile';

export default function ScVerify({ userId, isSelf }: { userId: number; isSelf: boolean }) {
  const [status, setStatus] = useState<VerifyStatus | null>(null);
  const [handle, setHandle] = useState('');
  // When already verified, "Re-verify" flips this on to show the handle entry
  // form again (rather than silently reusing a possibly-empty handle).
  const [reverifying, setReverifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    api
      .get<VerifyStatus>(`/sc/verify/${userId}`)
      .then((v) => {
        setStatus(v);
        // Prefill the handle from the pending challenge or the verified handle so
        // the entry field is never blank when re-verifying.
        if (v.pending?.handle) setHandle(v.pending.handle);
        else if (v.rsiHandle) setHandle(v.rsiHandle);
      })
      .catch(() => setStatus(null));
  }, [userId]);

  useEffect(() => load(), [load]);

  const start = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.post('/sc/verify/start', { handle: handle.trim() });
      load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not start verification.', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ ok: boolean; error?: string }>('/sc/verify/confirm', {});
      if (!res.ok) {
        setMsg({ text: res.error ?? 'Verification failed.', ok: false });
      } else {
        setMsg({ text: 'Verified! Your RSI account is confirmed.', ok: true });
        setReverifying(false);
        load();
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Verification failed.', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove your RSI verification?')) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.del('/sc/verify');
      setHandle('');
      setReverifying(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  // Abandon an in-flight challenge. Keeps an existing verification (clears only
  // the pending code); if there's no prior verification, drops the empty row.
  const cancelPending = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (status?.verified) await api.post('/sc/verify/cancel', {});
      else await api.del('/sc/verify');
      setReverifying(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  // The badge (shown to everyone viewing the section).
  const badge = status.verified ? (
    <div className="sc-verify-badge verified" title={`RSI account verified${status.verifiedAt ? ` on ${new Date(status.verifiedAt * 1000).toLocaleDateString()}` : ''}`}>
      <span className="sc-verify-check" aria-hidden>✓</span>
      Verified RSI: <strong>{status.rsiHandle}</strong>
      {status.inOrg && status.orgSid && (
        <span className="sc-verify-org">· {status.orgSid}{status.orgRank ? ` (${status.orgRank})` : ''}</span>
      )}
      {!status.inOrg && status.orgVisible && <span className="sc-verify-org muted">· not in this org</span>}
    </div>
  ) : (
    <div className="sc-verify-badge unverified">Unverified RSI account</div>
  );

  // Non-owners just see the badge.
  if (!isSelf) return <div className="sc-verify">{badge}</div>;

  return (
    <div className="sc-verify">
      {badge}

      {status.pending ? (
        <div className="sc-verify-flow">
          <p className="muted small">
            Add this code to your{' '}
            <a className="ext-link" href={RSI_PROFILE_SETTINGS} target="_blank" rel="noopener noreferrer">
              RSI Short Bio
            </a>{' '}
            (Account → Profile), Save, then confirm:
          </p>
          <code className="sc-verify-code">{status.pending.code}</code>
          <div className="sc-verify-actions">
            <button type="button" className="primary small" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Checking…' : 'I’ve added it — Verify'}
            </button>
            <button type="button" className="ghost small" disabled={busy} onClick={() => void cancelPending()}>
              Cancel
            </button>
          </div>
          <p className="muted small">
            Verifying <strong>{status.pending.handle}</strong>. You can remove the code from your bio once verified.
          </p>
        </div>
      ) : status.verified && !reverifying ? (
        <div className="sc-verify-actions">
          <button
            type="button"
            className="ghost small"
            disabled={busy}
            onClick={() => {
              setReverifying(true);
              setMsg(null);
            }}
          >
            Re-verify
          </button>
          <button type="button" className="ghost small danger" disabled={busy} onClick={() => void remove()}>
            Remove
          </button>
        </div>
      ) : (
        <div className="sc-verify-flow">
          <p className="muted small">
            {reverifying ? 'Re-verify your RSI account.' : 'Prove you own your RSI account to earn a verified badge.'}
          </p>
          <div className="sc-verify-start">
            <input
              type="text"
              placeholder="Your RSI handle"
              value={handle}
              disabled={busy}
              onChange={(e) => setHandle(e.target.value)}
            />
            <button type="button" className="primary small" disabled={busy || !handle.trim()} onClick={() => void start()}>
              Get code
            </button>
            {reverifying && (
              <button
                type="button"
                className="ghost small"
                disabled={busy}
                onClick={() => {
                  setReverifying(false);
                  setHandle(status.rsiHandle ?? '');
                  setMsg(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {msg && <p className={msg.ok ? 'muted small' : 'small warn'}>{msg.text}</p>}
    </div>
  );
}
