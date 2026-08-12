/**
 * A member's Star Citizen CCU upgrade plans, shown on their profile.
 *
 * Read-only for everyone else (subject to the owner sharing them); on your own
 * profile it's an editor: pick a hull you own, then lay out the upgrades that
 * take it to the ship you want. Steps you already hold resolve out of your
 * imported hangar; the rest you name yourself, because planning a route is
 * mostly a matter of describing upgrades you have not bought yet.
 *
 * Chains are resolved client-side by shared/ccu.ts against whichever hangar the
 * viewer is entitled to see — so a viewer without `hangar.value` gets a plan
 * whose costs are simply absent, rather than a second place to leak them.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { visibleHangarItems, type HangarItem } from '../../shared/hangar';
import {
  ccuItems,
  displayShipName,
  resolveChain,
  sanitizeCcuBoard,
  EMPTY_CCU_BOARD,
  type CcuBoard,
  type CcuChain,
  type CcuStep,
  type StepStatus,
} from '../../shared/ccu';

interface BoardResponse {
  board: CcuBoard | null;
  self: boolean;
  canView: boolean;
  isPublic: boolean;
}

interface HangarResponse {
  hangar: { items: HangarItem[] } | null;
  canView: boolean;
}

const STATUS_LABEL: Record<StepStatus, string> = {
  ok: 'Owned',
  planned: 'To buy',
  mismatch: "Doesn't connect",
  unparsed: 'Unreadable',
  missing: 'Gone from hangar',
};

const money = (n: number) => `$${n.toFixed(2)}`;

/** Move a step from one index to an insertion point in the same list. */
function moveStep(steps: CcuStep[], from: number, to: number): CcuStep[] {
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  if (!moved) return steps;
  next.splice(to > from ? to - 1 : to, 0, moved);
  return next;
}

function newChainId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export default function CcuPlanner({
  userId,
  isSelf,
  refreshKey = 0,
}: {
  userId: number;
  isSelf: boolean;
  refreshKey?: number;
}) {
  const { can } = useSession();
  const [board, setBoard] = useState<CcuBoard | null>(null);
  const [items, setItems] = useState<HangarItem[]>([]);
  const [meta, setMeta] = useState({ canView: true, isPublic: false });
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Which step is being dragged, and where it would land. Rects are captured at
  // drag start so live reordering can't move the target out from under the
  // pointer — the list only actually changes on drop. The same value is mirrored
  // into a ref because the drop handler has to READ it and then commit an edit:
  // doing that inside a setDrag updater would make the updater impure, and React
  // double-invokes updaters in StrictMode — applying the move twice, which lands
  // the step back where it started.
  const [drag, setDrag] = useState<{ chainId: string; from: number; to: number } | null>(null);
  const dragRef = useRef<{ chainId: string; from: number; to: number } | null>(null);
  const rectsRef = useRef<DOMRect[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<BoardResponse>(`/ccu/${userId}`).catch(() => null),
      api.get<HangarResponse>(`/hangar/${userId}`).catch(() => null),
    ])
      .then(([b, h]) => {
        setBoard(b?.board ? sanitizeCcuBoard(b.board) : EMPTY_CCU_BOARD);
        setMeta({ canView: b ? b.canView : false, isPublic: !!b?.isPublic });
        setItems(h?.hangar ? visibleHangarItems(h.hangar.items) : []);
      })
      .finally(() => setLoading(false));
  }, [userId, refreshKey]);

  const hulls = useMemo(() => items.filter((i) => i.type === 'ship'), [items]);
  const ownedCcus = useMemo(() => ccuItems(items), [items]);
  const showValue = isSelf || can('hangar.value');

  const resolved = useMemo(
    () => (board ? board.chains.map((chain) => resolveChain(chain, items)) : []),
    [board, items],
  );

  /** Owned upgrades not already spent somewhere on the board. */
  const spentIds = useMemo(() => {
    const set = new Set<string>();
    board?.chains.forEach((c) => c.steps.forEach((s) => s.kind === 'owned' && set.add(s.id)));
    return set;
  }, [board]);

  const edit = useCallback((fn: (b: CcuBoard) => CcuBoard) => {
    setBoard((b) => (b ? fn(b) : b));
    setDirty(true);
    setMessage(null);
  }, []);

  const editChain = useCallback(
    (chainId: string, fn: (c: CcuChain) => CcuChain) =>
      edit((b) => ({ ...b, chains: b.chains.map((c) => (c.id === chainId ? fn(c) : c)) })),
    [edit],
  );

  /* --- drag to reorder --- */
  function startDrag(e: RPointerEvent, chainId: string, index: number) {
    const track = e.currentTarget.parentElement;
    if (!track) return;
    e.preventDefault();
    rectsRef.current = [...track.children]
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.step != null)
      .map((el) => el.getBoundingClientRect());
    dragRef.current = { chainId, from: index, to: index };
    setDrag(dragRef.current);

    const move = (ev: PointerEvent) => {
      const rects = rectsRef.current;
      let to = rects.length;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i]!;
        if (ev.clientX < r.left + r.width / 2) {
          to = i;
          break;
        }
      }
      const d = dragRef.current;
      if (d && d.to !== to) {
        dragRef.current = { ...d, to };
        setDrag(dragRef.current);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      // Dropping immediately before or after itself is a no-op, not a move.
      if (d && d.to !== d.from && d.to !== d.from + 1) {
        editChain(d.chainId, (c) => ({ ...c, steps: moveStep(c.steps, d.from, d.to) }));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  async function save() {
    if (!board) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.put('/ccu', { board });
      setDirty(false);
      setMessage('Plans saved.');
    } catch {
      setMessage('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePublic(next: boolean) {
    setSharing(true);
    const prev = meta.isPublic;
    setMeta((m) => ({ ...m, isPublic: next }));
    try {
      await api.patch('/ccu/visibility', { public: next });
    } catch {
      setMeta((m) => ({ ...m, isPublic: prev }));
    } finally {
      setSharing(false);
    }
  }

  if (loading) return <div className="loading">Loading plans…</div>;
  if (!meta.canView) {
    return <p className="muted small">This member keeps their upgrade plans private.</p>;
  }
  if (!board) return null;
  if (!isSelf && !board.chains.length) return null;

  return (
    <div className="ccu-planner">
      <header className="ccu-head">
        <div>
          <h4>Upgrade plans</h4>
          <p className="muted small">
            CCU chains — a hull you own, plus the upgrades that take it where you want to go.
          </p>
        </div>
        {isSelf && (
          <button type="button" className="primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : dirty ? 'Save plans' : 'Saved'}
          </button>
        )}
      </header>

      {message && <p className="muted small">{message}</p>}

      {isSelf && !hulls.length && (
        <p className="muted small">
          Import your hangar above first — a chain has to start from a ship you own.
        </p>
      )}

      {resolved.map(({ chain, base, steps, target, ownedValue, plannedValue, totalValue, problems }) => (
        <article key={chain.id} className="ccu-chain">
          <header className="ccu-chain-head">
            {isSelf ? (
              <input
                className="ccu-label"
                value={chain.label}
                placeholder="Name this plan"
                maxLength={80}
                onChange={(e) => editChain(chain.id, (c) => ({ ...c, label: e.target.value }))}
              />
            ) : (
              <h5>{chain.label || 'Upgrade plan'}</h5>
            )}
            {isSelf && (
              <button
                type="button"
                className="ghost small"
                onClick={() => edit((b) => ({ ...b, chains: b.chains.filter((c) => c.id !== chain.id) }))}
              >
                Delete plan
              </button>
            )}
          </header>

          <div className="ccu-track">
            <div className="ccu-base">
              <span className="ccu-step-kind">Start</span>
              {isSelf ? (
                <select
                  value={chain.baseId}
                  onChange={(e) => editChain(chain.id, (c) => ({ ...c, baseId: e.target.value }))}
                >
                  {!base && <option value={chain.baseId}>Not in your hangar</option>}
                  {hulls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{base ? displayShipName(base.name) : 'Unknown hull'}</strong>
              )}
            </div>

            {steps.map((step, i) => {
              const cls = [
                'ccu-step',
                `ccu-${step.status}`,
                drag?.chainId === chain.id && drag.from === i ? 'ccu-dragging' : '',
                drag?.chainId === chain.id && drag.to === i ? 'ccu-drop-before' : '',
                // Dropping past the last chip has no slot of its own to mark.
                drag?.chainId === chain.id && drag.to === steps.length && i === steps.length - 1
                  ? 'ccu-drop-after'
                  : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={`${chain.id}-${i}`}
                  className={cls}
                  data-step=""
                  onPointerDown={isSelf ? (e) => startDrag(e, chain.id, i) : undefined}
                  title={step.note || undefined}
                >
                  <span className="ccu-step-kind">{STATUS_LABEL[step.status]}</span>
                  <span className="ccu-step-name">
                    {step.from && step.to ? (
                      <>
                        {step.from} <span aria-hidden="true">→</span> {step.to}
                      </>
                    ) : (
                      (step.item?.name ?? 'Missing upgrade')
                    )}
                  </span>
                  {showValue && step.value > 0 && <span className="ccu-step-value">{money(step.value)}</span>}
                  {step.note && <span className="ccu-step-note muted small">{step.note}</span>}
                  {isSelf && (
                    <button
                      type="button"
                      className="ccu-step-remove"
                      title="Remove this step"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        editChain(chain.id, (c) => ({ ...c, steps: c.steps.filter((_, j) => j !== i) }))
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <footer className="ccu-summary">
            <span>
              Ends at <strong>{target || '—'}</strong>
            </span>
            {showValue && (
              <>
                <span className="muted">Owned {money(ownedValue)}</span>
                {plannedValue > 0 && <span className="muted">Still to buy {money(plannedValue)}</span>}
                <span className="muted">Total {money(totalValue)}</span>
              </>
            )}
            {problems > 0 && (
              <span className="warn small">
                {problems} step{problems === 1 ? ' needs' : 's need'} attention
              </span>
            )}
          </footer>

          {isSelf && <AddStep chain={chain} ownedCcus={ownedCcus} spentIds={spentIds} onAdd={editChain} />}
        </article>
      ))}

      {isSelf && (
        <div className="ccu-actions">
          <button
            type="button"
            className="ghost"
            disabled={!hulls.length}
            onClick={() =>
              edit((b) => ({
                ...b,
                chains: [
                  ...b.chains,
                  { id: newChainId(), label: '', baseId: hulls[0]!.id, steps: [], x: 0, y: 0 },
                ],
              }))
            }
          >
            New plan
          </button>
          {board.chains.length > 0 && (
            <label className="hangar-share">
              <input
                type="checkbox"
                checked={meta.isPublic}
                disabled={sharing}
                onChange={(e) => void togglePublic(e.target.checked)}
              />
              <span>
                <strong>Show my upgrade plans to other members</strong>
                <span className="muted small">
                  {meta.isPublic
                    ? 'Members with permission to view hangars can see these.'
                    : 'Only you can see these. Turn this on to share them with authorized members.'}
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The add-a-step control. Owned upgrades come from the hangar (minus any already
 * spent on the board); the manual form covers everything else — which today is
 * most of it, since RSI's hangar has not yet been confirmed to expose upgrades
 * in a form the importer recognises.
 */
function AddStep({
  chain,
  ownedCcus,
  spentIds,
  onAdd,
}: {
  chain: CcuChain;
  ownedCcus: { item: HangarItem; from: string; to: string }[];
  spentIds: Set<string>;
  onAdd: (chainId: string, fn: (c: CcuChain) => CcuChain) => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');

  const available = ownedCcus.filter((c) => !spentIds.has(c.item.id));

  function addPlanned() {
    if (!from.trim() || !to.trim()) return;
    onAdd(chain.id, (c) => ({
      ...c,
      steps: [...c.steps, { kind: 'planned', from: from.trim(), to: to.trim(), value: Number(value) || 0 }],
    }));
    setFrom('');
    setTo('');
    setValue('');
  }

  return (
    <div className="ccu-add">
      {available.length > 0 && (
        <label className="inline-field">
          Add an upgrade you own
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) onAdd(chain.id, (c) => ({ ...c, steps: [...c.steps, { kind: 'owned', id }] }));
            }}
          >
            <option value="">Choose…</option>
            {available.map((c) => (
              <option key={c.item.id} value={c.item.id}>
                {c.from} → {c.to}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="ccu-add-manual">
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From ship" maxLength={120} />
        <span aria-hidden="true">→</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To ship" maxLength={120} />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Cost"
          inputMode="decimal"
          size={6}
        />
        <button type="button" className="ghost small" onClick={addPlanned} disabled={!from.trim() || !to.trim()}>
          Add step
        </button>
      </div>
    </div>
  );
}
