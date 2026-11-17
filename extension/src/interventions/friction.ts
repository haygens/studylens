/**
 * Friction intervention (P9), pure logic. No browser APIs here.
 *
 * During a focus session whose condition is `friction`, *entering* a site the user labeled
 * Distraction (navigating to it, or switching into a tab already on it — the same moments that
 * count as distraction visits) sends the tab to the extension's countdown page first.
 *
 * Privacy: the full target URL is only ever carried in the countdown page's own address so that
 * "Continue" can return there. Nothing in this module's saved state holds a URL: only site names
 * (hostnames / registrable domains), tab ids, times and counts.
 */
import type { SessionCondition } from '@studylens/shared';
import { categoryOf, siteKey, type CategoryRule } from '../categories/rules';
import { trackableHostname } from '../tracker/hostname';

/** Length of the countdown before "Continue" appears. */
export const FRICTION_COUNTDOWN_SECONDS = 10;
/** After "Continue", that site gets no friction again for this long (in the same session). */
export const FRICTION_GRACE_MINUTES = 5;
export const FRICTION_GRACE_MS = FRICTION_GRACE_MINUTES * 60_000;
/** A second event for the same tab and site this soon after a redirect is the same navigation. */
export const DUPLICATE_EVENT_MS = 3_000;
/**
 * After "Back to studying", landing on the same site in the same tab this soon means going back
 * passed through it, so the tab goes back once more instead of showing friction again.
 */
export const BACK_WINDOW_MS = 15_000;

/** Counts saved on every session (0 unless its condition is `friction`). */
export interface FrictionCounts {
  /** Times the countdown page was shown. */
  frictionShown: number;
  /** Times the user pressed "Continue to <site>". */
  frictionContinued: number;
  /** Times the user pressed "Back to studying". */
  frictionTurnedBack: number;
}

export const NO_FRICTION: FrictionCounts = {
  frictionShown: 0,
  frictionContinued: 0,
  frictionTurnedBack: 0,
};

export type FrictionOutcome = keyof FrictionCounts;

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** The counts stored on a session; missing or broken values (sessions before P9) count as 0. */
export function frictionCountsOf(value: unknown): FrictionCounts {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    frictionShown: count(v.frictionShown),
    frictionContinued: count(v.frictionContinued),
    frictionTurnedBack: count(v.frictionTurnedBack),
  };
}

/** Adds one to a counter, keeping every other field of `session`. */
export function addFriction<T extends FrictionCounts>(session: T, outcome: FrictionOutcome): T {
  return { ...session, [outcome]: count(session[outcome]) + 1 };
}

/** Friction bookkeeping for one session (stored under `friction:state`). No URLs. */
export interface FrictionState {
  sessionId: string;
  /** Site → epoch ms when its grace period ends. */
  grace: Record<string, number>;
  /** The last redirect, so duplicate events for the same navigation are ignored. */
  lastRedirect: { tabId: number; site: string; at: number } | null;
  /** Set by "Back to studying" (see BACK_WINDOW_MS). */
  back: { tabId: number; site: string; until: number } | null;
}

export function emptyFrictionState(sessionId: string): FrictionState {
  return { sessionId, grace: {}, lastRedirect: null, back: null };
}

/** The state for `sessionId`; a state left over from another session starts fresh. */
export function stateFor(state: FrictionState | null, sessionId: string): FrictionState {
  return state?.sessionId === sessionId ? state : emptyFrictionState(sessionId);
}

export function inGrace(state: FrictionState, site: string, now: number): boolean {
  const until = state.grace[site];
  return until !== undefined && now < until;
}

/** Starts (or restarts) the grace period for `site`, dropping grace periods that are over. */
export function startGrace(state: FrictionState, site: string, now: number): FrictionState {
  const grace: Record<string, number> = {};
  for (const [s, until] of Object.entries(state.grace)) if (until > now) grace[s] = until;
  grace[site] = now + FRICTION_GRACE_MS;
  return { ...state, grace };
}

export function markTurnedBack(
  state: FrictionState,
  tabId: number,
  site: string,
  now: number,
): FrictionState {
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

export interface FrictionContext {
  session: { id: string; condition: SessionCondition | null } | null;
  paused: boolean;
  rules: readonly CategoryRule[];
  state: FrictionState | null;
  now: number;
}

export type FrictionDecision =
  /** `state`: save this, or null to leave the stored state as it is. */
  | { action: 'none'; state: FrictionState | null }
  | { action: 'redirect'; site: string; state: FrictionState }
  /** Going back from the countdown page passed through the site: go back once more. */
  | { action: 'go-back'; state: FrictionState };

/**
 * What to do when a tab is entered. Friction shows only when all of these hold:
 * a session is running with condition `friction`, tracking isn't paused, the page is a trackable
 * site labeled Distraction, the user is *entering* it (the previous active site was a different
 * site), it isn't in its grace period, and this isn't a duplicate event for a redirect just made.
 */
export function decideFriction(entry: TabEntry, ctx: FrictionContext): FrictionDecision {
  const site = entry.hostname ? siteKey(entry.hostname, ctx.rules) : null;
  let state = ctx.state;
  let changed = false;

  // "Back to studying" is handled first: it may outlive the session (it ended mid-countdown).
  const back = state?.back;
  if (state && back && back.tabId === entry.tabId) {
    if (site === back.site && ctx.now <= back.until) {
      return { action: 'go-back', state: { ...state, back: null } };
    }
    state = { ...state, back: null }; // Arrived somewhere else: the way back is done.
    changed = true;
  }
  const none: FrictionDecision = { action: 'none', state: changed ? state : null };

  const { session } = ctx;
  if (!entry.hostname || !site || !session || session.condition !== 'friction') return none;
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
    site,
    state: { ...current, lastRedirect: { tabId: entry.tabId, site, at: ctx.now } },
  };
}

// --- The countdown page's address -------------------------------------------------------------

export type FrictionPage =
  /** The countdown before `target` (a full http(s) URL, kept only in the page's address). */
  | { mode: 'countdown'; target: string; hostname: string; sessionId: string }
  /** Shown after "Back to studying" when the tab has nowhere to go back to. */
  | { mode: 'done'; sessionId: string };

/** `<pageUrl>?to=<target>&s=<sessionId>`. */
export function frictionPageUrl(pageUrl: string, target: string, sessionId: string): string {
  const params = new URLSearchParams({ to: target, s: sessionId });
  return `${pageUrl}?${params.toString()}`;
}

/** `<pageUrl>?done=1&s=<sessionId>`. */
export function frictionDoneUrl(pageUrl: string, sessionId: string): string {
  const params = new URLSearchParams({ done: '1', s: sessionId });
  return `${pageUrl}?${params.toString()}`;
}

/** Reads the page's query string. Null if it is broken or the target isn't a normal web page. */
export function parseFrictionPage(search: string): FrictionPage | null {
  const params = new URLSearchParams(search);
  const sessionId = params.get('s') ?? '';
  if (params.get('done') === '1') return { mode: 'done', sessionId };
  const target = params.get('to');
  const hostname = trackableHostname(target);
  if (!target || !hostname || !sessionId) return null;
  return { mode: 'countdown', target, hostname, sessionId };
}

/** A hostname sent back by the countdown page, cleaned; null if it isn't a plain hostname. */
export function cleanHostname(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 253 || !/^[a-z0-9.-]+$/i.test(value)) {
    return null;
  }
  return trackableHostname(`https://${value}/`);
}
