/**
 * useDragOrder — reusable native drag-and-drop reordering for a flat list.
 *
 * Give it the current keys (in display order) and a callback that receives the
 * reordered keys; it hands back prop-spreads for a drag handle and for each row.
 * Only the handle is draggable, so text/inputs in the row stay selectable (the
 * drag-vs-select trap). Drop position is decided by the pointer's vertical
 * position over the target row, and a `.drop-before` / `.drop-after` class marks
 * where the item will land. Styling for those classes lives in styles.css.
 *
 * Flat lists only (Ranks, gallery albums, gallery items). Two-level trees with
 * cross-group moves (site nav, the admin menu) wire their own handlers.
 */

import { useState, type DragEvent } from 'react';

export interface DragOrder {
  /** true while this key is the one being dragged. */
  isDragging: (key: string) => boolean;
  /** '', 'drop-before', or 'drop-after' for the row currently hovered. */
  dropClass: (key: string) => string;
  /** Spread onto the drag handle element (a grip). */
  handleProps: (key: string) => {
    draggable: true;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Spread onto the row element (li/tr) that is a drop target. */
  rowProps: (key: string) => {
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
  };
}

export function useDragOrder(
  keys: string[],
  onReorder: (nextKeys: string[]) => void,
): DragOrder {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; after: boolean } | null>(null);

  const clear = () => {
    setDrag(null);
    setOver(null);
  };

  const commit = (from: string, to: string, after: boolean) => {
    if (from === to) return;
    const next = keys.filter((k) => k !== from);
    const ti = next.indexOf(to);
    if (ti < 0) return;
    next.splice(after ? ti + 1 : ti, 0, from);
    onReorder(next);
  };

  const posAfter = (e: DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  };

  return {
    isDragging: (k) => drag === k,
    dropClass: (k) =>
      over && over.key === k && drag !== k ? (over.after ? 'drop-after' : 'drop-before') : '',
    handleProps: (k) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        setDrag(k);
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', k);
        } catch {
          /* some browsers require a payload; ignore if refused */
        }
      },
      onDragEnd: clear,
    }),
    rowProps: (k) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (drag == null) return;
        e.preventDefault();
        setOver({ key: k, after: posAfter(e) });
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (drag == null) return;
        e.preventDefault();
        commit(drag, k, posAfter(e));
        clear();
      },
    }),
  };
}
