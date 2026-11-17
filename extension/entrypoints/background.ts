import { browser, type Browser } from 'wxt/browser';
import {
  SESSION_END_ALARM,
  SESSION_TICK_ALARM,
  applyTabAction,
  frictionPageUrl,
  localStore,
  readActiveHostname,
  readContext,
  sessionEffects,
} from '@/src/background/browser-adapter';
import { E2E_BUILD_MARKER, testSecondsFrom } from '@/src/e2e/test-seconds';
import { cleanHostname } from '@/src/interventions/friction';
import {
  checkTab,
  recordFrictionChoice,
  type FrictionDeps,
} from '@/src/interventions/friction-controller';
import { cryptoRandomInt } from '@/src/interventions/randomize';
import { deleteEverything } from '@/src/my-data/delete-all';
import { isSessionMessage, type SessionMessage, type SessionReply } from '@/src/sessions/messages';
import {
  endSessionEarly,
  expireCheckIns,
  reconcileSession,
  refreshBadge,
  startSession,
  submitCheckIn,
  type SessionDeps,
} from '@/src/sessions/session-controller';
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

const sessionDeps: SessionDeps = {
  store: localStore,
  effects: sessionEffects,
  newId: () => crypto.randomUUID(),
  random: cryptoRandomInt,
};

const frictionDeps: FrictionDeps = { store: localStore, pageUrl: frictionPageUrl() };

/**
 * Activity tracking (P2), focus sessions (P4), their check-ins (P5) and the friction intervention
 * (P9). This script can be suspended at any time, so
 * nothing lives in memory: every event loads its state from storage, runs pure logic, and saves
 * the result. All work runs one task at a time, in order, through `queue`, so session end-of-time
 * calculations always see the tracker's latest saved state.
 */
export default defineBackground(() => {
  let queue: Promise<void> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.then(
      () => undefined,
      (err: unknown) => console.error('[StudyLens] background error', err),
    );
    return result;
  }

  /** Stamp the time now, then process in order. `makeEvent` may read browser state. */
  function dispatch(makeEvent: () => TrackerEvent | Promise<TrackerEvent>): void {
    const now = Date.now();
    void enqueue(async () => {
      const event = await makeEvent();
      const before = await loadTrackerState(localStore);
      const { state, segments } = step(before, event, now);
      await appendSegments(localStore, segments);
      await saveTrackerState(localStore, state);
    }).catch(() => undefined); // Already logged by enqueue.
  }

  const sync = () =>
    dispatch(async () => ({
      type: 'sync',
      context: await readContext(IDLE_THRESHOLD_SECONDS, await isTrackingPaused(localStore)),
    }));

  /** Bring the tracker up to date first so a session that ends now includes the current site. */
  function reconcile(): Promise<unknown> {
    dispatch(() => ({ type: 'heartbeat' }));
    return enqueue(() => reconcileSession(sessionDeps, Date.now()));
  }

  /**
   * Friction (P9): a tab was entered. Queued *before* the tracker step for the same event, so the
   * tracker's saved hostname is still the site the user is coming from.
   */
  function checkFriction(readTab: () => Promise<Browser.tabs.Tab> | Browser.tabs.Tab): void {
    const now = Date.now();
    void enqueue(async () => {
      const tab = await Promise.resolve(readTab()).catch(() => undefined); // Tab already closed.
      const tabId = tab?.id;
      // Privacy rule 4 (private windows) and only the tab the user is looking at.
      if (!tab || tabId === undefined || tab.incognito || !tab.active) return;
      const { context } = await loadTrackerState(localStore);
      const action = await checkTab(frictionDeps, { tabId, url: tab.url }, context.hostname, now);
      await applyTabAction(tabId, action);
    }).catch(() => undefined); // Already logged by enqueue (never with the URL).
  }

  async function handleSessionMessage(
    msg: SessionMessage,
    sender: Browser.runtime.MessageSender,
  ): Promise<SessionReply> {
    switch (msg.type) {
      case 'session:start': {
        // `__STUDYLENS_E2E__` is a build-time literal: normal builds always pass null here.
        const seconds = __STUDYLENS_E2E__ ? testSecondsFrom(msg.testSeconds, true) : null;
        const result = await enqueue(() =>
          startSession(sessionDeps, msg.goal, msg.minutes, Date.now(), seconds),
        );
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      case 'session:end-early':
        dispatch(() => ({ type: 'heartbeat' }));
        await enqueue(() => endSessionEarly(sessionDeps, Date.now()));
        return { ok: true };
      case 'session:check':
        await reconcile();
        return { ok: true };
      case 'checkin:answer':
      case 'checkin:skip': {
        if (typeof msg.sessionId !== 'string') return { ok: false, error: 'invalid-answer' };
        const input =
          msg.type === 'checkin:skip'
            ? ({ kind: 'skip' } as const)
            : ({
                kind: 'answer',
                goalCompleted: msg.goalCompleted,
                focusRating: msg.focusRating,
              } as const);
        return enqueue(() => submitCheckIn(sessionDeps, msg.sessionId, input, Date.now()));
      }
      case 'data:delete-all':
        // Queued like everything else, so no tracker write from before can land afterwards.
        await enqueue(() => deleteEverything(localStore, sessionEffects));
        return { ok: true };
      case 'friction:continue':
      case 'friction:back': {
        const hostname = cleanHostname(msg.hostname);
        const fromOwnPage = sender.url?.startsWith(frictionDeps.pageUrl) === true;
        if (!hostname || typeof msg.sessionId !== 'string' || !fromOwnPage) {
          return { ok: false, error: 'invalid-message' };
        }
        const choice = msg.type === 'friction:continue' ? 'continue' : 'back';
        const tabId = sender.tab?.id ?? null;
        await enqueue(() =>
          recordFrictionChoice(frictionDeps, choice, msg.sessionId, hostname, tabId, Date.now()),
        );
        return { ok: true };
      }
    }
  }

  if (__STUDYLENS_E2E__) console.info(`[StudyLens] ${E2E_BUILD_MARKER}: test seconds enabled`);

  // Listeners must be registered synchronously at the top level so a suspended background
  // script is woken up for them.
  browser.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

  browser.tabs.onActivated.addListener(({ tabId }) => {
    // Friction first (it needs the tracker's state from before this switch).
    checkFriction(() => browser.tabs.get(tabId));
    dispatch(async () => ({ type: 'tab', hostname: await readActiveHostname() }));
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!changeInfo.url || !tab.active) return;
    checkFriction(() => tab);
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

  // The E2E test build ignores OS idle (see readIdleState); normal builds always listen.
  if (!__STUDYLENS_E2E__) {
    browser.idle.onStateChanged.addListener((newState) =>
      dispatch(() => ({ type: 'idle', state: newState as IdleState })),
    );
  }

  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[PAUSED_KEY];
    if (area !== 'local' || !change) return;
    dispatch(() => ({ type: 'paused', paused: change.newValue === true }));
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    // The heartbeat re-reads the full browser state, which also repairs any missed event.
    if (alarm.name === HEARTBEAT_ALARM) {
      sync();
      // Auto-skip a check-in left unanswered for 12 hours and keep the "?" badge right.
      void enqueue(() => expireCheckIns(sessionDeps, Date.now())).catch(() => undefined);
    }
    if (alarm.name === SESSION_END_ALARM) void reconcile().catch(() => undefined);
    if (alarm.name === SESSION_TICK_ALARM) {
      void enqueue(() => refreshBadge(sessionDeps, Date.now())).catch(() => undefined);
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isSessionMessage(message)) return false;
    handleSessionMessage(message, sender).then(sendResponse, (err: unknown) => {
      console.error('[StudyLens] session message error', err);
      sendResponse({ ok: false, error: 'unknown' } satisfies SessionReply);
    });
    return true; // Reply asynchronously.
  });

  // Wakes the background at browser start so an overdue session is ended and the badge restored.
  browser.runtime.onStartup.addListener(() => void reconcile().catch(() => undefined));

  // Make sure the heartbeat exists (alarms can be lost across browser restarts/updates).
  void browser.alarms.get(HEARTBEAT_ALARM).then((existing) => {
    if (!existing) {
      void browser.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
    }
  });

  // Every wake-up: close a stale tracker segment (if any) and pick up the current state, then
  // end an overdue session at its planned end (or restore its alarms and badge).
  sync();
  void enqueue(() => reconcileSession(sessionDeps, Date.now())).catch(() => undefined);
});
