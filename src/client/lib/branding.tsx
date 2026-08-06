/**
 * Site branding — the uploaded header logo and how big it sits, stored under the
 * public `site` settings key. Mirrors ThemeProvider: it loads once on boot (so
 * the logo is present before anyone signs in, on the login screen too), exposes
 * a live `preview` for the admin's size slider, and a `save` that persists.
 *
 * `logoSize` is the logo's *expanded* height in px (its size at the top of the
 * page, overhanging the bar). When the page is scrolled the header shrinks it to
 * a fixed collapsed height that fits inside the bar — that part is pure CSS.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Branding {
  logoUrl: string;
  logoSize: number;
  /** Uploaded browser-tab icon (favicon). Blank falls back to the default icon. */
  faviconUrl: string;
}

export const DEFAULT_BRANDING: Branding = { logoUrl: '', logoSize: 88, faviconUrl: '' };

interface BrandingValue {
  branding: Branding;
  /** Applies immediately (live header preview) without persisting. */
  preview: (next: Branding) => void;
  save: (next: Branding) => Promise<void>;
}

const BrandingContext = createContext<BrandingValue | null>(null);

function coerce(raw: Partial<Branding> | undefined): Branding {
  const size = Math.round(Number(raw?.logoSize));
  return {
    logoUrl: typeof raw?.logoUrl === 'string' ? raw.logoUrl : '',
    logoSize: Number.isFinite(size) ? Math.min(200, Math.max(40, size)) : DEFAULT_BRANDING.logoSize,
    faviconUrl: typeof raw?.faviconUrl === 'string' ? raw.faviconUrl : '',
  };
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    api
      .get<{ site: Partial<Branding> }>('/settings/site')
      .then(({ site }) => setBranding(coerce(site)))
      .catch(() => {
        /* Not configured yet — defaults (no logo) are fine. */
      });
  }, []);

  // Keep the live tab icon in sync with the current (previewed or saved) favicon,
  // so an admin sees the change at once and SPA navigation keeps the right icon.
  // A blank value restores the default /icon.svg baked into index.html.
  useEffect(() => {
    const href = branding.faviconUrl || '/icon.svg';
    for (const rel of ['icon', 'apple-touch-icon']) {
      let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
      // Let the browser sniff the format of an uploaded icon.
      if (branding.faviconUrl) link.removeAttribute('type');
    }
  }, [branding.faviconUrl]);

  const preview = useCallback((next: Branding) => setBranding(coerce(next)), []);

  const save = useCallback(async (next: Branding) => {
    const clean = coerce(next);
    const { site } = await api.put<{ site: Branding }>('/settings/site', { site: clean });
    setBranding(coerce(site ?? clean));
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, preview, save }}>{children}</BrandingContext.Provider>
  );
}

export function useBranding(): BrandingValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>');
  return ctx;
}
