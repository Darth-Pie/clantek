import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { MorphIcon } from 'morphicons/react';
import { Menu, X } from 'lucide';
import { useSession } from './lib/session';
import { useBranding } from './lib/branding';
import type { Permission } from '../shared/permissions';
import AccountMenu from './components/AccountMenu';
import SiteNav from './components/SiteNav';
import type { NavItem } from '../shared/nav';
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

export default function App() {
  const { viewer, siteName, loading } = useSession();
  const { branding } = useBranding();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [scrolled, setScrolled] = useState(false);
  // Logo aspect ratio (width/height), measured on load, so the header can
  // reserve exactly the collapsed logo's width and the nav never jumps.
  const [logoAspect, setLogoAspect] = useState(1);

  // Keep the browser-tab title in sync with the configured site name (the served
  // HTML title is set server-side; this covers client-side navigation + updates).
  useEffect(() => {
    if (siteName) document.title = siteName;
  }, [siteName]);

  // Shrink the header (and its logo) once the page scrolls past the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The admin-arranged menu tree. Loaded once the viewer is known, and refreshed
  // live when the Navigation builder saves (`ct-nav-changed`) or a page is
  // created/deleted (`ct-pages-changed` — the server prunes deleted pages).
  useEffect(() => {
    if (!viewer) {
      setNavItems([]);
      return;
    }
    const loadNav = () =>
      api
        .get<{ nav: { items: NavItem[] } }>('/nav')
        .then((d) => setNavItems(d.nav.items))
        .catch(() => setNavItems([]));
    void loadNav();
    window.addEventListener('ct-nav-changed', loadNav);
    window.addEventListener('ct-pages-changed', loadNav);
    return () => {
      window.removeEventListener('ct-nav-changed', loadNav);
      window.removeEventListener('ct-pages-changed', loadNav);
    };
  }, [viewer]);

  if (loading) return <div className="loading">Loading…</div>;

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
            <MorphIcon icon={menuOpen ? X : Menu} size={22} spring="snappy" aria-hidden />
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
          <nav className={menuOpen ? 'nav open' : 'nav'}>
            <SiteNav items={navItems} onNavigate={() => setMenuOpen(false)} />
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
          {/* Leadership folded into the roster; keep the old path working. */}
          <Route path="/leadership" element={<Navigate to="/roster" replace />} />
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
          {/* One shell for every admin tool; the panel gates each item/tab.
              /admin/:item is a sidebar entry; /admin/:item/:tab picks a tool
              within a multi-tool item (e.g. Ranks & Roles). */}
          <Route
            path="/admin"
            element={
              <Protected>
                <Admin />
              </Protected>
            }
          />
          <Route
            path="/admin/:item"
            element={
              <Protected>
                <Admin />
              </Protected>
            }
          />
          <Route
            path="/admin/:item/:tab"
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
