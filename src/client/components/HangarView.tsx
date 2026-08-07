/**
 * A member's Star Citizen hangar — the same categorised, searchable, image grid
 * we prototyped, reading the member's stored items. Shown on the member profile
 * when the SC module is enabled. Read-only; importing lives in HangarImport.
 */

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import {
  HANGAR_CATEGORIES,
  hangarImageUrl,
  hangarValueNum,
  visibleHangarItems,
  type HangarItem,
} from '../../shared/hangar';

interface HangarResponse {
  hangar: { items: HangarItem[]; importedAt: number } | null;
  self: boolean;
  canView: boolean;
  isPublic: boolean;
}

export default function HangarView({ userId, refreshKey = 0 }: { userId: number; refreshKey?: number }) {
  const { can } = useSession();
  const [items, setItems] = useState<HangarItem[] | null>(null);
  const [importedAt, setImportedAt] = useState<number | null>(null);
  const [meta, setMeta] = useState<{ self: boolean; canView: boolean; isPublic: boolean }>({
    self: false,
    canView: true,
    isPublic: false,
  });
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'name', dir: 1 });

  useEffect(() => {
    setLoading(true);
    api
      .get<HangarResponse>(`/hangar/${userId}`)
      .then((res) => {
        // Only display-worthy types (drops equipment/loot/coupons/etc.).
        setItems(res.hangar ? visibleHangarItems(res.hangar.items) : null);
        setImportedAt(res.hangar?.importedAt ?? null);
        setMeta({ self: res.self, canView: res.canView, isPublic: res.isPublic });
      })
      .catch(() => setItems(null))
      .finally(() => setLoading(false));
  }, [userId, refreshKey]);

  const rows = useMemo(() => {
    if (!items) return [];
    const catTest = HANGAR_CATEGORIES.find((c) => c.key === cat)!.test;
    const needle = q.toLowerCase();
    const list = items
      .filter(catTest)
      .filter((i) => !needle || i.name.toLowerCase().includes(needle) || i.type.toLowerCase().includes(needle));
    return [...list].sort((a, b) => {
      let x: string | number = sort.k === 'valueNum' ? hangarValueNum(a) : (a[sort.k as keyof HangarItem] ?? '');
      let y: string | number = sort.k === 'valueNum' ? hangarValueNum(b) : (b[sort.k as keyof HangarItem] ?? '');
      if (typeof x === 'string') x = x.toLowerCase();
      if (typeof y === 'string') y = y.toLowerCase();
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
  }, [items, cat, q, sort]);

  if (loading) return <div className="loading">Loading hangar…</div>;
  if (!items) {
    // A permission-holder looking at a member who hasn't shared their hangar.
    if (!meta.self && meta.canView === false) {
      return <p className="muted">This member keeps their hangar private.</p>;
    }
    return <p className="muted">No hangar imported yet.</p>;
  }

  const sortBy = (k: string) => setSort((s) => (s.k === k ? { k, dir: s.dir === 1 ? -1 : 1 } : { k, dir: 1 }));
  const arrow = (k: string) => (sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  // At-a-glance totals over the displayed items: how many ships, and the summed
  // pledge value (rough — packages list their own price alongside their ships).
  const shipCount = items.filter((i) => i.type === 'ship').length;
  const totalValue = items.reduce((sum, i) => sum + Math.max(0, hangarValueNum(i)), 0);

  // Monetary value is the main incentive to inflate a self-reported hangar, so it
  // is hidden from the roster at large: owners always see their own; everyone else
  // needs the `hangar.value` permission (officer-only by default).
  const showValue = meta.self || can('hangar.value');

  return (
    <div className="hangar-view">
      <div className="hangar-toolbar">
        <div className="hangar-filters">
          {HANGAR_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={c.key === cat ? 'hangar-chip active' : 'hangar-chip'}
              onClick={() => setCat(c.key)}
            >
              {c.label}
              <span className="n">{items.filter(c.test).length}</span>
            </button>
          ))}
        </div>
        <input
          className="hangar-search"
          placeholder="Search name or type…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="hangar-summary">
        <span className="hangar-stat">
          <strong>{items.length}</strong> items
        </span>
        <span className="hangar-stat">
          <strong>{shipCount}</strong> ships
        </span>
        {showValue && totalValue > 0 && (
          <span className="hangar-stat">
            <strong>${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> value
          </span>
        )}
      </div>

      <div className="hangar-count muted small">
        Showing {rows.length} of {items.length}
        {importedAt ? ` · imported ${new Date(importedAt * 1000).toLocaleDateString()}` : ''}
      </div>

      <p className="hangar-selfreport muted small" title="Imported by the member from their RSI hangar; mustr does not verify its contents.">
        ⓘ Self-reported — imported by the member, not verified.
      </p>

      <div className="hangar-table-wrap">
        <table className="hangar-table">
          <thead>
            <tr>
              <th>Preview</th>
              <th onClick={() => sortBy('name')}>Name{arrow('name')}</th>
              <th onClick={() => sortBy('type')}>Type{arrow('type')}</th>
              {showValue && <th onClick={() => sortBy('valueNum')}>Value{arrow('valueNum')}</th>}
              <th onClick={() => sortBy('availability')}>Availability{arrow('availability')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i, idx) => {
              const src = hangarImageUrl(i);
              return (
                <tr key={i.id || idx}>
                  <td>{src && <img className="hangar-thumb" loading="lazy" src={src} alt="" />}</td>
                  <td className="hangar-name">{i.name}</td>
                  <td>
                    <span className="hangar-type">{i.type}</span>
                  </td>
                  {showValue && <td>{i.value}</td>}
                  <td className="muted small">{i.availability}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted small hangar-empty">No items match this filter.</p>}
      </div>
    </div>
  );
}
