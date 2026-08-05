/**
 * The admin panel shell.
 *
 * One screen for every admin tool: a left sidebar of sections and a content
 * area that swaps to the selected one (the WordPress admin pattern). Each
 * section is gated on a permission, so the sidebar only ever shows what the
 * viewer is actually allowed to touch. Adding a new tool later is a single
 * entry in ADMIN_SECTIONS — the route (/admin/:section), the sidebar link, and
 * the access check all fall out of it.
 */

import { useParams, Navigate, NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSession } from '../lib/session';
import { ADMIN_SECTIONS } from '../lib/adminSections';
import UsageBar from '../components/UsageBar';
import NewsAdmin from './NewsAdmin';
import Ranks from './Ranks';
import Roles from './Roles';
import Medals from './Medals';
import Games from './Games';
import WarRecords from './WarRecords';
import Announcements from './Announcements';
import Theme from './Theme';
import PagesAdmin from './PagesAdmin';
import AuditLog from './AuditLog';

/**
 * Section key → its component. The metadata (labels, permissions, order) lives
 * in lib/adminSections.ts so lightweight consumers (the account menu, the nav)
 * can gate on the admin areas without pulling these pages — and TipTap — into
 * the initial bundle. Every key in ADMIN_SECTIONS must have an entry here.
 */
const SECTION_RENDERERS: Record<string, () => ReactNode> = {
  news: () => <NewsAdmin />,
  pages: () => <PagesAdmin />,
  ranks: () => <Ranks />,
  roles: () => <Roles />,
  medals: () => <Medals />,
  games: () => <Games />,
  warrecords: () => <WarRecords />,
  announcements: () => <Announcements />,
  theme: () => <Theme />,
  audit: () => <AuditLog />,
};

export default function Admin() {
  const { section } = useParams();
  const { can } = useSession();

  const available = ADMIN_SECTIONS.filter((s) => can(s.permission));

  if (available.length === 0) {
    return <div className="empty">You don’t have access to any admin tools.</div>;
  }

  // No section chosen → land on the first one the viewer can use.
  if (!section) return <Navigate to={`/admin/${available[0]!.key}`} replace />;

  // Unknown section, or one they can't access → bounce to the first they can.
  const active = available.find((s) => s.key === section);
  if (!active) return <Navigate to={`/admin/${available[0]!.key}`} replace />;

  return (
    <>
      <UsageBar />
      <div className="admin-shell">
        <nav className="admin-nav" aria-label="Admin sections">
        <div className="admin-nav-title">Admin</div>
          {available.map((s) => (
            <NavLink
              key={s.key}
              to={`/admin/${s.key}`}
              className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-content">{SECTION_RENDERERS[active.key]?.()}</div>
      </div>
    </>
  );
}
