/**
 * Renders a stored PageLayout: a stack of rows, each a responsive 12-unit grid
 * of columns, each column an ordered list of modules. Columns collapse to a
 * single readable stack on narrow screens (see .page-grid in styles.css). The
 * same component renders the live page and the editor preview, so what an admin
 * arranges is exactly what members see.
 *
 * A module may carry a `visibleTo` permission; on the live page it is skipped
 * for viewers who lack it. In the editor preview (`showHidden`) those modules
 * still render, tagged with a badge, so the admin can see and manage them.
 */

import type { CSSProperties } from 'react';
import type { PageLayout } from '../../shared/layout';
import type { Permission } from '../../shared/permissions';
import { useSession } from '../lib/session';
import { PERMISSIONS } from '../../shared/permissions';
import { MODULE_RENDERERS } from './modules';

export default function PageRenderer({
  layout,
  showHidden = false,
}: {
  layout: PageLayout;
  showHidden?: boolean;
}) {
  const { can } = useSession();

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

                const gated = m.visibleTo ? !can(m.visibleTo as Permission) : false;
                if (gated && !showHidden) return null;

                const node = <Renderer config={m.config} />;
                if (gated && showHidden) {
                  const label = PERMISSIONS[m.visibleTo as Permission] ?? m.visibleTo;
                  return (
                    <div className="module-gated" key={m.id}>
                      <span className="module-gated-badge" title={`Only visible to: ${label}`}>
                        🔒 {label}
                      </span>
                      {node}
                    </div>
                  );
                }
                return <div key={m.id}>{node}</div>;
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
