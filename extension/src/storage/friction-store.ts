/**
 * Local storage for the friction intervention (P9).
 *
 * Key (from ./keys.ts):
 * - `friction:state` — grace periods and short-lived bookkeeping for the current session. Holds
 *   site names, tab ids and times only — never a URL.
 *
 * The counts (shown / continued / turned back) are saved on the session record itself.
 */
import type { FrictionState } from '../interventions/friction';
import type { KeyValueStore } from './activity-store';
import { STORAGE_KEYS } from './keys';

export const FRICTION_STATE_KEY = STORAGE_KEYS.frictionState;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function tabSite(value: unknown, timeField: 'at' | 'until') {
  const v = value as Record<string, unknown> | null;
  if (typeof v !== 'object' || v === null) return null;
  if (!isNum(v.tabId) || typeof v.site !== 'string' || !isNum(v[timeField])) return null;
  return { tabId: v.tabId, site: v.site, time: v[timeField] };
}

/** The stored state, or null if it is missing or broken. */
export function asFrictionState(value: unknown): FrictionState | null {
  const v = value as Record<string, unknown> | null;
  if (typeof v !== 'object' || v === null || typeof v.sessionId !== 'string') return null;
  const grace: Record<string, number> = {};
  if (typeof v.grace === 'object' && v.grace !== null) {
    for (const [site, until] of Object.entries(v.grace)) if (isNum(until)) grace[site] = until;
  }
  const last = tabSite(v.lastRedirect, 'at');
  const back = tabSite(v.back, 'until');
  return {
    sessionId: v.sessionId,
    grace,
    lastRedirect: last && { tabId: last.tabId, site: last.site, at: last.time },
    back: back && { tabId: back.tabId, site: back.site, until: back.time },
  };
}

export async function loadFrictionState(store: KeyValueStore): Promise<FrictionState | null> {
  const { [FRICTION_STATE_KEY]: saved } = await store.get([FRICTION_STATE_KEY]);
  return asFrictionState(saved);
}
