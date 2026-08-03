import type { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session';
import type { Permission } from '../shared/permissions';
import Login from './pages/Login';
import Ranks from './pages/Ranks';
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
  const { viewer, siteName, loading, can, logout } = useSession();

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">{siteName}</div>

        {viewer && (
          <nav className="nav">
            <NavLink to="/">Roster</NavLink>
            {can('ranks.manage') && <NavLink to="/admin/ranks">Ranks</NavLink>}
          </nav>
        )}

        <div className="account">
          {viewer ? (
            <>
              <span className="who">
                {viewer.rank && <span className="rank-chip">{viewer.rank.name}</span>}
                {viewer.globalName ?? viewer.username}
                {viewer.isGod && <span className="god-chip" title="God status">★</span>}
              </span>
              <button onClick={() => void logout()}>Sign out</button>
            </>
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
            path="/admin/ranks"
            element={
              <Protected permission="ranks.manage">
                <Ranks />
              </Protected>
            }
          />
          <Route path="*" element={<div className="empty">Not found.</div>} />
        </Routes>
      </main>
    </div>
  );
}
