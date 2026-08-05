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
import { sanitizeHtml, excerptFromHtml } from '../lib/richtext';
import { memberName } from '../../shared/names';
import { memberAvatar } from '../../shared/avatar';
import type { ModuleType } from '../../shared/layout';

type Config = Record<string, unknown>;

const str = (c: Config, k: string, d = ''): string => (typeof c[k] === 'string' ? (c[k] as string) : d);
const num = (c: Config, k: string, d: number): number => {
  const n = Number(c[k]);
  return Number.isFinite(n) ? n : d;
};

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

/* ------------------------------------------------------------------ *
 * Registry — the single map the renderer and editor read.
 * ------------------------------------------------------------------ */

export const MODULE_RENDERERS: Record<ModuleType, (props: { config: Config }) => ReactNode> = {
  heading: HeadingModule,
  text: TextModule,
  news: NewsModule,
  roster: RosterModule,
  events: EventsModule,
};
