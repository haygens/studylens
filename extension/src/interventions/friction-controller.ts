/**
 * Runs the friction intervention (P9) in the background script. Like the session controller, all
 * state lives in storage so the background can be suspended at any time (including while a
 * countdown page is open). Browser calls stay in background.ts; this module only decides and saves.
 *
 * Privacy: a tab's full URL comes in only to be placed in the returned countdown-page address.
 * It is never saved: storage gets the session's counts and FrictionState (site names only).
 */
import type { KeyValueStore } from '../storage/activity-store';
import { isTrackingPaused } from '../storage/activity-store';
import { loadRules } from '../storage/categories-store';
import { FRICTION_STATE_KEY, loadFrictionState } from '../storage/friction-store';
import {
  ACTIVE_SESSION_KEY,
  loadActiveSession,
  loadSessions,
  saveSessions,
} from '../storage/sessions-store';
import { siteKey } from '../categories/rules';
import { trackableHostname } from '../tracker/hostname';
import {
  addFriction,
  decideFriction,
  frictionDoneUrl,
  frictionPageUrl,
  markTurnedBack,
  startGrace,
  stateFor,
} from './friction';

export interface FrictionDeps {
  store: KeyValueStore;
  /** The countdown page, e.g. `moz-extension://<id>/friction.html`. */
  pageUrl: string;
}

export type TabAction =
  | { type: 'none' }
  /** Send the tab to the countdown page at `url`. */
  | { type: 'redirect'; url: string }
  /** Go back in the tab's history; if that's impossible, open `fallbackUrl`. */
  | { type: 'go-back'; fallbackUrl: string };

/**
 * A tab became active, or the active tab's page changed. `url` is the tab's full address (used
 * only for the returned redirect); `previousHostname` is the tracker's active site before this.
 */
export async function checkTab(
  deps: FrictionDeps,
  tab: { tabId: number; url: string | undefined },
  previousHostname: string | null,
  now: number,
): Promise<TabAction> {
  const [session, paused, rules, state] = await Promise.all([
    loadActiveSession(deps.store),
    isTrackingPaused(deps.store),
    loadRules(deps.store),
    loadFrictionState(deps.store),
  ]);
  const hostname = trackableHostname(tab.url);
  const decision = decideFriction(
    { tabId: tab.tabId, hostname, previousHostname },
    { session, paused, rules, state, now },
  );

  switch (decision.action) {
    case 'none':
      if (decision.state) await deps.store.set({ [FRICTION_STATE_KEY]: decision.state });
      return { type: 'none' };
    case 'go-back':
      await deps.store.set({ [FRICTION_STATE_KEY]: decision.state });
      return {
        type: 'go-back',
        fallbackUrl: frictionDoneUrl(deps.pageUrl, decision.state.sessionId),
      };
    case 'redirect': {
      // decideFriction only redirects during a running session, with a trackable URL.
      if (!session || !tab.url) return { type: 'none' };
      // Count and state in one write, so "shown" is never counted without its redirect state.
      await deps.store.set({
        [ACTIVE_SESSION_KEY]: addFriction(session, 'frictionShown'),
        [FRICTION_STATE_KEY]: decision.state,
      });
      return { type: 'redirect', url: frictionPageUrl(deps.pageUrl, tab.url, session.id) };
    }
  }
}

export type FrictionChoice = 'continue' | 'back';

/**
 * The user pressed "Continue" or "Back to studying" on the countdown page of `sessionId`.
 * Counts it on that session — the running one, or the finished one if the session ended during
 * the countdown. "Continue" starts the site's grace period (running session only); "Back"
 * remembers the tab so going back through the site doesn't show friction again.
 */
export async function recordFrictionChoice(
  deps: FrictionDeps,
  choice: FrictionChoice,
  sessionId: string,
  hostname: string,
  tabId: number | null,
  now: number,
): Promise<void> {
  const outcome = choice === 'continue' ? 'frictionContinued' : 'frictionTurnedBack';
  const [active, rules, saved] = await Promise.all([
    loadActiveSession(deps.store),
    loadRules(deps.store),
    loadFrictionState(deps.store),
  ]);
  const site = siteKey(hostname, rules);
  const writes: Record<string, unknown> = {};

  if (active?.id === sessionId) {
    writes[ACTIVE_SESSION_KEY] = addFriction(active, outcome);
  } else {
    const history = await loadSessions(deps.store);
    if (history.some((s) => s.id === sessionId)) {
      await saveSessions(
        deps.store,
        history.map((s) => (s.id === sessionId ? addFriction(s, outcome) : s)),
      );
    }
  }

  // The state belongs to the running session if there is one (never wipe a newer session's).
  let state = stateFor(saved, active?.id ?? sessionId);
  if (choice === 'continue' && active?.id === sessionId) state = startGrace(state, site, now);
  if (choice === 'back' && tabId !== null) state = markTurnedBack(state, tabId, site, now);
  if (state !== saved) writes[FRICTION_STATE_KEY] = state;
  if (Object.keys(writes).length > 0) await deps.store.set(writes);
}
