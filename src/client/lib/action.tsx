/**
 * Shared handling for a mutating action and its three outcomes:
 *   - throws            → red error alert
 *   - returns a string  → grey success notice
 *   - returns {warning} → amber warning (saved here, but a downstream push,
 *                         usually Discord, was refused)
 *
 * Keeps the editors from each re-implementing busy/error/notice/warning state.
 */

import { useState, type ReactNode } from 'react';
import { ApiError } from './api';

export type ActionResult = string | { warning: string } | void | null;

export function useAction(reload?: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function run(fn: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setWarning(null);
    try {
      const result = await fn();
      if (reload) await reload();
      if (typeof result === 'string') setNotice(result);
      else if (result && typeof result === 'object' && 'warning' in result) {
        setWarning(result.warning);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error, notice, warning, setError, setNotice, setWarning };
}

export function Alerts({
  error,
  warning,
  notice,
}: {
  error?: string | null;
  warning?: string | null;
  notice?: string | null;
}): ReactNode {
  return (
    <>
      {error && <div className="alert">{error}</div>}
      {warning && <div className="warn-alert">{warning}</div>}
      {notice && <div className="notice">{notice}</div>}
    </>
  );
}
