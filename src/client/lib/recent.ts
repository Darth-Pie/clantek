/**
 * "Recently viewed" records, per browser. Pages call recordRecent() when a
 * specific record is opened (a news post, a page, a member, …); the admin
 * sidebar shows the latest few under the matching group header so you can jump
 * straight back. Stored in localStorage — personal, device-local, no server.
 */

import { useEffect } from 'react';

export interface RecentEntry {
  /** Admin group key this record belongs under: 'content' | 'people' | 'settings'. */
  group: string;
  label: string;
  /** Where clicking it goes (any in-app path). */
  to: string;
  at: number;
}

const KEY = 'ct_recent_v1';
const MAX = 30;

function read(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: RecentEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    // Let other mounted components (the sidebar) refresh.
    window.dispatchEvent(new Event('ct-recent'));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function recordRecent(entry: Omit<RecentEntry, 'at'>): void {
  if (!entry.label || !entry.to) return;
  const list = read().filter((e) => e.to !== entry.to);
  list.unshift({ ...entry, at: Date.now() });
  write(list);
}

export function getRecent(group?: string, limit = 4): RecentEntry[] {
  const list = read();
  return (group ? list.filter((e) => e.group === group) : list).slice(0, limit);
}

/**
 * Record a record view once it's known (label truthy). Safe to call every render;
 * it only writes when `to`/`label` change.
 */
export function useRecordRecent(entry: { group: string; label: string; to: string } | null): void {
  const key = entry ? `${entry.to}|${entry.label}` : '';
  useEffect(() => {
    if (entry && entry.label) recordRecent(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
