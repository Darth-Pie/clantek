import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session';
import type { Permission } from '../shared/permissions';
import { ADMIN_SECTIONS } from './lib/adminSections';
import AccountMenu from './components/AccountMenu';
import Login from './pages/Login';
import MemberDetail from './pages/MemberDetail';
import Roster from './pages/Roster';
import Home from './pages/Home';
import CustomPage from './pages/CustomPage';
import News from './pages/News';
import NewsPost from './pages/NewsPost';
import Events from './pages/Events';
import { api } from './lib/api';

// The admin panel pulls in the WYSIWYG editor (TipTap/ProseMirror), which is
// large and admin-only — load it on demand so the feed and roster stay light.
const Admin = lazy(() => import('./pages/Admin'));

function Protected({ permission, children }: { permission?: Permission; children: ReactNode }) {
  const { viewer, loading, can } = useSession();
  if (loading) return <div className="loading">Loading…</div>;
  if (!viewer) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) {
    return <div className="empty">You don’t have access to this area.</div>;
  }
  return <>{children}</>;
}

interface NavPage {
  slug: string;
  title: string | null;
}

export default function App() {
  const { viewer, siteName, loading, can } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navPages, setNavPages] = useState<NavPage[]>([]);

  // Custom pages that opted into the top nav. Loaded once the viewer is known.
  useEffect(() => {
    if (!viewer) {
      setNavPages([]);
      return;
    }
    api
      .get<{ pages: NavPage[] }>('/pages/nav')
      .then((d) => setNavPages(d.pages))
      .catch(() => setNavPages([]));
  }, [viewer]);

  if (loading) return <div className="loading">Loading…</div>;

  // Surface an Admin entry in the primary nav (not just the account menu) for
  // anyone who can reach an admin tool, so the controls are prominent for
  // authorized users rather than buried.
  const showAdmin = !!viewer && ADMIN_SECTIONS.some((s) => can(s.permission));

  return (
    <div className="app">
      <header className="topbar">
        {viewer && (
          <button
            className="nav-toggle"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ☰
          </button>
        )}
        <div className="brand">{siteName}</div>

        {viewer && (
          <nav className={menuOpen ? 'nav open' : 'nav'} onClick={() => setMenuOpen(false)}>
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/news">News</NavLink>
            <NavLink to="/roster">Roster</NavLink>
            {can('events.view') && <NavLink to="/events">Events</NavLink>}
            {navPages.map((p) => (
              <NavLink key={p.slug} to={`/p/${p.slug}`}>
                {p.title ?? p.slug}
              </NavLink>
            ))}
            {showAdmin && (
              <NavLink to="/admin" className="nav-admin">
                Admin
              </NavLink>
            )}
          </nav>
        )}

        <div className="account">
          {viewer ? (
            <AccountMenu />
          ) : (
            <a className="discord-btn" href="/api/auth/login">
              Sign in with Discord
            </a>
          )}
        </div>
      </header>

      <main className="content">
        <Suspense fallback={<div className="loading">Loading…</div>}>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Home />
              </Protected>
            }
          />
          <Route
            path="/news"
            element={
              <Protected>
                <News />
              </Protected>
            }
          />
          <Route
            path="/news/:slug"
            element={
              <Protected>
                <NewsPost />
              </Protected>
            }
          />
          <Route
            path="/roster"
            element={
              <Protected>
                <Roster />
              </Protected>
            }
          />
          <Route
            path="/p/:slug"
            element={
              <Protected>
                <CustomPage />
              </Protected>
            }
          />
          <Route
            path="/events"
            element={
              <Protected permission="events.view">
                <Events />
              </Protected>
            }
          />
          <Route
            path="/members/:id"
            element={
              <Protected>
                <MemberDetail />
              </Protected>
            }
          />
          {/* One shell for every admin tool; the panel itself gates each section. */}
          <Route
            path="/admin"
            element={
              <Protected>
                <Admin />
              </Protected>
            }
          />
          <Route
            path="/admin/:section"
            element={
              <Protected>
                <Admin />
              </Protected>
            }
          />
            <Route path="*" element={<div className="empty">Not found.</div>} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
