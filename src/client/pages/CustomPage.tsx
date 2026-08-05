/**
 * Renders an admin-created custom page at /p/:slug through the same module
 * system the home page uses. A slug with no stored page shows "not found".
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import PageRenderer from '../components/PageRenderer';
import { useRecordRecent } from '../lib/recent';
import { sanitizeLayout, type PageLayout } from '../../shared/layout';

export default function CustomPage() {
  const { slug } = useParams();
  const [state, setState] = useState<{ layout: PageLayout; exists: boolean; title: string } | null>(null);

  useEffect(() => {
    setState(null);
    api
      .get<{ layout: unknown; exists: boolean; title: string }>(`/pages/${slug}`)
      .then((d) => setState({ layout: sanitizeLayout(d.layout), exists: d.exists, title: d.title }))
      .catch(() => setState({ layout: { version: 1, rows: [] }, exists: false, title: '' }));
  }, [slug]);

  useRecordRecent(state?.exists ? { group: 'content', label: state.title || slug || 'Page', to: `/p/${slug}` } : null);

  if (!state) return <div className="loading">Loading…</div>;
  if (!state.exists) return <div className="empty">Page not found.</div>;

  return (
    <>
      {state.title && <h1 className="page-title">{state.title}</h1>}
      <PageRenderer layout={state.layout} />
    </>
  );
}
