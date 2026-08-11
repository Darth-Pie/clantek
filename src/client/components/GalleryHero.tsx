/**
 * The gallery's scroll hero — a ring of sample images that spins outward and
 * fades as the reader scrolls down into the albums.
 *
 * Two deliberate choices:
 *
 * 1. It samples PUBLIC albums only. That's enforced server-side by /gallery/hero
 *    (see routes/gallery.ts), so the decorative header can never become the hole
 *    through which a members-only photo reaches a logged-out visitor.
 *
 * 2. Scroll progress is written straight to a CSS custom property on the root
 *    node, not into React state. A scroll handler that called setState would
 *    re-render the whole ring on every frame; this way React renders the tiles
 *    once and the browser animates them off one variable. Everything else is
 *    plain CSS in styles.css (.gallery-hero*).
 *
 * With no public images the hero renders nothing at all, so an install that
 * keeps every album private simply gets a normal page header.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

interface HeroImage {
  url: string;
  width: number;
  height: number;
  alt: string | null;
}

/** Tiles per ring, innermost first. Sized so a sparse gallery still looks arranged. */
const RINGS = [
  { count: 6, radius: 20 },
  { count: 12, radius: 34 },
];

export default function GalleryHero({ title, tagline }: { title: string; tagline: string }) {
  const [images, setImages] = useState<HeroImage[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api
      .get<{ images: HeroImage[] }>('/gallery/hero')
      .then((r) => live && setImages(r.images))
      .catch(() => live && setImages([]));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !images || images.length === 0) return;

    // Someone who asked for less motion gets the collage, held still.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    let frame = 0;
    const apply = () => {
      frame = 0;
      // Measured from the hero's own box, not window.scrollY: the hero sits
      // below the site header, and on a page where it isn't the first element
      // scrollY would already be non-zero before the hero had moved at all.
      const rect = root.getBoundingClientRect();
      const height = rect.height || 1;
      // 0 while the hero's top is still at or below the viewport top, reaching
      // 1 once it has scrolled its full height out of view.
      const progress = Math.min(1, Math.max(0, -rect.top / height));
      root.style.setProperty('--whirl', progress.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [images]);

  // Still loading, or nothing public to show — render no hero rather than an
  // empty one that pushes the albums down a screen for no reason.
  if (!images || images.length === 0) return null;

  // Lay the sample out over the rings, repeating it if there are few images so
  // the ring still closes instead of leaving a gap.
  const tiles: { image: HeroImage; angle: number; radius: number; depth: number }[] = [];
  let taken = 0;
  RINGS.forEach((ring, r) => {
    for (let i = 0; i < ring.count; i += 1) {
      const image = images[taken % images.length];
      if (!image) break;
      taken += 1;
      tiles.push({
        image,
        angle: (360 / ring.count) * i + r * 12,
        radius: ring.radius,
        // Outer tiles travel further and fade sooner, which reads as depth.
        depth: r + 1,
      });
    }
  });

  return (
    <div className="gallery-hero" ref={rootRef}>
      <div className="gallery-hero-ring" aria-hidden>
        {tiles.map((t, i) => (
          <div
            key={i}
            className="gallery-hero-tile"
            style={
              {
                '--angle': `${t.angle}deg`,
                // Deliberately NOT --radius: that's the theme's border-radius
                // token, and shadowing it here would square off every tile.
                '--ring': `${t.radius}vmin`,
                '--depth': t.depth,
                // Stagger the entrance so the ring assembles rather than snapping in.
                '--delay': `${(i % 6) * 60}ms`,
              } as React.CSSProperties
            }
          >
            <img
              src={t.image.url}
              alt=""
              width={t.image.width}
              height={t.image.height}
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>

      <div className="gallery-hero-copy">
        <h1>{title}</h1>
        {tagline && <p>{tagline}</p>}
        <span className="gallery-hero-scroll" aria-hidden>
          scroll
        </span>
      </div>
    </div>
  );
}
