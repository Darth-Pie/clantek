/**
 * The admin panel shell.
 *
 * A grouped left sidebar (Content / People / Settings) of items; each item opens
 * in the content area and may host several tools as tabs (e.g. Ranks & Roles).
 * Everything is gated by permission via the tree in lib/adminSections.ts, so the
 * sidebar only shows what the viewer can touch. Under each group we also surface
 * a few recently-viewed records for quick return.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Link, useParams } from 'react-router-dom';
import { useSession } from '../lib/session';
import { visibleAdminGroups } from '../lib/adminSections';
import { getRecent } from '../lib/recent';
import UsageBar from '../components/UsageBar';
import NewsAdmin from './NewsAdmin';
import Ranks from './Ranks';
import Roles from './Roles';
import Medals from './Medals';
import Games from './Games';
import WarRecords from './WarRecords';
import Announcements from './Announcements';
import Theme from './Theme';
import BrandingAdmin from './BrandingAdmin';
import PagesAdmin from './PagesAdmin';
import OrgChartDesigner from './OrgChartDesigner';
import AuditLog from './AuditLog';

/** Tab key → its component. Every tab key in adminSections.ts needs an entry. */
const TAB_RENDERERS: Record<string, () => ReactNode> = {
  pages: () => <PagesAdmin />,
  news: () => <NewsAdmin />,
  ranks: () => <Ranks />,
  roles: () => <Roles />,
  medals: () => <Medals />,
  warrecords: () => <WarRecords />,
  games: () => <Games />,
  orgchart: () => <OrgChartDesigner />,
  announcements: () => <Announcements />,
  theme: () => <Theme />,
  branding: () => <BrandingAdmin />,
  audit: () => <AuditLog />,
};

export default function Admin() {
  const { item: itemParam, tab: tabParam } = useParams();
  const { can } = useSession();

  // Re-read recently-viewed when it changes (a tool recorded one, another tab wrote it).
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('ct-recent', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('ct-recent', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const groups = visibleAdminGroups(can);
  if (groups.length === 0) {
    return <div className="empty">You don’t have access to any admin tools.</div>;
  }

  const items = groups.flatMap((g) => g.items);
  const activeItem = items.find((i) => i.key === itemParam);

  // No item, or one they can't reach → land on the first available item.
  if (!activeItem) return <Navigate to={`/admin/${items[0]!.key}`} replace />;

  const tabs = activeItem.tabs; // already filtered to allowed
  const activeTab = tabs.find((t) => t.key === tabParam) ?? tabs[0]!;

  return (
    <>
      <UsageBar />
      <div className="admin-shell">
        <nav className="admin-nav" aria-label="Admin sections">
          {groups.map((g) => {
            const recent = getRecent(g.key);
            return (
              <div className="admin-nav-group" key={g.key}>
                <div className="admin-nav-title">{g.label}</div>
                {g.items.map((i) => (
                  <NavLink
                    key={i.key}
                    to={`/admin/${i.key}`}
                    className={i.key === activeItem.key ? 'admin-nav-link active' : 'admin-nav-link'}
                  >
                    {i.label}
                  </NavLink>
                ))}
                {recent.length > 0 && (
                  <div className="admin-recent">
                    <div className="admin-recent-title">Recently viewed</div>
                    {recent.map((r) => (
                      <Link key={r.to} to={r.to} className="admin-recent-link" title={r.label}>
                        {r.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="admin-content">
          {tabs.length > 1 && (
            <div className="admin-tabs" role="tablist" aria-label={activeItem.label}>
              {tabs.map((t) => (
                <NavLink
                  key={t.key}
                  to={`/admin/${activeItem.key}/${t.key}`}
                  className={t.key === activeTab.key ? 'admin-tab active' : 'admin-tab'}
                  role="tab"
                  aria-selected={t.key === activeTab.key}
                >
                  {t.label}
                </NavLink>
              ))}
            </div>
          )}
          {TAB_RENDERERS[activeTab.key]?.()}
        </div>
      </div>
    </>
  );
}
