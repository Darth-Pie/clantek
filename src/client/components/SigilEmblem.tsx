/**
 * SigilEmblem — the org's saved sigil rendered as a crisp, non-animated mark.
 * The brand-kit primitive: drop it into loaders, crests, empty states, headers.
 * Renders nothing unless a site sigil is enabled, so surfaces stay clean on
 * installs that haven't set one up. Sizing comes from the parent.
 */

import { useSigil } from '../lib/sigil';
import SigilStage from './SigilStage';

export default function SigilEmblem({ className }: { className?: string }) {
  const { sigil, loaded } = useSigil();
  if (!loaded || !sigil.enabled) return null;
  return <SigilStage recipe={sigil.recipe} static className={className} />;
}
