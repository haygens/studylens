/**
 * Thin wrappers around browser APIs for activity tracking. Kept tiny on purpose: all decisions
 * live in the pure tracker (src/tracker/tracker.ts).
 */
import { browser, type Browser } from 'wxt/browser';
import type { KeyValueStore } from '../storage/activity-store';
import { trackableHostname } from '../tracker/hostname';
import type { IdleState, TrackerContext } from '../tracker/tracker';

export const localStore: KeyValueStore = {
  get: (keys) => browser.storage.local.get(keys),
  set: (items) => browser.storage.local.set(items),
};

/** Hostname of a tab, or null if it must not be tracked (private window, non-http URL). */
export function hostnameOfTab(tab: Browser.tabs.Tab | undefined): string | null {
  if (!tab || tab.incognito) return null; // Privacy rule 4: never private windows.
  return trackableHostname(tab.url);
}

/** Hostname of the active tab in the last focused window. */
export async function readActiveHostname(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return hostnameOfTab(tab);
}

export async function readWindowFocused(): Promise<boolean> {
  try {
    const win = await browser.windows.getLastFocused();
    return win.focused && !win.incognito;
  } catch {
    return false; // No windows open.
  }
}

export async function readIdleState(thresholdSeconds: number): Promise<IdleState> {
  return (await browser.idle.queryState(thresholdSeconds)) as IdleState;
}

export async function readContext(
  thresholdSeconds: number,
  paused: boolean,
): Promise<TrackerContext> {
  const [hostname, windowFocused, idle] = await Promise.all([
    readActiveHostname(),
    readWindowFocused(),
    readIdleState(thresholdSeconds),
  ]);
  return { hostname, windowFocused, idle, paused };
}
