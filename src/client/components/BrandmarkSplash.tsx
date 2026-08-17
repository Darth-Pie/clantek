/**
 * Boot splash — plays the org's animated brandmark once per browser session over
 * a full-screen scrim, then fades away. Off unless an admin enables it. Uses a
 * dedicated mark image, or the header logo as a fallback. Click anywhere to skip.
 */

import { useEffect, useState } from 'react';
import { useBrandmark } from '../lib/brandmark';
import { useBranding } from '../lib/branding';
import SigilMark from './SigilMark';

const SESSION_KEY = 'mustr:brandmark:shown';

export default function BrandmarkSplash() {
  const { brandmark, loaded } = useBrandmark();
  const { branding } = useBranding();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'closing' | 'done'>('idle');

  const src = brandmark.imageUrl || branding.logoUrl || '';

  useEffect(() => {
    if (phase !== 'idle' || !loaded) return;
    if (!brandmark.enabled || !src) { setPhase('done'); return; }
    try { if (sessionStorage.getItem(SESSION_KEY)) { setPhase('done'); return; } } catch { /* ignore */ }
    setPhase('playing');
  }, [loaded, brandmark.enabled, src, phase]);

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
      <SigilMark
        src={src}
        archetype={brandmark.archetype}
        speed={brandmark.speed}
        density={brandmark.density}
        accent={brandmark.accent}
        className="splash-mark"
        onDone={() => window.setTimeout(close, 1100)}
      />
    </div>
  );
}
