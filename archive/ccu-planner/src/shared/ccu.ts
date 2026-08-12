/**
 * The CCU (Cross Chassis Upgrade) planning contract, shared by the server
 * (stores + sanitizes) and the client (renders + edits).
 *
 * A board is portable JSON: a set of CHAINS, each a base hull plus an ordered
 * list of upgrade steps. A step is either OWNED — a reference to an upgrade
 * already in the member's hangar, by its RSI pledge id — or PLANNED, a link they
 * would still have to buy, named inline. Both kinds are needed: a chain of only
 * owned steps is a tracker, and planning a route to a ship is precisely the act
 * of laying out upgrades you do not have yet.
 *
 * Owned steps store nothing but the id, so names and values resolve live from
 * the member's current hangar (the same discipline the org chart uses for
 * members). An upgrade that gets applied in-game drops out of the next import
 * and the chain reports the gap rather than showing stale data.
 *
 * The rules a chain must satisfy are RSI's, not ours: an upgrade is one-way,
 * applies to exactly one hull, and its source ship must be whatever the hull
 * currently is. So step N's target has to be step N+1's source, and the first
 * step's source has to be the base hull. Ship-name matching across RSI's
 * inconsistent pledge naming is unavoidably fuzzy (see shipNamesMatch), which is
 * why resolveChain REPORTS problems per step rather than rejecting them — the
 * member is the authority on their own hangar, and a false mismatch that blocked
 * the builder would be worse than one they can see and ignore.
 */

import type { HangarItem } from './hangar';

/** An upgrade the member already holds, referenced by RSI pledge id. */
export interface OwnedStep {
  kind: 'owned';
  id: string;
}

/** An upgrade the member would still need to buy, named inline. */
export interface PlannedStep {
  kind: 'planned';
  from: string;
  to: string;
  /** Estimated cost in USD; 0 when unknown. */
  value: number;
}

export type CcuStep = OwnedStep | PlannedStep;

export interface CcuChain {
  /** Stable within a board; the client keys and reorders on it. */
  id: string;
  /** The member's own label, e.g. "Path to Polaris". */
  label: string;
  /** Hangar item id of the owned hull the chain starts from. */
  baseId: string;
  /** The upgrades, in the order they'd be applied. */
  steps: CcuStep[];
  x: number;
  y: number;
}

export interface CcuBoard {
  version: 1;
  chains: CcuChain[];
}

export const EMPTY_CCU_BOARD: CcuBoard = { version: 1, chains: [] };

/** RSI type slugs that mark an item as an upgrade rather than a hull. */
const CCU_TYPES = new Set(['upgrade', 'ccu']);

const MAX_CHAINS = 40;
const MAX_STEPS = 30;
const MAX_COORD = 8000;
const MAX_LABEL = 80;
const MAX_ID = 40;
const MAX_SHIP = 120;
const MAX_VALUE = 100000;

/**
 * Pull the source and target ship out of an upgrade's pledge name.
 *
 * RSI is not consistent here — the name arrives as "Upgrade - A to B", "A to B
 * Upgrade", or (once the type slug has already told us it's an upgrade) a bare
 * "A to B". Pass `trusted` when the caller has confirmed the type, which allows
 * the bare form; otherwise an explicit upgrade marker is required so that a hull
 * whose name happens to contain " to " can't be mistaken for a chain link.
 *
 * NOTE: the exact wording is still unconfirmed against a real CCU — no test
 * hangar has held an unapplied one. This is the single place to correct when a
 * specimen turns up.
 */
export function parseCcuName(name: string, trusted = false): { from: string; to: string } | null {
  let s = (name || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;

  let marked = false;
  const lead = s.replace(/^upgrade\s*[-–—:]\s*/i, '');
  if (lead !== s) {
    marked = true;
    s = lead;
  }
  const tail = s.replace(/\s*[-–—]?\s*(?:ccu|upgrade)$/i, '');
  if (tail !== s) {
    marked = true;
    s = tail;
  }
  if (!marked && !trusted) return null;

  const parts = s.split(/\s+to\s+/i);
  if (parts.length !== 2) return null;
  const from = (parts[0] || '').trim();
  const to = (parts[1] || '').trim();
  return from && to ? { from, to } : null;
}

/** Whether a hangar item is an upgrade (by RSI's type slug, or a marked name). */
export function isCcuItem(i: HangarItem): boolean {
  if (CCU_TYPES.has((i.type || '').toLowerCase())) return true;
  return parseCcuName(i.name || '') !== null;
}

/** The upgrades in a hangar, already parsed into their source → target pair. */
export function ccuItems(items: HangarItem[]): { item: HangarItem; from: string; to: string }[] {
  const out: { item: HangarItem; from: string; to: string }[] = [];
  for (const item of items) {
    if (!isCcuItem(item)) continue;
    const parsed = parseCcuName(item.name || '', true);
    if (parsed) out.push({ item, ...parsed });
  }
  return out;
}

/**
 * Reduce a ship name to something comparable. A hull arrives wearing its pledge
 * wrapper ("Standalone Ship - Aurora MR", "Aurora MR Starter Pack") while an
 * upgrade names the bare chassis, so the wrapper words and punctuation go.
 */
export function normalizeShipName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/^(?:standalone ship|standalone ships|package|combo pack|combo)\s*[-–—:]\s*/, '')
    .replace(/\b(?:starter|game)?\s*(?:pack|package|edition|bundle|warbond|lti)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * A ship name fit to show a member: the pledge wrapper stripped, but the
 * original casing kept — normalizeShipName exists for comparison and flattens
 * everything to lowercase, which reads badly in a summary line.
 */
export function displayShipName(name: string): string {
  return (name || '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:standalone ships?|package|combo pack|combo)\s*[-–—:]\s*/i, '')
    .trim();
}

/**
 * Whether two ship names plausibly denote the same chassis. Deliberately loose:
 * an upgrade often carries the manufacturer ("Origin 300i") where the hangar
 * does not ("300i"), so containment counts — guarded by a length floor so that
 * short tokens don't match half the catalogue.
 */
export function shipNamesMatch(a: string, b: string): boolean {
  const x = normalizeShipName(a);
  const y = normalizeShipName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.includes(short);
}

/**
 * `planned` is not a problem — it's a link the member knows they still have to
 * buy. Only missing/unparsed/mismatch count against a chain.
 */
export type StepStatus = 'ok' | 'planned' | 'mismatch' | 'unparsed' | 'missing';

export interface ResolvedStep {
  /** The hangar item backing an owned step; null for planned or missing ones. */
  item: HangarItem | null;
  owned: boolean;
  from: string;
  to: string;
  value: number;
  status: StepStatus;
  note: string;
}

export interface ResolvedChain {
  chain: CcuChain;
  /** The base hull, or null if it's no longer owned. */
  base: HangarItem | null;
  steps: ResolvedStep[];
  /** The hull the chain lands on once every step is applied. */
  target: string;
  baseValue: number;
  /** Value of the hull plus the upgrades already held. */
  ownedValue: number;
  /** Estimated cost of the upgrades still to buy. */
  plannedValue: number;
  /** ownedValue + plannedValue — what the finished chain represents. */
  totalValue: number;
  /** Steps that are missing, unparsed, or don't connect. */
  problems: number;
}

function valueOf(i: HangarItem | null): number {
  if (!i) return 0;
  const n = parseFloat(String(i.value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Walk a chain against the member's current hangar, carrying the running hull
 * forward so each step can be checked against what it would actually be applied
 * to. A step that doesn't connect does NOT stop the walk — the running hull
 * advances to that step's target anyway, so one bad link reports itself instead
 * of cascading a mismatch through every step after it.
 */
export function resolveChain(chain: CcuChain, items: HangarItem[]): ResolvedChain {
  const byId = new Map(items.map((i) => [i.id, i]));
  const base = byId.get(chain.baseId) || null;

  // Display-cleaned, since this label is both shown and reported in notes;
  // matching goes through shipNamesMatch, which normalises either form anyway.
  let currentLabel = base ? displayShipName(base.name) : '';
  const steps: ResolvedStep[] = [];
  let problems = 0;
  let ownedSteps = 0;
  let plannedValue = 0;

  const connect = (from: string): { status: 'ok' | 'mismatch'; note: string } => {
    if (currentLabel && shipNamesMatch(currentLabel, from)) return { status: 'ok', note: '' };
    return {
      status: 'mismatch',
      note: currentLabel
        ? `Starts from ${from}, but the hull is ${currentLabel} at this point.`
        : 'No hull to apply this to yet.',
    };
  };

  for (const step of chain.steps) {
    if (step.kind === 'planned') {
      const { status, note } = connect(step.from);
      if (status === 'mismatch') problems++;
      steps.push({
        item: null,
        owned: false,
        from: step.from,
        to: step.to,
        value: step.value,
        status: status === 'ok' ? 'planned' : 'mismatch',
        note: status === 'ok' ? 'Not owned yet — still to buy.' : note,
      });
      plannedValue += step.value;
      currentLabel = step.to;
      continue;
    }

    const item = byId.get(step.id) || null;
    if (!item) {
      steps.push({
        item: null,
        owned: false,
        from: '',
        to: '',
        value: 0,
        status: 'missing',
        note: 'No longer in the hangar — applied, melted, or not yet re-imported.',
      });
      problems++;
      continue;
    }

    const parsed = parseCcuName(item.name || '', true);
    if (!parsed) {
      steps.push({
        item,
        owned: true,
        from: '',
        to: '',
        value: valueOf(item),
        status: 'unparsed',
        note: "Couldn't read a source and target ship from this item's name.",
      });
      problems++;
      ownedSteps += valueOf(item);
      continue;
    }

    const { status, note } = connect(parsed.from);
    if (status === 'mismatch') problems++;
    steps.push({ item, owned: true, from: parsed.from, to: parsed.to, value: valueOf(item), status, note });
    ownedSteps += valueOf(item);
    currentLabel = parsed.to;
  }

  const baseValue = valueOf(base);
  const ownedValue = baseValue + ownedSteps;
  return {
    chain,
    base,
    steps,
    target: currentLabel,
    baseValue,
    ownedValue,
    plannedValue,
    totalValue: ownedValue + plannedValue,
    problems,
  };
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function clampCoord(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_COORD, Math.max(0, n));
}

function clampValue(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_VALUE, Math.round(n * 100) / 100);
}

/**
 * Coerce one untrusted step into an owned or planned link, or null to drop it.
 * A planned step needs both ends named; an owned one needs an id.
 */
function sanitizeStep(raw: unknown): CcuStep | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (o.kind === 'planned') {
    const from = str(o.from, MAX_SHIP).trim();
    const to = str(o.to, MAX_SHIP).trim();
    if (!from || !to) return null;
    return { kind: 'planned', from, to, value: clampValue(o.value) };
  }
  const id = str(o.id, MAX_ID);
  return id ? { kind: 'owned', id } : null;
}

/** Identity used to reject the same link appearing twice in one chain. */
function stepKey(s: CcuStep): string {
  return s.kind === 'owned' ? `o:${s.id}` : `p:${normalizeShipName(s.from)}>${normalizeShipName(s.to)}`;
}

/**
 * Coerce arbitrary JSON into a valid CcuBoard: bounded ids, labels and ship
 * names, clamped coordinates and values, no chain without a base, and no link
 * used twice in the same chain (RSI applies each upgrade once). Chains are NOT
 * checked against a hangar here — the board is stored independently of the
 * import, and resolveChain is where a chain meets reality.
 */
export function sanitizeCcuBoard(raw: unknown): CcuBoard {
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const chainsIn = Array.isArray(root.chains) ? root.chains : [];

  const chains: CcuChain[] = [];
  const seenChain = new Set<string>();

  chainsIn.slice(0, MAX_CHAINS).forEach((c, index) => {
    const o = c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
    const baseId = str(o.baseId, MAX_ID);
    if (!baseId) return;

    const id = str(o.id, MAX_ID) || `c${index}`;
    if (seenChain.has(id)) return;
    seenChain.add(id);

    const steps: CcuStep[] = [];
    const seenStep = new Set<string>();
    const stepsIn = Array.isArray(o.steps) ? o.steps : [];
    for (const s of stepsIn.slice(0, MAX_STEPS)) {
      const step = sanitizeStep(s);
      if (!step) continue;
      if (step.kind === 'owned' && step.id === baseId) continue;
      const key = stepKey(step);
      if (seenStep.has(key)) continue;
      seenStep.add(key);
      steps.push(step);
    }

    chains.push({ id, label: str(o.label, MAX_LABEL), baseId, steps, x: clampCoord(o.x), y: clampCoord(o.y) });
  });

  return { version: 1, chains };
}
