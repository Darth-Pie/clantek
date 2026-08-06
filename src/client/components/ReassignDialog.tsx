/**
 * Inline confirm panel for deleting a rank or role that members still hold.
 *
 * Deleting one out from under its members is a destructive, negative action, so
 * this makes the admin decide — explicitly — where those members go (another
 * rank/role, or the "none" fallback) and record a reason, which lands in the
 * audit log alongside demotions and revocations. Shown only when there are
 * members to move; a member-less rank/role deletes with a plain confirm.
 */

import { useState } from 'react';

export interface ReassignOption {
  value: number;
  label: string;
}

export default function ReassignDialog({
  title,
  count,
  options,
  defaultValue,
  noneLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** How many members currently hold the thing being deleted. */
  count: number;
  options: ReassignOption[];
  /** Pre-selected target (e.g. the next-lower rank), or null for the "none" fallback. */
  defaultValue: number | null;
  /** Label for the empty option — "No rank (unranked)" / "Remove from everyone". */
  noneLabel: string;
  busy: boolean;
  onConfirm: (target: number | null, reason: string) => void;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState<string>(defaultValue != null ? String(defaultValue) : '');
  const [reason, setReason] = useState('');

  return (
    <div className="reassign-dialog panel">
      <h3>{title}</h3>
      <p className="muted small">
        {count} member{count === 1 ? '' : 's'} currently {count === 1 ? 'holds' : 'hold'} it. Choose
        where {count === 1 ? 'it' : 'they'} should go, then confirm.
      </p>

      <label className="reassign-field">
        Move members to
        <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
          <option value="">{noneLabel}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="reassign-field">
        Reason
        <input
          value={reason}
          placeholder="Why it's being deleted (recorded in the log)"
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          autoFocus
        />
      </label>

      <div className="reassign-actions">
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="danger"
          disabled={busy || !reason.trim()}
          onClick={() => onConfirm(target === '' ? null : Number(target), reason.trim())}
        >
          Delete &amp; move
        </button>
      </div>
    </div>
  );
}
