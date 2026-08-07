import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { can, type Permission, type Viewer } from '../../shared/permissions';

interface SessionValue {
  viewer: Viewer | null;
  siteName: string;
  loading: boolean;
  /** Same check the server enforces — used to hide UI, never to secure it. */
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [siteName, setSiteName] = useState('mustr');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await api.get<{ viewer: Viewer | null; siteName: string }>('/me');
      setViewer(data.viewer);
      setSiteName(data.siteName);
    } catch {
      setViewer(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function logout() {
    await api.post('/auth/logout');
    setViewer(null);
  }

  return (
    <SessionContext.Provider
      value={{
        viewer,
        siteName,
        loading,
        can: (permission) => can(viewer, permission),
        refresh,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
