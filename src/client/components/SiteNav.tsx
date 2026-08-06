/**
 * Renders the admin-arranged top menu (see shared/nav.ts).
 *
 * Two gates decide what shows, both applied here so the stored tree can stay
 * complete: a built-in's own permission (Events/Admin), which a menu entry can
 * never bypass, and the optional per-entry role the admin set. Categories become
 * click-to-open dropdowns on desktop and expand inline inside the mobile
 * hamburger. Empty categories (nothing the viewer may see) hide themselves.
 */

import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '../lib/session';
import { canAccessAdmin } from '../lib/adminSections';
import { BUILTIN_TARGETS, navItemHref, navItemLabel, type NavItem } from '../../shared/nav';

/** Close the mobile menu after a real navigation (not a category toggle). */
type NavProps = { items: NavItem[]; onNavigate: () => void };

function useVisibility() {
  const { viewer, can } = useSession();

  const roleOk = (roleId?: number): boolean =>
    roleId == null || (!!viewer && (viewer.isGod || viewer.roles.some((r) => r.id === roleId)));

  const targetOk = (item: NavItem): boolean => {
    if (item.kind === 'builtin' && item.target) {
      const b = BUILTIN_TARGETS[item.target];
      if (!b) return false;
      if (b.admin) return canAccessAdmin(can);
      if (b.permission) return can(b.permission);
    }
    return true;
  };

  const linkVisible = (item: NavItem): boolean => targetOk(item) && roleOk(item.visibleToRole);
  return { roleOk, linkVisible };
}

function Leaf({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const href = navItemHref(item);
  if (!href) return null;
  const label = navItemLabel(item);
  const external = item.kind === 'url' && /^https?:\/\//i.test(href);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
        {label}
      </a>
    );
  }
  return (
    <NavLink to={href} end={href === '/'} onClick={onNavigate} className={item.kind === 'builtin' && item.target === 'admin' ? 'nav-admin' : undefined}>
      {label}
    </NavLink>
  );
}

function Category({
  group,
  onNavigate,
}: {
  group: NavItem;
  onNavigate: () => void;
}) {
  const { linkVisible } = useVisibility();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const kids = (group.children ?? []).filter(linkVisible);
  if (kids.length === 0) return null;

  const navigateAndClose = () => {
    setOpen(false);
    onNavigate();
  };

  return (
    <div className={open ? 'nav-cat open' : 'nav-cat'} ref={ref}>
      <button
        type="button"
        className="nav-cat-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        // Don't let the click bubble to the mobile <nav>, which would close the
        // whole hamburger before the submenu can open.
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {navItemLabel(group)}
        <span className="nav-cat-caret" aria-hidden>
          ▾
        </span>
      </button>
      <div className="nav-cat-menu" role="menu">
        {kids.map((k) => (
          <Leaf key={k.id} item={k} onNavigate={navigateAndClose} />
        ))}
      </div>
    </div>
  );
}

export default function SiteNav({ items, onNavigate }: NavProps) {
  const { linkVisible, roleOk } = useVisibility();

  return (
    <>
      {items.map((item) => {
        if (item.type === 'group') {
          if (!roleOk(item.visibleToRole)) return null;
          return <Category key={item.id} group={item} onNavigate={onNavigate} />;
        }
        if (!linkVisible(item)) return null;
        return <Leaf key={item.id} item={item} onNavigate={onNavigate} />;
      })}
    </>
  );
}
