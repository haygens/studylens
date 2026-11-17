/**
 * Local storage for research interventions (P8). Settings only — nothing here leaves the device.
 *
 * Keys (from ./keys.ts):
 * - `interventions:enabled`     — feature flag. Missing = INTERVENTIONS_DEFAULT_ENABLED.
 * - `interventions:opted-out`   — `true` if the user turned research interventions off.
 * - `interventions:block`       — the conditions left in the current shuffled block.
 * - `interventions:notice-seen` — `true` once the popup has shown the one-time notice.
 */
import type { InterventionId } from '@studylens/shared';
import { asBlock, type InterventionSettings } from '../interventions/randomize';
import type { KeyValueStore } from './activity-store';
import { STORAGE_KEYS } from './keys';

/**
 * OFF until the friction (P9) and intention (P10) interventions exist, so no real session gets a
 * condition whose intervention isn't built yet. Flip to true when P10 ships. (E2E tests turn the
 * flag on by writing the storage key.)
 */
export const INTERVENTIONS_DEFAULT_ENABLED = false;

export const ENABLED_KEY = STORAGE_KEYS.interventionsEnabled;
export const OPTED_OUT_KEY = STORAGE_KEYS.interventionsOptedOut;
export const BLOCK_KEY = STORAGE_KEYS.interventionBlock;
export const NOTICE_SEEN_KEY = STORAGE_KEYS.interventionsNoticeSeen;

export async function loadInterventionSettings(
  store: KeyValueStore,
): Promise<InterventionSettings> {
  const stored = await store.get([ENABLED_KEY, OPTED_OUT_KEY]);
  const enabled = stored[ENABLED_KEY];
  return {
    enabled: typeof enabled === 'boolean' ? enabled : INTERVENTIONS_DEFAULT_ENABLED,
    optedOut: stored[OPTED_OUT_KEY] === true,
  };
}

export async function setInterventionsEnabled(
  store: KeyValueStore,
  enabled: boolean,
): Promise<void> {
  await store.set({ [ENABLED_KEY]: enabled });
}

export async function setOptedOut(store: KeyValueStore, optedOut: boolean): Promise<void> {
  await store.set({ [OPTED_OUT_KEY]: optedOut });
}

export async function loadBlock(store: KeyValueStore): Promise<InterventionId[]> {
  const { [BLOCK_KEY]: saved } = await store.get([BLOCK_KEY]);
  return asBlock(saved);
}

export interface NoticeState {
  enabled: boolean;
  optedOut: boolean;
  seen: boolean;
}

export async function loadNoticeState(store: KeyValueStore): Promise<NoticeState> {
  const [settings, stored] = await Promise.all([
    loadInterventionSettings(store),
    store.get([NOTICE_SEEN_KEY]),
  ]);
  return { ...settings, seen: stored[NOTICE_SEEN_KEY] === true };
}

/**
 * The popup shows the one-time notice only while the feature is on, the user hasn't seen it yet,
 * and hasn't already turned interventions off on the My Data page.
 */
export function shouldShowNotice(state: NoticeState): boolean {
  return state.enabled && !state.seen && !state.optedOut;
}

export async function markNoticeSeen(store: KeyValueStore): Promise<void> {
  await store.set({ [NOTICE_SEEN_KEY]: true });
}
