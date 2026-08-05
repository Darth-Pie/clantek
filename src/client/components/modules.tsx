/**
 * The module registry — one renderer per module type from shared/layout.ts.
 * Each module is self-contained: it fetches its own data and renders a compact
 * card suitable for sitting in a layout column. A module that can't load (no
 * permission, empty data) fails quietly rather than breaking the page.
 *
 * These are the *display* forms shown on a laid-out page (e.g. the home page);
 * the full-page routes (/roster, /events, …) remain the place to manage things.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { sanitizeHtml, sanitizePageHtml, excerptFromHtml } from '../lib/richtext';
import { memberName } from '../../shared/names';
import { memberAvatar } from '../../shared/avatar';
import { isAllowedEmbedSrc } from '../../shared/embeds';
import type { ModuleType } from '../../shared/layout';

type Config = Record<string, unknown>;

const str = (c: Config, k: string, d = ''): string => (typeof c[k] === 'string' ? (c[k] as string) : d);
const num = (c: Config, k: string, d: number): number => {
  const n = Number(c[k]);
  return Number.isFinite(n) ? n : d;
};

/** A link that stays inside the SPA for internal paths and opens externally otherwise. */
function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href.startsWith('/')) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** A small image gallery shared by the medals / war-records / games modules. */
function GalleryModule({
  title,
  endpoint,
  pick,
  limit,
  fallbackIcon,
}: {
  title: string;
  endpoint: string;
  pick: (data: unknown) => { key: string | number; name: string; image: string | null; note?: string }[];
  limit: number;
  fallbackIcon: string;
}) {
  const [items, setItems] = useState<ReturnType<typeof pick> | null>(null);

  useEffect(() => {
    api
      .get<unknown>(endpoint)
      .then((data) => setItems(pick(data)))
      .catch(() => setItems([]));
    // pick/endpoint are stable per module instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  if (items === null) return <ModuleCard title={title}><p className="muted">Loading…</p></ModuleCard>;

  return (
    <ModuleCard title={title}>
      {items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="module-gallery">
          {items.slice(0, limit).map((it) => (
            <li key={it.key} className="module-gallery-item" title={it.note ? `${it.name} — ${it.note}` : it.name}>
              {it.image ? (
                <img src={it.image} alt="" loading="lazy" />
              ) : (
                <span className="module-gallery-icon" aria-hidden>
                  {fallbackIcon}
                </span>
              )}
              <span className="module-gallery-name">{it.name}</span>
            </li>
          ))}
        </ul>
      )}
    </ModuleCard>
  );
}

/** Shared card chrome so every module reads as part of one system. */
function ModuleCard({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel module">
      {(title || action) && (
        <header className="panel-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Heading + rich text — static content, no fetching.
 * ------------------------------------------------------------------ */

function HeadingModule({ config }: { config: Config }) {
  const text = str(config, 'text', 'Heading');
  const level = num(config, 'level', 2);
  const Tag = (level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2') as 'h1' | 'h2' | 'h3';
  return <Tag className="module-heading">{text}</Tag>;
}

function TextModule({ config }: { config: Config }) {
  const html = sanitizeHtml(str(config, 'html'));
  return (
    <section className="panel module module-text">
      <div className="news-body" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}

/**
 * Hand-written HTML from a page author. Sanitized here at render time with the
 * wider page allow-list — this render-time pass is the authoritative backstop
 * (the stored html is never trusted), so even a hand-crafted API write can't
 * execute. See sanitizePageHtml for exactly what survives.
 */
function HtmlModule({ config }: { config: Config }) {
  const html = sanitizePageHtml(str(config, 'html'));
  if (!html.trim()) return null;
  return (
    <section className="module module-html">
      <div className="news-body page-html" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}

/**
 * A video embed. `config.src` is produced by resolveEmbed inside sanitizeLayout,
 * but we re-verify it here against the origin allow-list before emitting an
 * iframe — belt and suspenders. The frame is sandboxed and cross-origin, so the
 * provider's player runs boxed off from the page.
 */
function EmbedModule({ config }: { config: Config }) {
  const src = str(config, 'src');
  const title = str(config, 'title') || 'Embedded video';
  const ratio = str(config, 'ratio', '16:9') === '4:3' ? '4:3' : '16:9';

  if (!isAllowedEmbedSrc(src)) {
    return (
      <section className="panel module module-embed-empty">
        <p className="muted small">
          No video yet — add a YouTube, Twitch, Vimeo, or Streamable link in the editor.
        </p>
      </section>
    );
  }

  return (
    <div className="module module-embed" data-ratio={ratio}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Data modules
 * ------------------------------------------------------------------ */

interface NewsPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  pinned: boolean;
  publishedAt: number | null;
  author: string | null;
}

function NewsModule({ config }: { config: Config }) {
  const title = str(config, 'title', 'Latest News');
  const limit = num(config, 'limit', 5);
  const [posts, setPosts] = useState<NewsPost[] | null>(null);

  useEffect(() => {
    api
      .get<{ posts: NewsPost[] }>('/news')
      .then(({ posts }) => setPosts(posts))
      .catch(() => setPosts([]));
  }, []);

  if (posts === null) return <ModuleCard title={title}><p className="muted">Loading…</p></ModuleCard>;

  return (
    <ModuleCard
      title={title}
      action={
        <Link className="btn-link" to="/news">
          All news
        </Link>
      }
    >
      {posts.length === 0 ? (
        <p className="muted">Nothing has been posted yet.</p>
      ) : (
        <ul className="news-feed">
          {posts.slice(0, limit).map((p) => (
            <li key={p.id} className="news-item">
              <Link to={`/news/${p.slug}`} className="news-item-link">
                <div className="news-item-head">
                  {p.pinned && <span className="tag pin">📌 Pinned</span>}
                  <h3>{p.title}</h3>
                </div>
                <p className="news-excerpt">{p.excerpt || excerptFromHtml(p.body)}</p>
                <div className="muted small news-meta">
                  {p.author ?? 'Unknown'}
                  {p.publishedAt && <> · {new Date(p.publishedAt * 1000).toLocaleDateString()}</>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ModuleCard>
  );
}

interface RosterMember {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  displayName: string | null;
  avatar: string | null;
  profileImageUrl: string | null;
  rankName: string | null;
}

function RosterModule({ config }: { config: Config }) {
  const title = str(config, 'title', 'Roster');
  const limit = num(config, 'limit', 12);
  const [state, setState] = useState<{ members: RosterMember[]; total: number } | null>(null);

  useEffect(() => {
    api
      .get<{ members: RosterMember[]; total: number }>(`/members?limit=${limit}&offset=0`)
      .then(setState)
      .catch(() => setState({ members: [], total: 0 }));
  }, [limit]);

  if (state === null) return <ModuleCard title={title}><p className="muted">Loading…</p></ModuleCard>;

  return (
    <ModuleCard
      title={title}
      action={
        <Link className="btn-link" to="/roster">
          {state.total > state.members.length ? `All ${state.total}` : 'Full roster'}
        </Link>
      }
    >
      {state.members.length === 0 ? (
        <p className="muted">No members yet.</p>
      ) : (
        <ul className="roster-mini">
          {state.members.map((m) => (
            <li key={m.id}>
              <Link to={`/members/${m.id}`} className="roster-mini-item">
                <img className="avatar-sm" src={memberAvatar(m, 64)} alt="" loading="lazy" />
                <span className="roster-mini-name">{memberName(m)}</span>
                {m.rankName && <span className="muted small">{m.rankName}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ModuleCard>
  );
}

interface EventItem {
  id: number;
  title: string;
  startsAt: number;
  endsAt: number;
  location: string;
}

function EventsModule({ config }: { config: Config }) {
  const title = str(config, 'title', 'Upcoming Events');
  const limit = num(config, 'limit', 5);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api
      .get<{ events: EventItem[] }>('/events')
      .then(({ events }) => setEvents(events))
      .catch(() => {
        // Most commonly a 403 for a viewer without events.view — hide quietly.
        setDenied(true);
        setEvents([]);
      });
  }, []);

  if (denied) return null;
  if (events === null) return <ModuleCard title={title}><p className="muted">Loading…</p></ModuleCard>;

  const now = Math.floor(Date.now() / 1000);
  const upcoming = events.filter((e) => e.endsAt >= now).slice(0, limit);

  return (
    <ModuleCard
      title={title}
      action={
        <Link className="btn-link" to="/events">
          All events
        </Link>
      }
    >
      {upcoming.length === 0 ? (
        <p className="muted">Nothing scheduled.</p>
      ) : (
        <ul className="events-mini">
          {upcoming.map((e) => (
            <li key={e.id} className="events-mini-item">
              <div className="events-mini-date">
                <span className="events-mini-mon">
                  {new Date(e.startsAt * 1000).toLocaleString(undefined, { month: 'short' })}
                </span>
                <span className="events-mini-day">{new Date(e.startsAt * 1000).getDate()}</span>
              </div>
              <div className="events-mini-body">
                <div className="events-mini-title">{e.title}</div>
                <div className="muted small">
                  {new Date(e.startsAt * 1000).toLocaleString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {e.location ? ` · ${e.location}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ModuleCard>
  );
}

function ImageModule({ config }: { config: Config }) {
  const url = str(config, 'url');
  if (!url) return null;
  const href = str(config, 'href');
  const alt = str(config, 'alt');
  const caption = str(config, 'caption');
  const img = <img className="module-image-img" src={url} alt={alt} loading="lazy" />;
  return (
    <figure className="module module-image">
      {href ? <SmartLink href={href}>{img}</SmartLink> : img}
      {caption && <figcaption className="muted small module-image-caption">{caption}</figcaption>}
    </figure>
  );
}

function ButtonModule({ config }: { config: Config }) {
  const href = str(config, 'href');
  if (!href) return null;
  const label = str(config, 'label', 'Learn more');
  const primary = str(config, 'style', 'primary') === 'primary';
  return (
    <div className="module module-button">
      <SmartLink href={href} className={primary ? 'btn-cta primary' : 'btn-cta'}>
        {label}
      </SmartLink>
    </div>
  );
}

function DividerModule() {
  return <hr className="module module-divider" />;
}

function MedalsModule({ config }: { config: Config }) {
  return (
    <GalleryModule
      title={str(config, 'title', 'Medals')}
      endpoint="/medals"
      limit={num(config, 'limit', 12)}
      fallbackIcon="🎖️"
      pick={(d) =>
        ((d as { medals?: { id: number; name: string; imageUrl: string | null; awardCount?: number }[] }).medals ?? []).map(
          (m) => ({ key: m.id, name: m.name, image: m.imageUrl ?? null, note: m.awardCount ? `${m.awardCount} awarded` : undefined }),
        )
      }
    />
  );
}

function WarRecordsModule({ config }: { config: Config }) {
  return (
    <GalleryModule
      title={str(config, 'title', 'War Records')}
      endpoint="/warrecords"
      limit={num(config, 'limit', 12)}
      fallbackIcon="🏆"
      pick={(d) =>
        ((d as { warRecords?: { id: number; name: string; imageUrl: string | null; gameName?: string | null }[] }).warRecords ?? []).map(
          (w) => ({ key: w.id, name: w.name, image: w.imageUrl ?? null, note: w.gameName ?? undefined }),
        )
      }
    />
  );
}

function GamesModule({ config }: { config: Config }) {
  return (
    <GalleryModule
      title={str(config, 'title', 'Games We Play')}
      endpoint="/games"
      limit={num(config, 'limit', 12)}
      fallbackIcon="🎮"
      pick={(d) =>
        ((d as { games?: { id: number; name: string; iconUrl: string | null; active?: boolean }[] }).games ?? [])
          .filter((g) => g.active !== false)
          .map((g) => ({ key: g.id, name: g.name, image: g.iconUrl ?? null }))
      }
    />
  );
}

/* ------------------------------------------------------------------ *
 * Registry — the single map the renderer and editor read.
 * ------------------------------------------------------------------ */

export const MODULE_RENDERERS: Record<ModuleType, (props: { config: Config }) => ReactNode> = {
  heading: HeadingModule,
  text: TextModule,
  html: HtmlModule,
  image: ImageModule,
  button: ButtonModule,
  embed: EmbedModule,
  divider: DividerModule,
  news: NewsModule,
  roster: RosterModule,
  events: EventsModule,
  medals: MedalsModule,
  warrecords: WarRecordsModule,
  games: GamesModule,
};
