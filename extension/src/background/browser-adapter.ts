/**
 * Thin wrappers around browser APIs for activity tracking. Kept tiny on purpose: all decisions
 * live in the pure tracker (src/tracker/tracker.ts).
 */
import { browser, type Browser } from 'wxt/browser';
import type { FullStore } from '../storage/activity-store';
import { trackableHostname } from '../tracker/hostname';
import type { TabAction } from '../interventions/friction-controller';
import type { SessionEffects } from '../sessions/session-controller';
import type { IdleState, TrackerContext } from '../tracker/tracker';

export const localStore: FullStore = {
  get: (keys) => browser.storage.local.get(keys),
  set: (items) => browser.storage.local.set(items),
  getAll: () => browser.storage.local.get(null),
  remove: (keys) => browser.storage.local.remove(keys),
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
  // E2E test build only: the OS idle state reflects real keyboard/mouse input on the whole
  // machine, which automated tests (and CI runners) don't produce. Idle rules are unit-tested.
  if (__STUDYLENS_E2E__) return 'active';
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

/** The friction countdown page (P9). */
export function frictionPageUrl(): string {
  return browser.runtime.getURL('/friction.html');
}

/**
 * Carries out a friction decision on a tab. Only the browser does anything with the URL here;
 * it is never logged or stored.
 */
export async function applyTabAction(tabId: number, action: TabAction): Promise<void> {
  if (action.type === 'redirect') {
    await browser.tabs.update(tabId, { url: action.url });
  } else if (action.type === 'go-back') {
    try {
      await browser.tabs.goBack(tabId);
    } catch {
      // Nothing to go back to: show the neutral "back to studying" page instead.
      await browser.tabs.update(tabId, { url: action.fallbackUrl });
    }
  }
}

export const SESSION_END_ALARM = 'studylens-session-end';
export const SESSION_TICK_ALARM = 'studylens-session-tick';
const MINUTE_MS = 60_000;

/**
 * Alarms and toolbar badge for focus sessions. The badge shows the minutes left, so no
 * notifications permission is needed.
 */
export const sessionEffects: SessionEffects = {
  async scheduleAlarms(session) {
    const now = Date.now();
    const left = session.plannedEnd - now;
    // Tick exactly when the rounded-up minutes on the badge change.
    const nextTick = now + (left % MINUTE_MS || MINUTE_MS);
    await browser.alarms.create(SESSION_END_ALARM, { when: session.plannedEnd });
    await browser.alarms.create(SESSION_TICK_ALARM, { when: nextTick, periodInMinutes: 1 });
  },
  async clearAlarms() {
    await Promise.all([
      browser.alarms.clear(SESSION_END_ALARM),
      browser.alarms.clear(SESSION_TICK_ALARM),
    ]);
  },
  async setBadge(text) {
    if (text) await browser.action.setBadgeBackgroundColor({ color: '#1a7f37' });
    await browser.action.setBadgeText({ text });
  },
};
