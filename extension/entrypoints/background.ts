import { browser } from 'wxt/browser';
import { localStore, readActiveHostname, readContext } from '@/src/background/browser-adapter';
import {
  PAUSED_KEY,
  appendSegments,
  isTrackingPaused,
  loadTrackerState,
  saveTrackerState,
} from '@/src/storage/activity-store';
import {
  HEARTBEAT_MINUTES,
  IDLE_THRESHOLD_SECONDS,
  step,
  type IdleState,
  type TrackerEvent,
} from '@/src/tracker/tracker';

const HEARTBEAT_ALARM = 'studylens-heartbeat';

/**
 * Activity tracking (P2). This script can be suspended at any time, so nothing lives in memory:
 * every event loads the tracker state from storage, steps the pure tracker, and saves it back.
 * Events are processed one at a time, in order, through `queue`.
 */
export default defineBackground(() => {
  let queue: Promise<void> = Promise.resolve();

  /** Stamp the time now, then process in order. `makeEvent` may read browser state. */
  function dispatch(makeEvent: () => TrackerEvent | Promise<TrackerEvent>): void {
    const now = Date.now();
    queue = queue
      .then(async () => {
        const event = await makeEvent();
        const before = await loadTrackerState(localStore);
        const { state, segments } = step(before, event, now);
        await appendSegments(localStore, segments);
        await saveTrackerState(localStore, state);
      })
      .catch((err: unknown) => console.error('[StudyLens] tracking error', err));
  }

  const sync = () =>
    dispatch(async () => ({
      type: 'sync',
      context: await readContext(IDLE_THRESHOLD_SECONDS, await isTrackingPaused(localStore)),
    }));

  // Listeners must be registered synchronously at the top level so a suspended background
  // script is woken up for them.
  browser.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

  browser.tabs.onActivated.addListener(() =>
    dispatch(async () => ({ type: 'tab', hostname: await readActiveHostname() })),
  );

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!changeInfo.url || !tab.active) return;
    // Re-read the active tab of the focused window: a navigation in a background window
    // must not change what we track.
    dispatch(async () => ({ type: 'tab', hostname: await readActiveHostname() }));
  });

  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      dispatch(() => ({ type: 'focus', focused: false }));
    } else {
      sync();
    }
  });

  browser.idle.onStateChanged.addListener((newState) =>
    dispatch(() => ({ type: 'idle', state: newState as IdleState })),
  );

  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[PAUSED_KEY];
    if (area !== 'local' || !change) return;
    dispatch(() => ({ type: 'paused', paused: change.newValue === true }));
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    // The heartbeat re-reads the full browser state, which also repairs any missed event.
    if (alarm.name === HEARTBEAT_ALARM) sync();
  });

  // Make sure the heartbeat exists (alarms can be lost across browser restarts/updates).
  void browser.alarms.get(HEARTBEAT_ALARM).then((existing) => {
    if (!existing) {
      void browser.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
    }
  });

  // Every wake-up: close a stale segment (if any) and pick up the current state.
  sync();
});
