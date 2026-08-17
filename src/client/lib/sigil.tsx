/**
 * Site-sigil provider — the org's Sigil Forge identity. Loads once on boot
 * (public, so the boot splash can play it before anyone signs in), mirrors the
 * Brandmark provider. `save` persists via settings.manage.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { DEFAULT_SITE_SIGIL, sanitizeSiteSigil, type SiteSigil } from '../../shared/sigil';

interface SigilValue {
  sigil: SiteSigil;
  loaded: boolean;
  save: (next: SiteSigil) => Promise<void>;
}

const Ctx = createContext<SigilValue | null>(null);

export function SigilProvider({ children }: { children: ReactNode }) {
  const [sigil, setSigil] = useState<SiteSigil>(DEFAULT_SITE_SIGIL);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<{ sigil: Partial<SiteSigil> }>('/settings/sigil')
      .then(({ sigil: sg }) => setSigil(sanitizeSiteSigil(sg)))
      .catch(() => {
        /* Not configured — defaults (disabled) are fine. */
      })
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback(async (next: SiteSigil) => {
    const clean = sanitizeSiteSigil(next);
    const { sigil: saved } = await api.put<{ sigil: SiteSigil }>('/settings/sigil', { sigil: clean });
    setSigil(sanitizeSiteSigil(saved ?? clean));
  }, []);

  return <Ctx.Provider value={{ sigil, loaded, save }}>{children}</Ctx.Provider>;
}

export function useSigil(): SigilValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSigil must be used inside <SigilProvider>');
  return ctx;
}
