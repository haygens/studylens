/**
 * Friction (P9) and intention (P10) interventions, shared pure logic. No browser APIs here.
 *
 * Both work the same way: during a focus session whose condition is `friction` or `intention`,
 * *entering* a site the user labeled Distraction (navigating to it, or switching into a tab
 * already on it — the same moments that count as distraction visits) sends the tab to the
 * extension's interstitial page first. The page's `mode` decides what it shows:
 * - `friction`:  a short countdown, then "Continue to <site>".
 * - `intention`: a "What did you come here for?" box; "Continue" enables once something is typed.
 *
 * Privacy: the full target URL is only ever carried in the interstitial page's own address so that
 * "Continue" can return there. Nothing in this module's saved state holds a URL: only site names
 * (hostnames / registrable domains), tab ids, times and counts. The intention answer never leaves
 * the page (see `choiceMessage`).
 */
import type { SessionCondition } from '@studylens/shared';
import { categoryOf, siteKey, type CategoryRule } from '../categories/rules';
import { trackableHostname } from '../tracker/hostname';

/** The conditions that show the interstitial page. */
export const INTERSTITIAL_MODES = ['friction', 'intention'] as const;
export type InterstitialMode = (typeof INTERSTITIAL_MODES)[number];

export function isInterstitialMode(value: unknown): value is InterstitialMode {
  return value === 'friction' || value === 'intention';
}

/** The interstitial mode for a session's condition, or null (control, opted-out, none). */
export function modeFor(condition: SessionCondition | null): InterstitialMode | null {
  return isInterstitialMode(condition) ? condition : null;
}

/** Friction: length of the countdown before "Continue" appears. */
export const FRICTION_COUNTDOWN_SECONDS = 10;
/** Intention: "Continue" enables once the answer has this many non-space characters. */
export const INTENTION_MIN_CHARS = 3;
/** After "Continue", that site gets no interstitial again for this long (in the same session). */
export const GRACE_MINUTES = 5;
export const GRACE_MS = GRACE_MINUTES * 60_000;
/** A second event for the same tab and site this soon after a redirect is the same navigation. */
export const DUPLICATE_EVENT_MS = 3_000;
/**
 * After "Back to studying", landing on the same site in the same tab this soon means going back
 * passed through it, so the tab goes back once more instead of showing the interstitial again.
 */
export const BACK_WINDOW_MS = 15_000;

/** True once the intention answer has at least INTENTION_MIN_CHARS non-space characters. */
export function intentionReady(text: string): boolean {
  return text.replace(/\s/g, '').length >= INTENTION_MIN_CHARS;
}

/**
 * Counts saved on every session (0 unless its condition matches). Only these numbers are kept:
 * never what the user typed on the intention page.
 */
export interface InterventionCounts {
  /** Friction: times the countdown page was shown / "Continue" / "Back to studying" pressed. */
  frictionShown: number;
  frictionContinued: number;
  frictionTurnedBack: number;
  /** Intention: times the prompt was shown / "Continue" / "Back to studying" pressed. */
  intentionShown: number;
  intentionContinued: number;
  intentionTurnedBack: number;
}

export const NO_COUNTS: InterventionCounts = {
  frictionShown: 0,
  frictionContinued: 0,
  frictionTurnedBack: 0,
  intentionShown: 0,
  intentionContinued: 0,
  intentionTurnedBack: 0,
};

export type CountName = keyof InterventionCounts;
export type InterstitialEvent = 'shown' | 'continue' | 'back';

/** The counter for an event in a mode: ('intention', 'back') → 'intentionTurnedBack'. */
export function countName(mode: InterstitialMode, event: InterstitialEvent): CountName {
  const suffix = { shown: 'Shown', continue: 'Continued', back: 'TurnedBack' } as const;
  return `${mode}${suffix[event]}`;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** The counts stored on a session; missing or broken values (older sessions) count as 0. */
export function countsOf(value: unknown): InterventionCounts {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const out = { ...NO_COUNTS };
  for (const name of Object.keys(NO_COUNTS) as CountName[]) out[name] = count(v[name]);
  return out;
}

/** Adds one to a counter, keeping every other field of `session`. */
export function addCount<T extends InterventionCounts>(session: T, name: CountName): T {
  return { ...session, [name]: count(session[name]) + 1 };
}

/** Bookkeeping for one session (stored under `interstitial:state`). No URLs, no typed text. */
export interface InterstitialState {
  sessionId: string;
  /** Site → epoch ms when its grace period ends. */
  grace: Record<string, number>;
  /** The last redirect, so duplicate events for the same navigation are ignored. */
  lastRedirect: { tabId: number; site: string; at: number } | null;
  /** Set by "Back to studying" (see BACK_WINDOW_MS). */
  back: { tabId: number; site: string; until: number } | null;
}

export function emptyState(sessionId: string): InterstitialState {
  return { sessionId, grace: {}, lastRedirect: null, back: null };
}

/** The state for `sessionId`; a state left over from another session starts fresh. */
export function stateFor(state: InterstitialState | null, sessionId: string): InterstitialState {
  return state?.sessionId === sessionId ? state : emptyState(sessionId);
}

export function inGrace(state: InterstitialState, site: string, now: number): boolean {
  const until = state.grace[site];
  return until !== undefined && now < until;
}

/** Starts (or restarts) the grace period for `site`, dropping grace periods that are over. */
export function startGrace(state: InterstitialState, site: string, now: number): InterstitialState {
  const grace: Record<string, number> = {};
  for (const [s, until] of Object.entries(state.grace)) if (until > now) grace[s] = until;
  grace[site] = now + GRACE_MS;
  return { ...state, grace };
}

export function markTurnedBack(
  state: InterstitialState,
  tabId: number,
  site: string,
  now: number,
): InterstitialState {
  return { ...state, back: { tabId, site, until: now + BACK_WINDOW_MS } };
}

/** A tab that just became the active tab, or whose active page changed. */
export interface TabEntry {
  tabId: number;
  /** Trackable hostname of the tab's new page, or null (extension page, about:, private, …). */
  hostname: string | null;
  /** Hostname the tracker had as the active site just before this event. */
  previousHostname: string | null;
}

export interface InterstitialContext {
  session: { id: string; condition: SessionCondition | null } | null;
  paused: boolean;
  rules: readonly CategoryRule[];
  state: InterstitialState | null;
  now: number;
}

export type InterstitialDecision =
  /** `state`: save this, or null to leave the stored state as it is. */
  | { action: 'none'; state: InterstitialState | null }
  | { action: 'redirect'; mode: InterstitialMode; site: string; state: InterstitialState }
  /** Going back from the interstitial page passed through the site: go back once more. */
  | { action: 'go-back'; state: InterstitialState };

/**
 * What to do when a tab is entered. The interstitial shows only when all of these hold:
 * a session is running with condition `friction` or `intention`, tracking isn't paused, the page
 * is a trackable site labeled Distraction, the user is *entering* it (the previous active site was
 * a different site), it isn't in its grace period, and this isn't a duplicate event for a redirect
 * just made. The rules are the same for both modes.
 */
export function decideInterstitial(
  entry: TabEntry,
  ctx: InterstitialContext,
): InterstitialDecision {
  const site = entry.hostname ? siteKey(entry.hostname, ctx.rules) : null;
  let state = ctx.state;
  let changed = false;

  // "Back to studying" is handled first: it may outlive the session (it ended mid-page).
  const back = state?.back;
  if (state && back && back.tabId === entry.tabId) {
    if (site === back.site && ctx.now <= back.until) {
      return { action: 'go-back', state: { ...state, back: null } };
    }
    state = { ...state, back: null }; // Arrived somewhere else: the way back is done.
    changed = true;
  }
  const none: InterstitialDecision = { action: 'none', state: changed ? state : null };

  const { session } = ctx;
  const mode = modeFor(session?.condition ?? null);
  if (!entry.hostname || !site || !session || !mode) return none;
  if (ctx.paused || categoryOf(entry.hostname, ctx.rules) !== 'distraction') return none;
  const previousSite = entry.previousHostname ? siteKey(entry.previousHostname, ctx.rules) : null;
  if (previousSite === site) return none; // Still on the same site: not entering it.

  const current = stateFor(state, session.id);
  if (inGrace(current, site, ctx.now)) return none;
  const last = current.lastRedirect;
  if (
    last &&
    last.tabId === entry.tabId &&
    last.site === site &&
    ctx.now - last.at >= 0 &&
    ctx.now - last.at < DUPLICATE_EVENT_MS
  ) {
    return none;
  }
  return {
    action: 'redirect',
    mode,
    site,
    state: { ...current, lastRedirect: { tabId: entry.tabId, site, at: ctx.now } },
  };
}

// --- The interstitial page's address ----------------------------------------------------------

export type InterstitialPage =
  /** Before `target` (a full http(s) URL, kept only in the page's address). */
  | {
      kind: 'prompt';
      mode: InterstitialMode;
      target: string;
      hostname: string;
      sessionId: string;
    }
  /** Shown after "Back to studying" when the tab has nowhere to go back to. */
  | { kind: 'done'; sessionId: string };

/** `<pageUrl>?m=<mode>&to=<target>&s=<sessionId>`. */
export function interstitialPageUrl(
  pageUrl: string,
  mode: InterstitialMode,
  target: string,
  sessionId: string,
): string {
  const params = new URLSearchParams({ m: mode, to: target, s: sessionId });
  return `${pageUrl}?${params.toString()}`;
}

/** `<pageUrl>?done=1&s=<sessionId>`. */
export function interstitialDoneUrl(pageUrl: string, sessionId: string): string {
  const params = new URLSearchParams({ done: '1', s: sessionId });
  return `${pageUrl}?${params.toString()}`;
}

/** Reads the page's query string. Null if it is broken or the target isn't a normal web page. */
export function parseInterstitialPage(search: string): InterstitialPage | null {
  const params = new URLSearchParams(search);
  const sessionId = params.get('s') ?? '';
  if (params.get('done') === '1') return { kind: 'done', sessionId };
  const mode = params.get('m');
  const target = params.get('to');
  const hostname = trackableHostname(target);
  if (!isInterstitialMode(mode) || !target || !hostname || !sessionId) return null;
  return { kind: 'prompt', mode, target, hostname, sessionId };
}

/** A hostname sent back by the interstitial page, cleaned; null if it isn't a plain hostname. */
export function cleanHostname(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 253 || !/^[a-z0-9.-]+$/i.test(value)) {
    return null;
  }
  return trackableHostname(`https://${value}/`);
}

export type InterstitialChoice = 'continue' | 'back';

/** The message the interstitial page sends the background when the user chooses. */
export interface ChoiceMessage {
  type: 'interstitial:choice';
  choice: InterstitialChoice;
  mode: InterstitialMode;
  sessionId: string;
  hostname: string;
}

/**
 * Builds the page's message to the background. Privacy: it takes no answer text at all, so what
 * the user typed on the intention page cannot be sent, stored or logged — it lives only in the
 * page's own memory while the page is open.
 */
export function choiceMessage(
  page: Extract<InterstitialPage, { kind: 'prompt' }>,
  choice: InterstitialChoice,
): ChoiceMessage {
  return {
    type: 'interstitial:choice',
    choice,
    mode: page.mode,
    sessionId: page.sessionId,
    hostname: page.hostname,
  };
}
