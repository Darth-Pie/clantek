/**
 * The front page. Rather than hard-coding a layout, it loads the admin-arranged
 * 'home' layout (falling back to the built-in default) and renders it through
 * the module system, so what appears here is whatever modules an admin has
 * arranged in the Pages editor.
 */

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import PageRenderer from '../components/PageRenderer';
import { defaultLayout, sanitizeLayout, type PageLayout } from '../../shared/layout';

export default function Home() {
  const { viewer, loading: sessionLoading } = useSession();
  const [state, setState] = useState<{ layout: PageLayout; isPublic: boolean } | null>(null);

  useEffect(() => {
    api
      .get<{ layout: unknown; isPublic?: boolean }>('/pages/home')
      .then(({ layout, isPublic }) => setState({ layout: sanitizeLayout(layout), isPublic: isPublic !== false }))
      .catch(() => setState({ layout: defaultLayout('home'), isPublic: true }));
  }, []);

  if (sessionLoading || !state) return <div className="loading">Loading…</div>;
  // A logged-out visitor may only see the home page when it's marked public.
  // (PageRenderer still hides members-only and role-only modules from them.)
  if (!viewer && !state.isPublic) return <Navigate to="/login" replace />;
  return <PageRenderer layout={state.layout} />;
}
