/**
 * The gallery index — the scroll hero, then every album this viewer may open.
 *
 * The album list is already filtered server-side, so a members-only album isn't
 * greyed out here, it's simply absent. That's why an anonymous visitor can be
 * shown the page at all: whatever comes back is, by construction, theirs to see.
 *
 * The page itself needs no permission. If the module is off the route 404s, and
 * the nav link that leads here is hidden by the same flag.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useModules, useGalleryConfig } from '../lib/modules';
import GalleryHero from '../components/GalleryHero';
import { audienceLabel, type GalleryAlbum } from '../../shared/gallery';

export default function Gallery() {
  const { viewer } = useSession();
  const modules = useModules();
  const config = useGalleryConfig();
  const [albums, setAlbums] = useState<GalleryAlbum[] | null>(null);

  useEffect(() => {
    let live = true;
    api
      .get<{ albums: GalleryAlbum[] }>('/gallery/albums')
      .then((r) => live && setAlbums(r.albums))
      .catch(() => live && setAlbums([]));
    return () => {
      live = false;
    };
  }, []);

  if (!modules.gallery) return <div className="empty">Not found.</div>;

  const title = config.heroTitle || 'Gallery';
  const tagline = config.heroTagline;

  return (
    <div className="gallery-page">
      {config.heroEnabled ? (
        <GalleryHero title={title} tagline={tagline} />
      ) : (
        <header className="gallery-plain-head">
          <h1>{title}</h1>
          {tagline && <p className="muted">{tagline}</p>}
        </header>
      )}

      <section className="gallery-albums">
        {albums === null ? (
          <div className="loading">Loading…</div>
        ) : albums.length === 0 ? (
          <div className="empty">
            <p>No albums yet.</p>
            {!viewer && (
              <p className="muted small">
                Some albums are only shown to members — <Link to="/login">sign in</Link> if you have
                an account.
              </p>
            )}
          </div>
        ) : (
          <ul className="gallery-album-grid">
            {albums.map((a) => (
              <li key={a.id} className="gallery-album-card">
                <Link to={`/gallery/${a.slug}`}>
                  <span className="gallery-album-cover">
                    {a.coverUrl ? (
                      <img src={a.coverUrl} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="gallery-album-empty" aria-hidden />
                    )}
                  </span>
                  <span className="gallery-album-meta">
                    <strong>{a.title}</strong>
                    {a.description && <span className="muted small">{a.description}</span>}
                    <span className="muted small">
                      {a.itemCount} {a.itemCount === 1 ? 'item' : 'items'}
                      {/* Only worth badging when it ISN'T public — otherwise every
                          card carries a label that says nothing. */}
                      {a.audience !== 'public' && (
                        <>
                          {' · '}
                          <span className="gallery-audience">{audienceLabel(a)}</span>
                        </>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
