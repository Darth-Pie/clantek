/**
 * Which optional game modules are enabled, so UI (e.g. the hangar on a profile)
 * can show/hide itself. Fetched once and cached process-wide — the flags rarely
 * change and every profile page would otherwise re-request them.
 */

import { useEffect, useState } from 'react';
import { api } from './api';

export interface ModuleFlags {
  starcitizen: boolean;
}

const DEFAULT: ModuleFlags = { starcitizen: false };

let cache: ModuleFlags | null = null;
let inflight: Promise<ModuleFlags> | null = null;

function fetchModules(): Promise<ModuleFlags> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api
      .get<{ modules: ModuleFlags }>('/settings/modules')
      .then((r) => (cache = r.modules))
      .catch(() => DEFAULT);
  }
  return inflight;
}

export function useModules(): ModuleFlags {
  const [flags, setFlags] = useState<ModuleFlags>(cache ?? DEFAULT);
  useEffect(() => {
    let live = true;
    void fetchModules().then((v) => live && setFlags(v));
    return () => {
      live = false;
    };
  }, []);
  return flags;
}

/** Drop the cache after an admin toggles modules, so the next read re-fetches. */
export function clearModulesCache() {
  cache = null;
  inflight = null;
}
