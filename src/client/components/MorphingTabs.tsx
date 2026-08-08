/**
 * A tab strip whose active-underline "morphs" — it slides and resizes between
 * tabs on change instead of snapping. Pure measurement + a CSS transition: no
 * animation library. The bar is one absolutely-positioned element positioned from
 * the active tab's measured box, so it tracks even when the tabs wrap to a new row.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

interface Tab {
  key: string;
  label: string;
}

export default function MorphingTabs({
  tabs,
  activeKey,
  hrefFor,
  ariaLabel,
}: {
  tabs: Tab[];
  activeKey: string;
  hrefFor: (key: string) => string;
  ariaLabel?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; y: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const list = listRef.current;
      const active = list?.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) return setBar(null);
      // Sit the 2px bar at the bottom edge of the active tab.
      setBar({ x: active.offsetLeft, y: active.offsetTop + active.offsetHeight - 2, w: active.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeKey, tabs]);

  return (
    <div className="admin-tabs morphing" role="tablist" aria-label={ariaLabel} ref={listRef}>
      {bar && (
        <span
          className="admin-tab-ink"
          aria-hidden
          style={{ transform: `translate(${bar.x}px, ${bar.y}px)`, width: bar.w }}
        />
      )}
      {tabs.map((t) => (
        <NavLink
          key={t.key}
          to={hrefFor(t.key)}
          data-active={t.key === activeKey}
          className={t.key === activeKey ? 'admin-tab active' : 'admin-tab'}
          role="tab"
          aria-selected={t.key === activeKey}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
