/**
 * Renders a stored PageLayout: a stack of rows, each a responsive 12-unit grid
 * of columns, each column an ordered list of modules. Columns collapse to a
 * single readable stack on narrow screens (see .page-grid in styles.css). The
 * same component renders the live page and the editor preview, so what an admin
 * arranges is exactly what members see.
 */

import type { CSSProperties } from 'react';
import type { PageLayout } from '../../shared/layout';
import { MODULE_RENDERERS } from './modules';

export default function PageRenderer({ layout }: { layout: PageLayout }) {
  if (!layout.rows.length) {
    return <p className="empty">This page has no content yet.</p>;
  }

  return (
    <div className="page-rows">
      {layout.rows.map((row) => (
        <div className="page-grid" key={row.id}>
          {row.columns.map((col) => (
            <div
              className="page-col"
              key={col.id}
              style={{ '--span': col.span } as CSSProperties}
            >
              {col.modules.map((m) => {
                const Renderer = MODULE_RENDERERS[m.type];
                if (!Renderer) return null;
                return <Renderer key={m.id} config={m.config} />;
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
