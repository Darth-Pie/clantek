/**
 * SigilLoader — a loading indicator branded with the org's sigil (a gently
 * pulsing emblem over the label). Falls back to the plain text loader when no
 * site sigil is enabled or it hasn't loaded yet, so it's a safe drop-in
 * replacement for `<div className="loading">Loading…</div>` anywhere.
 */

import { useSigil } from '../lib/sigil';
import SigilEmblem from './SigilEmblem';

export default function SigilLoader({ label = 'Loading…' }: { label?: string }) {
  const { sigil, loaded } = useSigil();
  if (!loaded || !sigil.enabled) return <div className="loading">{label}</div>;
  return (
    <div className="sigil-loader" role="status" aria-live="polite">
      <div className="sigil-loader-mark">
        <SigilEmblem />
      </div>
      <span className="loading-label">{label}</span>
    </div>
  );
}
