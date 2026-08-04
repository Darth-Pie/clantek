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
import type { Permission } from '../../shared/permissions';
import UsageBar from '../components/UsageBar';
import NewsAdmin from './NewsAdmin';
import Ranks from './Ranks';
import Roles from './Roles';
import Medals from './Medals';
import Games from './Games';
import WarRecords from './WarRecords';
import Announcements from './Announcements';
import Theme from './Theme';
import AuditLog from './AuditLog';

export interface AdminSection {
  key: string;
  label: string;
  permission: Permission;
  render: () => ReactNode;
}

/**
 * The registry. Order here is the sidebar order. `permission` gates both the
 * sidebar link and direct navigation to /admin/<key>. Future sections (News,
 * Theme, Settings, Games, War records) slot in as one line each.
 */
export const ADMIN_SECTIONS: AdminSection[] = [
  { key: 'news', label: 'News', permission: 'news.create', render: () => <NewsAdmin /> },
  { key: 'ranks', label: 'Ranks', permission: 'ranks.manage', render: () => <Ranks /> },
  { key: 'roles', label: 'Roles', permission: 'roles.manage', render: () => <Roles /> },
  { key: 'medals', label: 'Medals', permission: 'medals.manage', render: () => <Medals /> },
  { key: 'games', label: 'Games', permission: 'games.manage', render: () => <Games /> },
  { key: 'warrecords', label: 'War Records', permission: 'warrecords.manage', render: () => <WarRecords /> },
  { key: 'announcements', label: 'Announcements', permission: 'settings.manage', render: () => <Announcements /> },
  { key: 'theme', label: 'Theme', permission: 'theme.manage', render: () => <Theme /> },
  { key: 'audit', label: 'Activity Log', permission: 'audit.view', render: () => <AuditLog /> },
];

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
        <div className="admin-content">{active.render()}</div>
      </div>
    </>
  );
}
