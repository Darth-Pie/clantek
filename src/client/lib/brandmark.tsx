/**
 * Brandmark provider — the org's animated boot-splash mark. Loads once on boot
 * (public, so the splash can play on the login screen too), mirrors
 * BrandingProvider. `preview` applies a draft live in the admin without saving;
 * `save` persists via settings.manage.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { DEFAULT_BRANDMARK, sanitizeBrandmark, type BrandmarkConfig } from '../../shared/brandmark';

interface BrandmarkValue {
  brandmark: BrandmarkConfig;
  loaded: boolean;
  preview: (next: BrandmarkConfig) => void;
  save: (next: BrandmarkConfig) => Promise<void>;
}

const Ctx = createContext<BrandmarkValue | null>(null);

export function BrandmarkProvider({ children }: { children: ReactNode }) {
  const [brandmark, setBrandmark] = useState<BrandmarkConfig>(DEFAULT_BRANDMARK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<{ brandmark: Partial<BrandmarkConfig> }>('/settings/brandmark')
      .then(({ brandmark: bm }) => setBrandmark(sanitizeBrandmark(bm)))
      .catch(() => {
        /* Not configured — defaults (disabled) are fine. */
      })
      .finally(() => setLoaded(true));
  }, []);

  const preview = useCallback((next: BrandmarkConfig) => setBrandmark(sanitizeBrandmark(next)), []);

  const save = useCallback(async (next: BrandmarkConfig) => {
    const clean = sanitizeBrandmark(next);
    const { brandmark: saved } = await api.put<{ brandmark: BrandmarkConfig }>('/settings/brandmark', {
      brandmark: clean,
    });
    setBrandmark(sanitizeBrandmark(saved ?? clean));
  }, []);

  return <Ctx.Provider value={{ brandmark, loaded, preview, save }}>{children}</Ctx.Provider>;
}

export function useBrandmark(): BrandmarkValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBrandmark must be used inside <BrandmarkProvider>');
  return ctx;
}
