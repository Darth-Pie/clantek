/**
 * Boot splash — plays the org's animated mark once per browser session over a
 * full-screen scrim, then fades away. Off unless an admin enables it. Click
 * anywhere to skip.
 *
 * Two sources, in priority order: a full Sigil Forge recipe (the newer studio),
 * and, failing that, the older image-only Brandmark (a dedicated image or the
 * header logo). Whichever is enabled wins; the Forge sigil takes precedence.
 */

import { useEffect, useState } from 'react';
import { useBrandmark } from '../lib/brandmark';
import { useSigil } from '../lib/sigil';
import { useBranding } from '../lib/branding';
import SigilMark from './SigilMark';
import SigilStage from './SigilStage';

const SESSION_KEY = 'mustr:brandmark:shown';

export default function BrandmarkSplash() {
  const { brandmark, loaded: bmLoaded } = useBrandmark();
  const { sigil, loaded: sigilLoaded } = useSigil();
  const { branding } = useBranding();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'closing' | 'done'>('idle');

  const loaded = bmLoaded && sigilLoaded;
  const useSigilRecipe = sigil.enabled; // the Forge sigil wins when enabled
  const bmSrc = brandmark.imageUrl || branding.logoUrl || '';
  const active = useSigilRecipe || (brandmark.enabled && !!bmSrc);

  useEffect(() => {
    if (phase !== 'idle' || !loaded) return;
    if (!active) { setPhase('done'); return; }
    try { if (sessionStorage.getItem(SESSION_KEY)) { setPhase('done'); return; } } catch { /* ignore */ }
    setPhase('playing');
  }, [loaded, active, phase]);

  if (phase === 'idle' || phase === 'done') return null;

  const close = () => {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
    setPhase('closing');
    window.setTimeout(() => setPhase('done'), 650);
  };

  return (
    <div
      className={`brandmark-splash${phase === 'closing' ? ' closing' : ''}`}
      role="presentation"
      onClick={close}
    >
      {useSigilRecipe ? (
        <SigilStage
          recipe={sigil.recipe}
          className="splash-mark"
          onDone={() => window.setTimeout(close, 1100)}
        />
      ) : (
        <SigilMark
          src={bmSrc}
          archetype={brandmark.archetype}
          speed={brandmark.speed}
          density={brandmark.density}
          accent={brandmark.accent}
          className="splash-mark"
          onDone={() => window.setTimeout(close, 1100)}
        />
      )}
    </div>
  );
}
