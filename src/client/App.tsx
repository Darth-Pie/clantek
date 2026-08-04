import type { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session';
import type { Permission } from '../shared/permissions';
import AccountMenu from './components/AccountMenu';
import Login from './pages/Login';
import MemberDetail from './pages/MemberDetail';
import Admin from './pages/Admin';
import Roster from './pages/Roster';

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

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">{siteName}</div>

        {viewer && (
          <nav className="nav">
            <NavLink to="/">Roster</NavLink>
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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Roster />
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
      </main>
    </div>
  );
}
