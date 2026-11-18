/**
 * Runs the friction (P9) and intention (P10) interventions in the background script. Like the
 * session controller, all state lives in storage so the background can be suspended at any time
 * (including while the interstitial page is open). Browser calls stay in background.ts; this
 * module only decides and saves.
 *
 * Privacy: a tab's full URL comes in only to be placed in the returned interstitial-page address.
 * It is never saved: storage gets the session's counts and InterstitialState (site names only).
 * Nothing here ever receives what the user typed on the intention page.
 */
import type { KeyValueStore } from '../storage/activity-store';
import { isTrackingPaused } from '../storage/activity-store';
import { loadRules } from '../storage/categories-store';
import { INTERSTITIAL_STATE_KEY, loadInterstitialState } from '../storage/interstitial-store';
import {
  ACTIVE_SESSION_KEY,
  loadActiveSession,
  loadSessions,
  saveSessions,
} from '../storage/sessions-store';
import { siteKey } from '../categories/rules';
import { trackableHostname } from '../tracker/hostname';
import {
  addCount,
  countName,
  decideInterstitial,
  interstitialDoneUrl,
  interstitialPageUrl,
  markTurnedBack,
  startGrace,
  stateFor,
  type InterstitialChoice,
  type InterstitialMode,
} from './interstitial';

export interface InterstitialDeps {
  store: KeyValueStore;
  /** The interstitial page, e.g. `moz-extension://<id>/interstitial.html`. */
  pageUrl: string;
}

export type TabAction =
  | { type: 'none' }
  /** Send the tab to the interstitial page at `url`. */
  | { type: 'redirect'; url: string }
  /** Go back in the tab's history; if that's impossible, open `fallbackUrl`. */
  | { type: 'go-back'; fallbackUrl: string };

/**
 * A tab became active, or the active tab's page changed. `url` is the tab's full address (used
 * only for the returned redirect); `previousHostname` is the tracker's active site before this.
 */
export async function checkTab(
  deps: InterstitialDeps,
  tab: { tabId: number; url: string | undefined },
  previousHostname: string | null,
  now: number,
): Promise<TabAction> {
  const [session, paused, rules, state] = await Promise.all([
    loadActiveSession(deps.store),
    isTrackingPaused(deps.store),
    loadRules(deps.store),
    loadInterstitialState(deps.store),
  ]);
  const hostname = trackableHostname(tab.url);
  const decision = decideInterstitial(
    { tabId: tab.tabId, hostname, previousHostname },
    { session, paused, rules, state, now },
  );

  switch (decision.action) {
    case 'none':
      if (decision.state) await deps.store.set({ [INTERSTITIAL_STATE_KEY]: decision.state });
      return { type: 'none' };
    case 'go-back':
      await deps.store.set({ [INTERSTITIAL_STATE_KEY]: decision.state });
      return {
        type: 'go-back',
        fallbackUrl: interstitialDoneUrl(deps.pageUrl, decision.state.sessionId),
      };
    case 'redirect': {
      // decideInterstitial only redirects during a running session, with a trackable URL.
      if (!session || !tab.url) return { type: 'none' };
      // Count and state in one write, so "shown" is never counted without its redirect state.
      await deps.store.set({
        [ACTIVE_SESSION_KEY]: addCount(session, countName(decision.mode, 'shown')),
        [INTERSTITIAL_STATE_KEY]: decision.state,
      });
      return {
        type: 'redirect',
        url: interstitialPageUrl(deps.pageUrl, decision.mode, tab.url, session.id),
      };
    }
  }
}

/**
 * The user pressed "Continue" or "Back to studying" on the `mode` page of `sessionId`.
 * Counts it on that session — the running one, or the finished one if the session ended while
 * the page was open. "Continue" starts the site's grace period (running session only); "Back"
 * remembers the tab so going back through the site doesn't show the page again.
 */
export async function recordChoice(
  deps: InterstitialDeps,
  mode: InterstitialMode,
  choice: InterstitialChoice,
  sessionId: string,
  hostname: string,
  tabId: number | null,
  now: number,
): Promise<void> {
  const name = countName(mode, choice);
  const [active, rules, saved] = await Promise.all([
    loadActiveSession(deps.store),
    loadRules(deps.store),
    loadInterstitialState(deps.store),
  ]);
  const site = siteKey(hostname, rules);
  const writes: Record<string, unknown> = {};

  if (active?.id === sessionId) {
    writes[ACTIVE_SESSION_KEY] = addCount(active, name);
  } else {
    const history = await loadSessions(deps.store);
    if (history.some((s) => s.id === sessionId)) {
      await saveSessions(
        deps.store,
        history.map((s) => (s.id === sessionId ? addCount(s, name) : s)),
      );
    }
  }

  // The state belongs to the running session if there is one (never wipe a newer session's).
  let state = stateFor(saved, active?.id ?? sessionId);
  // The page was answered, so the next visit is a new one, not a duplicate event of that redirect
  // (what follows is covered by the grace period or the "back" marker).
  if (state.lastRedirect?.site === site && state.lastRedirect.tabId === tabId) {
    state = { ...state, lastRedirect: null };
  }
  if (choice === 'continue' && active?.id === sessionId) state = startGrace(state, site, now);
  if (choice === 'back' && tabId !== null) state = markTurnedBack(state, tabId, site, now);
  if (state !== saved) writes[INTERSTITIAL_STATE_KEY] = state;
  if (Object.keys(writes).length > 0) await deps.store.set(writes);
}
