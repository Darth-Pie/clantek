import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session';
import { useBranding } from './lib/branding';
import type { Permission } from '../shared/permissions';
import { ADMIN_SECTIONS } from './lib/adminSections';
import AccountMenu from './components/AccountMenu';
import Login from './pages/Login';
import MemberDetail from './pages/MemberDetail';
import AccountSettings from './pages/AccountSettings';
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
  const { branding } = useBranding();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navPages, setNavPages] = useState<NavPage[]>([]);
  const [scrolled, setScrolled] = useState(false);
  // Logo aspect ratio (width/height), measured on load, so the header can
  // reserve exactly the collapsed logo's width and the nav never jumps.
  const [logoAspect, setLogoAspect] = useState(1);

  // Shrink the header (and its logo) once the page scrolls past the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  const hasLogo = !!branding.logoUrl;
  const collapsed = 38; // logo height (px) once docked inside the bar
  const cap = 460; // matches the logo's CSS max-width, so the reserved slot agrees
  const topbarStyle = {
    '--logo-expanded': `${branding.logoSize}px`,
    '--logo-collapsed': `${collapsed}px`,
    // Reserve the logo's full (expanded) footprint so it never covers the menu;
    // --logo-fp-min is the docked footprint used on mobile.
    '--logo-fp': `${Math.min(Math.round(branding.logoSize * logoAspect), cap)}px`,
    '--logo-fp-min': `${Math.round(collapsed * logoAspect)}px`,
  } as CSSProperties;

  return (
    <div className="app">
      <header
        className={`topbar${scrolled ? ' scrolled' : ''}${hasLogo ? ' has-logo' : ''}`}
        style={hasLogo ? topbarStyle : undefined}
      >
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
        <Link to="/" className="brand" aria-label={siteName}>
          {hasLogo ? (
            <img
              className="brand-logo"
              src={branding.logoUrl}
              alt={siteName}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalHeight > 0) setLogoAspect(img.naturalWidth / img.naturalHeight);
              }}
            />
          ) : (
            <span className="brand-name">{siteName}</span>
          )}
        </Link>

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
          <Route
            path="/account"
            element={
              <Protected>
                <AccountSettings />
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
