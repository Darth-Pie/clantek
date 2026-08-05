/**
 * Renders a stored PageLayout: a stack of rows, each a responsive 12-unit grid
 * of columns, each column an ordered list of modules. Columns collapse to a
 * single readable stack on narrow screens (see .page-grid in styles.css). The
 * same component renders the live page and the editor preview, so what an admin
 * arranges is exactly what members see.
 *
 * A module may carry a `visibleToRole` gate; on the live page it is skipped for
 * viewers who don't hold that role (god bypasses). In the editor preview
 * (`showHidden`) those modules still render, tagged with a badge, so the admin
 * can see and manage them — pass `roles` there so the badge can name the role.
 */

import type { CSSProperties } from 'react';
import type { PageLayout } from '../../shared/layout';
import { useSession } from '../lib/session';
import { MODULE_RENDERERS } from './modules';

export default function PageRenderer({
  layout,
  showHidden = false,
  roles,
}: {
  layout: PageLayout;
  showHidden?: boolean;
  /** All roles, by id → name; only needed to label gated modules in the preview. */
  roles?: { id: number; name: string }[];
}) {
  const { viewer } = useSession();

  const canSeeRole = (roleId: number): boolean =>
    !!viewer && (viewer.isGod || viewer.roles.some((r) => r.id === roleId));
  const roleName = (roleId: number): string =>
    roles?.find((r) => r.id === roleId)?.name ?? 'Restricted';

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

                const gated = m.visibleToRole != null ? !canSeeRole(m.visibleToRole) : false;
                if (gated && !showHidden) return null;

                const node = <Renderer config={m.config} />;
                if (gated && showHidden) {
                  const label = roleName(m.visibleToRole!);
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
