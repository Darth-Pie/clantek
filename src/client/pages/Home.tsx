/**
 * The front page. Rather than hard-coding a layout, it loads the admin-arranged
 * 'home' layout (falling back to the built-in default) and renders it through
 * the module system, so what appears here is whatever modules an admin has
 * arranged in the Pages editor.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import PageRenderer from '../components/PageRenderer';
import { defaultLayout, sanitizeLayout, type PageLayout } from '../../shared/layout';

export default function Home() {
  const [layout, setLayout] = useState<PageLayout | null>(null);

  useEffect(() => {
    api
      .get<{ layout: unknown }>('/pages/home')
      .then(({ layout }) => setLayout(sanitizeLayout(layout)))
      .catch(() => setLayout(defaultLayout('home')));
  }, []);

  if (!layout) return <div className="loading">Loading…</div>;
  return <PageRenderer layout={layout} />;
}
