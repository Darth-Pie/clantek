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

/* ------------------------------------------------------------------ *
 * Star Citizen module config — org SID + the per-feature kill switches. Cached
 * the same way; profiles read it to hide a killed feature without a reload.
 * ------------------------------------------------------------------ */

export interface ScConfig {
  orgSid: string;
  hangarEnabled: boolean;
  verifyEnabled: boolean;
  ccuEnabled: boolean;
}

// Defaults are ON so the UI shows while loading; the server is the authority
// (killed routes 404 regardless of what the client briefly renders).
const SC_DEFAULT: ScConfig = { orgSid: '', hangarEnabled: true, verifyEnabled: true, ccuEnabled: true };

let scCache: ScConfig | null = null;
let scInflight: Promise<ScConfig> | null = null;

function fetchScConfig(): Promise<ScConfig> {
  if (scCache) return Promise.resolve(scCache);
  if (!scInflight) {
    scInflight = api
      .get<{ sc: ScConfig }>('/settings/sc')
      .then((r) => (scCache = r.sc))
      .catch(() => SC_DEFAULT);
  }
  return scInflight;
}

export function useScConfig(): ScConfig {
  const [cfg, setCfg] = useState<ScConfig>(scCache ?? SC_DEFAULT);
  useEffect(() => {
    let live = true;
    void fetchScConfig().then((v) => live && setCfg(v));
    return () => {
      live = false;
    };
  }, []);
  return cfg;
}

/** Drop the SC-config cache after an admin edits it (e.g. flips a kill switch). */
export function clearScConfigCache() {
  scCache = null;
  scInflight = null;
}
