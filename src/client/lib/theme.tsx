/**
 * The modern replacement for the original `templates` and `header` tables.
 *
 * 2003: font face/size/color rows were concatenated into `<font>` tags and
 *       echoed inline on every page, alongside IE-only scrollbar colors.
 * Now:  the same idea, as CSS custom properties applied to :root. The admin
 *       edits tokens, every component reacts, and nothing renders raw HTML.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { DEFAULT_SKIN, SKIN_KEYS } from './skins';

export type ThemeTokens = Record<string, string>;

export const DEFAULT_THEME: ThemeTokens = {
  '--color-bg': '#0f1115',
  '--color-surface': '#171a21',
  '--color-border': '#262b36',
  '--color-text': '#e6e8ec',
  '--color-muted': '#9aa3b2',
  '--color-accent': '#c0392b',
  '--color-accent-text': '#ffffff',
  '--font-body': 'system-ui, sans-serif',
  '--font-display': 'system-ui, sans-serif',
  '--radius': '8px',
  // Header menu alignment: flex-start (left) | center | flex-end (right).
  '--nav-justify': 'flex-start',
  // Surface style ("skin") — mapped to a data-skin attribute below. See lib/skins.ts.
  '--skin': DEFAULT_SKIN,
};

interface ThemeValue {
  tokens: ThemeTokens;
  /** Applies immediately for live preview without persisting. */
  preview: (tokens: ThemeTokens) => void;
  save: (tokens: ThemeTokens) => Promise<void>;
  reset: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function apply(tokens: ThemeTokens) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    // Only set custom properties; a stray key can't inject arbitrary CSS.
    if (key.startsWith('--')) root.style.setProperty(key, value);
  }
  // Translate the surface-style token into a data-skin attribute the CSS keys
  // off. Only a known skin is honoured; classic (the default) sets nothing.
  const skin = (tokens['--skin'] ?? '').trim();
  if (skin && skin !== DEFAULT_SKIN && SKIN_KEYS.includes(skin)) root.setAttribute('data-skin', skin);
  else root.removeAttribute('data-skin');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<ThemeTokens>(DEFAULT_THEME);

  useEffect(() => {
    apply(DEFAULT_THEME);
    api
      .get<{ theme: ThemeTokens }>('/settings/theme')
      .then(({ theme }) => {
        const merged = { ...DEFAULT_THEME, ...theme };
        setTokens(merged);
        apply(merged);
      })
      .catch(() => {
        /* Not configured yet — defaults are already applied. */
      });
  }, []);

  const preview = useCallback((next: ThemeTokens) => {
    setTokens(next);
    apply(next);
  }, []);

  const save = useCallback(async (next: ThemeTokens) => {
    await api.put('/settings/theme', { theme: next });
    setTokens(next);
    apply(next);
  }, []);

  const reset = useCallback(() => {
    setTokens(DEFAULT_THEME);
    apply(DEFAULT_THEME);
  }, []);

  return (
    <ThemeContext.Provider value={{ tokens, preview, save, reset }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
