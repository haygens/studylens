/**
 * Live group sessions (P18b): React pieces shared by the popup and the Study groups tab.
 *
 * Polling only while the page is open AND visible (every 15 s), never in the background. Each
 * request sends just this browser's token. Status is always written out in words (never by color
 * alone).
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { LIVE_POLL_MS, toLocalTime, type LiveSession } from '@studylens/shared';
import { localStore } from '../background/browser-adapter';
import { failureText, type ApiFailure } from '../groups/api-client';
import { groupDeps } from '../groups/browser-groups';
import { API_BASE } from '../groups/config';
import {
  activeLiveSessions,
  liveSessionState,
  type BeginDeps,
  type BeginResult,
} from '../groups/live';
import { participantName, participantText, summaryTitle } from '../groups/live-view';
import type { SessionMessage, SessionReply } from '../sessions/messages';
import type { ActiveSession } from '../sessions/session';
import { STORAGE_KEYS } from '../storage/keys';
import { loadActiveSession } from '../storage/sessions-store';
import { SparkleIcon } from './icons';

/** The study-group dependencies plus "start the local session" (a message to the background). */
export const beginDeps: BeginDeps = {
  ...groupDeps,
  startLocal: async (input) =>
    (await browser.runtime.sendMessage({
      type: 'session:start-group',
      input,
    } satisfies SessionMessage)) as SessionReply,
};

/** Ends the running local session early (for a group session the background tells the server). */
export async function leaveLocalSession(): Promise<void> {
  await browser.runtime.sendMessage({ type: 'session:end-early' } satisfies SessionMessage);
}

/** A failed start/join in plain words. */
export function beginErrorText(res: Exclude<BeginResult, { ok: true }>): string {
  if ('failure' in res) return failureText(res.failure);
  switch (res.local) {
    case 'already-running':
      return 'A focus session is already running here. End it first, then join.';
    case 'session-over':
      return 'That session is just ending. Start a new one instead.';
    default:
      return 'Something went wrong starting the focus session here. Nothing was kept on the server.';
  }
}

/** Calls `fn` now and every 15 s while the page is visible; stops when unmounted or disabled. */
export function usePolling(fn: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    fn();
    const whenVisible = () => {
      if (document.visibilityState === 'visible') fn();
    };
    const timer = setInterval(whenVisible, LIVE_POLL_MS);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [fn, enabled]);
}

export type LiveListState =
  | { status: 'loading' }
  /** Not in any group (nothing is ever requested). */
  | { status: 'off' }
  | { status: 'ready'; sessions: LiveSession[]; offsetMs: number; failure: ApiFailure | null }
  | { status: 'error'; failure: ApiFailure };

/** The running live sessions in my groups, polled while open. A failed refresh keeps the last. */
export function useLiveSessions(enabled = true) {
  const [state, setState] = useState<LiveListState>({ status: 'loading' });
  const load = useCallback(() => {
    void activeLiveSessions(groupDeps).then(
      (res) =>
        setState((old) => {
          if (res === null) return { status: 'off' };
          if (res.ok) {
            return {
              status: 'ready',
              sessions: res.data.data,
              offsetMs: res.data.offsetMs,
              failure: null,
            };
          }
          return old.status === 'ready'
            ? { ...old, failure: res }
            : { status: 'error', failure: res };
        }),
      () => setState({ status: 'off' }),
    );
  }, []);
  usePolling(load, enabled);
  return { state, refresh: load };
}

/** The running local session, kept in sync with storage. `undefined` while loading. */
export function useActiveSession(): ActiveSession | null | undefined {
  const [active, setActive] = useState<ActiveSession | null | undefined>(undefined);
  useEffect(() => {
    const load = () => void loadActiveSession(localStore).then(setActive, () => setActive(null));
    load();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && STORAGE_KEYS.activeSession in changes) load();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);
  return active;
}

/** The current time, updated every second (for "12 min left"). */
export function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** P18c: the read-only web room of a live session (works on any phone, no extension needed). */
export function roomUrl(roomCode: string): string {
  return `${API_BASE}/s/${roomCode}`;
}

/**
 * P18c: "Copy room link" + "Open room page". Anyone with the link sees the timer, group name, goal
 * and participants' names and statuses (no minutes, never sites), until 1 hour after the end.
 */
export function RoomLink({ roomCode, groupName }: { roomCode: string; groupName: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const url = roomUrl(roomCode);
  return (
    <div style={{ marginTop: 8 }}>
      <div className="sl-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          aria-label={`Copy the room link for ${groupName}`}
          onClick={() =>
            void navigator.clipboard.writeText(url).then(
              () => setCopy('copied'),
              () => setCopy('manual'),
            )
          }
        >
          Copy room link
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="sl-link">
          Open room page
        </a>
        {copy === 'copied' && (
          <span role="status" className="sl-muted">
            Room link copied.
          </span>
        )}
      </div>
      {copy === 'manual' && (
        <input
          readOnly
          value={url}
          aria-label="Room link"
          style={{ width: '100%', marginTop: 6 }}
          onFocus={(e) => e.target.select()}
          autoFocus
        />
      )}
      <p className="sl-muted sl-small" style={{ margin: '4px 0 0' }}>
        Anyone with the link sees the timer, group name, goal, and everyone’s names and status —
        never sites or minutes. It stops working 1 hour after the session ends.
      </p>
    </div>
  );
}

/** Who is in a live session, each with their status in words. */
export function ParticipantList({ session }: { session: LiveSession }) {
  return (
    <ul
      className="sl-live-people"
      aria-label={`Participants in ${session.groupName}`}
      style={{ margin: '4px 0 0', paddingLeft: 20, display: 'grid', gap: 2 }}
    >
      {session.participants.map((p, i) => (
        <li key={i}>
          {participantName(p)} <span className="sl-muted">· {participantText(p)}</span>
        </li>
      ))}
    </ul>
  );
}

/** One live session, polled while it runs (the popup's running card and the summary). */
export function useLiveSession(sessionId: string | null) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; session: LiveSession; offsetMs: number }
    | { status: 'gone' }
    | { status: 'error'; failure: ApiFailure }
  >({ status: 'loading' });
  const load = useCallback(() => {
    if (!sessionId) return;
    void liveSessionState(groupDeps, sessionId).then(
      (res) =>
        setState((old) => {
          if (res === null) return { status: 'gone' };
          if (res.ok)
            return { status: 'ready', session: res.data.data, offsetMs: res.data.offsetMs };
          if (res.kind === 'http' && res.status === 404) return { status: 'gone' };
          return old.status === 'ready' ? old : { status: 'error', failure: res };
        }),
      () => setState({ status: 'gone' }),
    );
  }, [sessionId]);
  const running = state.status !== 'ready' || state.session.state === 'running';
  usePolling(load, sessionId !== null && running);
  // Ask again just after the shared end, so "Session complete!" doesn't wait for the next poll.
  const endsAtLocal =
    state.status === 'ready' && state.session.state === 'running'
      ? toLocalTime(state.session.endsAt, state.offsetMs)
      : null;
  useEffect(() => {
    if (endsAtLocal === null) return;
    const wait = endsAtLocal - Date.now() + 1500;
    if (wait > LIVE_POLL_MS) return;
    const timer = setTimeout(load, Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [endsAtLocal, load]);
  return state;
}

/**
 * The shared "Session complete!" card of a live group session: every participant's status and,
 * for those who share focus minutes in the group, their minutes in the session ("not shared"
 * otherwise). My own check-in stays private and local.
 */
export function LiveSummary({ sessionId }: { sessionId: string }) {
  const state = useLiveSession(sessionId);
  if (state.status === 'loading') {
    return (
      <p className="sl-muted" role="status" style={{ margin: '8px 0 0' }}>
        Loading the group summary…
      </p>
    );
  }
  if (state.status === 'gone') return null;
  if (state.status === 'error') {
    return (
      <p className="sl-muted" role="status" style={{ margin: '8px 0 0' }}>
        The group summary couldn’t load: {failureText(state.failure)}
      </p>
    );
  }
  const { session } = state;
  return (
    <section
      className="sl-card"
      style={{ marginTop: 8, background: 'var(--sl-bg-2)' }}
      aria-label={`Group summary for ${session.groupName}`}
    >
      <p className="sl-celebrate-title" style={{ margin: 0 }}>
        <SparkleIcon />
        {summaryTitle(session)}
      </p>
      <p className="sl-muted" style={{ margin: '4px 0 0' }}>
        {session.groupName}
        {session.goal ? ` · Goal: ${session.goal}` : ''}
      </p>
      <ParticipantList session={session} />
      <p className="sl-muted sl-small" style={{ margin: '4px 0 0' }}>
        Minutes show only for members who share focus minutes in this group. Your check-in stays on
        this device.
      </p>
    </section>
  );
}
