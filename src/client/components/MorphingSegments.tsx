/**
 * A segmented control whose active-highlight "morphs" — a filled pill slides and
 * resizes between segments on change instead of the accent background snapping
 * from one to the next. Pure measurement + a CSS transition, no animation
 * library (the sibling of MorphingTabs, for segmented controls rather than
 * underline tabs).
 *
 * Drop-in for the hand-rolled `.seg-control` blocks: pass the options, the
 * current value, and an onChange. Renders the same `.seg` buttons the CSS
 * already styles, plus an absolutely-positioned `.seg-pill` measured from the
 * active segment's box.
 */

import { useLayoutEffect, useRef, useState } from 'react';

export interface Segment<T extends string> {
  key: T;
  label: string;
  disabled?: boolean;
}

export default function MorphingSegments<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  options: Segment<T>[];
  value: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
  /** Disable the whole control (e.g. while a save is in flight). */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      const active = el?.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) return setPill(null);
      setPill({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value, options]);

  // Arrow keys move (and select) between segments — the expected keyboard
  // interaction for a segmented control. Home/End jump to the ends.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.filter((o) => !(disabled || o.disabled));
    if (enabled.length < 2) return;
    const cur = enabled.findIndex((o) => o.key === value);
    let next = cur;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = cur < 0 ? 0 : (cur + 1) % enabled.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = cur < 0 ? enabled.length - 1 : (cur - 1 + enabled.length) % enabled.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = enabled.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const target = enabled[next];
    if (!target) return;
    if (target.key !== value) onChange(target.key);
    // The button already exists in the DOM (only its active state changes), so we
    // can move focus to it immediately by its original index.
    ref.current?.querySelector<HTMLElement>(`[data-i="${options.indexOf(target)}"]`)?.focus();
  };

  return (
    <div className="seg-control morphing" role="group" aria-label={ariaLabel} ref={ref} onKeyDown={onKeyDown}>
      {pill && (
        <span className="seg-pill" aria-hidden style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />
      )}
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          data-i={i}
          data-active={o.key === value}
          aria-pressed={o.key === value}
          className={o.key === value ? 'seg active' : 'seg'}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
