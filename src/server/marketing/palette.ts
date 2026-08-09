/**
 * The self-contained marketing pages (/about, /product) live outside the React
 * app, so they don't get the app's theme CSS variables for free. This loads the
 * operator's saved accent colour from the `theme` settings blob so those pages
 * track whatever accent is set in the admin (e.g. mustr.gg's purple) instead of
 * shipping a fixed blue. Accent-only on purpose: the marketing hero is a fixed
 * dark panel by design (it mirrors the home-page hero), so only the accent needs
 * to follow the theme.
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Env } from '../env';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** Fallback = mustr.gg's shipped purple (matches the logo), used only if the
 *  theme row is missing or unreadable. */
const DEFAULT_ACCENT = '#a56bf0';

/** The saved theme's `--color-accent`, sanitised to a bare hex colour. */
export async function loadThemeAccent(env: Env): Promise<string> {
  try {
    const dbi = drizzle(env.DB, { schema });
    const row = await dbi.query.settings.findFirst({ where: eq(schema.settings.key, 'theme') });
    const raw = (row?.value as Record<string, string> | undefined)?.['--color-accent'];
    if (typeof raw === 'string' && HEX.test(raw.trim())) return raw.trim();
  } catch {
    // no theme row yet, or DB hiccup — fall back below
  }
  return DEFAULT_ACCENT;
}
