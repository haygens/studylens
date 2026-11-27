/**
 * Focus session controls (P4). The popup can close at any moment, so it keeps no session state of
 * its own: it reads the active session from storage, follows storage changes, and asks the
 * background script to start or end sessions.
 */
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { LookId } from '@studylens/shared/room-looks';
import { browser } from 'wxt/browser';
import { LIVE_GOAL_MAX_LENGTH } from '@studylens/shared';
import { localStore } from '@/src/background/browser-adapter';
import { groupDeps, serverAccess } from '@/src/groups/browser-groups';
import { loadGroupDevice, loadSharingCache } from '@/src/groups/group-store';
import { startLiveSession } from '@/src/groups/live';
import { canShareName } from '@/src/groups/permission';
import { listGroups } from '@/src/groups/service';
import {
  ParticipantList,
  RoomLink,
  beginDeps,
  beginErrorText,
  useLiveSession,
} from '@/src/ui/live';
import type { SessionMessage, SessionReply } from '@/src/sessions/messages';
import {
  MAX_CUSTOM_MINUTES,
  MAX_GOAL_LENGTH,
  MIN_CUSTOM_MINUTES,
  PRESET_MINUTES,
  formatCountdown,
  isValidDuration,
  remainingMs,
  type ActiveSession,
  type FocusSession as FinishedSession,
} from '@/src/sessions/session';
import { loadSessionView, type LoadState, type SessionView } from '@/src/popup/popup-data';
import { ACTIVE_SESSION_KEY, SESSION_HISTORY_KEY } from '@/src/storage/sessions-store';
import { E2E_BUILD_MARKER, MAX_TEST_SECONDS } from '@/src/e2e/test-seconds';
import { lastSessionSummary, sessionProgress, startBlockReason } from '@/src/popup/popup-view';
import { CheckIcon, InfoIcon, PauseIcon } from '@/src/ui/icons';
import { LookPill, LookStrip, useLook } from '@/src/ui/live-look';
import { useTrackingPaused } from '@/src/ui/use-tracking-paused';
import { shouldShowNotice } from '@/src/storage/interventions-store';
import { useInterventions } from '@/src/ui/use-interventions';
import CheckIn from './CheckIn';
import { LoadError, Loading } from './LoadStatus';

const ERROR_TEXT: Record<string, string> = {
  'already-running': 'A session is already running.',
  'invalid-goal': 'Write what you will work on.',
  'invalid-duration': `Pick ${MIN_CUSTOM_MINUTES}–${MAX_CUSTOM_MINUTES} minutes.`,
  'not-pending': 'That check-in is no longer open.',
  'invalid-answer': 'Pick an answer for both questions.',
  'notice-unanswered': 'First choose “Keep on” or “Turn off” in the research notice above.',
  unknown: 'Something went wrong. Try again.',
};

async function send(message: SessionMessage): Promise<SessionReply> {
  return (await browser.runtime.sendMessage(message)) as SessionReply;
}

/**
 * Active session, most recent finished session and any waiting check-in, kept in sync with
 * storage. Never stuck on "loading". When a session ends with the popup open, the history change
 * reloads this and the popup switches straight to the check-in.
 */
function useSessions() {
  const [state, setState] = useState<LoadState<SessionView>>({ status: 'loading' });

  const reload = useCallback(() => {
    void loadSessionView(localStore, Date.now()).then(setState);
  }, []);

  useEffect(() => {
    reload();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && (ACTIVE_SESSION_KEY in changes || SESSION_HISTORY_KEY in changes)) {
        reload();
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    reload();
  }, [reload]);

  return { state, retry, reload };
}

/** The current time, updated twice a second. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * True while the one-time research notice is waiting for an answer (or still loading): no
 * session can start until then. The background checks this too.
 */
function useNoticeGate(): 'loading' | 'blocked' | 'open' {
  const { state } = useInterventions();
  if (state.status === 'loading') return 'loading';
  return state.status === 'ready' && shouldShowNotice(state.data) ? 'blocked' : 'open';
}

/**
 * P18b: my groups (ID and name), to start a live group session from the popup. Asked only when
 * this browser is in a group and may share its display name (the same rule as the Study groups
 * tab); otherwise nothing is requested and the popup offers solo sessions only.
 */
function usePopupGroups(): { id: string; name: string }[] {
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void (async () => {
      const device = await loadGroupDevice(localStore);
      if (!device || Object.keys(await loadSharingCache(localStore)).length === 0) return;
      if (!canShareName(await serverAccess.read())) return;
      const res = await listGroups(groupDeps, device);
      if (res.ok) setGroups(res.data.groups.map((g) => ({ id: g.id, name: g.name })));
    })().catch(() => undefined);
  }, []);
  return groups;
}

function StartForm() {
  const gate = useNoticeGate();
  const groups = usePopupGroups();
  /** '' = just me (a solo session); otherwise the group to start a live session for. */
  const [withGroup, setWithGroup] = useState('');
  const groupMode = withGroup !== '' && groups.some((g) => g.id === withGroup);
  const [goal, setGoal] = useState('');
  const [choice, setChoice] = useState<number | 'custom'>(25);
  const [custom, setCustom] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // E2E test build only: a length in seconds overrides the minutes (compiled away otherwise).
  const [testSeconds, setTestSeconds] = useState('');
  const seconds = __STUDYLENS_E2E__ && testSeconds ? Number(testSeconds) : null;

  const minutes = choice === 'custom' ? Number(custom) : choice;
  // `seconds` is always null outside the E2E build, so this compiles to isValidDuration(minutes).
  const lengthOk = seconds !== null || isValidDuration(minutes);
  const reason = startBlockReason({ gate, goal, lengthOk, busy, group: groupMode });
  const canStart = reason === null;
  const reasonId = useId();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    setBusy(true);
    setError(null);
    if (groupMode) {
      // P18b: the server first (it sets the shared end time), then the local session.
      const res = await startLiveSession(beginDeps, withGroup, goal, minutes, seconds);
      if (!res.ok) setError(beginErrorText(res));
      setBusy(false);
      return;
    }
    try {
      const reply = await send({
        type: 'session:start',
        goal,
        minutes,
        ...(seconds !== null && { testSeconds: seconds }),
      });
      if (!reply.ok) setError(ERROR_TEXT[reply.error] ?? ERROR_TEXT.unknown!);
    } catch {
      setError(ERROR_TEXT.unknown!);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="sl-card sl-stack"
      aria-label="Start a focus session"
    >
      <h2 className="sl-card-title">Ready to focus?</h2>
      {groups.length > 0 && (
        <label className="sl-field">
          Focus with
          <select value={groupMode ? withGroup : ''} onChange={(e) => setWithGroup(e.target.value)}>
            <option value="">Just me</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                Group: {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="sl-field">
        {groupMode ? 'Goal (optional, your group sees it)' : 'What will you work on?'}
        <input
          type="text"
          value={goal}
          maxLength={groupMode ? LIVE_GOAL_MAX_LENGTH : MAX_GOAL_LENGTH}
          placeholder="e.g. Finish problem set 3"
          autoFocus
          onChange={(e) => setGoal(e.target.value)}
        />
      </label>
      <fieldset className="sl-field">
        <legend>How long?</legend>
        <div className="sl-seg">
          {PRESET_MINUTES.map((m) => (
            <label key={m}>
              <input
                type="radio"
                name="duration"
                checked={choice === m}
                onChange={() => setChoice(m)}
              />
              <span>{m} min</span>
            </label>
          ))}
          <label>
            <input
              type="radio"
              name="duration"
              checked={choice === 'custom'}
              onChange={() => setChoice('custom')}
            />
            <span>Custom</span>
          </label>
        </div>
        {choice === 'custom' && (
          <label className="sl-row" style={{ marginTop: 8, fontWeight: 400 }}>
            <input
              type="number"
              min={MIN_CUSTOM_MINUTES}
              max={MAX_CUSTOM_MINUTES}
              step={1}
              value={custom}
              style={{ width: 80 }}
              aria-label="Custom length in minutes"
              onChange={(e) => setCustom(e.target.value)}
            />
            minutes ({MIN_CUSTOM_MINUTES}–{MAX_CUSTOM_MINUTES})
          </label>
        )}
      </fieldset>
      {__STUDYLENS_E2E__ && (
        <label
          className="sl-small"
          style={{ color: 'var(--sl-warn)' }}
          data-testid={E2E_BUILD_MARKER}
        >
          Test length in seconds (E2E build only){' '}
          <input
            type="number"
            min={1}
            max={MAX_TEST_SECONDS}
            value={testSeconds}
            style={{ width: 70 }}
            onChange={(e) => setTestSeconds(e.target.value)}
          />
        </label>
      )}
      <button
        type="submit"
        className="sl-btn-primary sl-btn-big slm-lift"
        disabled={!canStart}
        aria-describedby={reason ? reasonId : undefined}
      >
        {groupMode ? 'Start group session' : 'Start focus session'}
      </button>
      {reason && gate !== 'loading' && !busy && (
        <p role="note" id={reasonId} className="sl-hint">
          <InfoIcon />
          {reason}
        </p>
      )}
      {error && (
        <p role="alert" className="sl-error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function RunningSession({ session }: { session: ActiveSession }) {
  const now = useNow();
  const left = remainingMs(session, now);
  const timeUp = left === 0;
  const [busy, setBusy] = useState(false);
  const { state: paused } = useTrackingPaused();
  const progress = sessionProgress(session.plannedEnd - session.start, left);

  // Countdown reached zero while the popup is open: nudge the background in case the alarm is
  // late. It ends the session at its planned time either way.
  useEffect(() => {
    if (timeUp) void send({ type: 'session:check' }).catch(() => undefined);
  }, [timeUp]);

  const ends = new Date(session.plannedEnd).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const look = useLook();
  // P21: a group session shows in the room look for the user's theme.
  const looked = session.group ? { 'data-look': look } : {};
  const clock = formatCountdown(left);

  return (
    <section
      className={
        session.group ? 'sl-card sl-run sl-look slm-slide-up' : 'sl-card sl-run slm-slide-up'
      }
      aria-label="Focus session"
      {...looked}
    >
      {session.group && <LookStrip look={look} />}
      {session.group && <LookPill look={look} />}
      <p className="sl-eyebrow">
        {session.group ? `Group session · ${session.group.groupName}` : 'Focusing on'}
      </p>
      <p className="sl-goal">{session.goal}</p>
      <div className="sl-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="sl-ring-track" cx="60" cy="60" r={RING_RADIUS} />
          <circle
            className="sl-ring-fill"
            cx="60"
            cy="60"
            r={RING_RADIUS}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - progress)}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="sl-ring-text" aria-live="off">
          <span className="sl-time">
            <span key={clock} className="slm-tick">
              {clock}
            </span>
          </span>
          <span className="sl-muted sl-small">of {Math.round(session.plannedMinutes)} min</span>
        </div>
      </div>
      <p className="sl-muted" style={{ margin: 0 }}>
        Ends at {ends} · {progress >= 0.5 ? 'past halfway, keep going!' : 'you can do this!'}
      </p>
      {session.group && <GroupParticipants sessionId={session.group.sessionId} look={look} />}
      {paused.status === 'ready' && paused.data && (
        <p className="sl-hint" style={{ justifyContent: 'center' }}>
          <PauseIcon />
          Tracking is paused: sites aren&apos;t recorded.
        </p>
      )}
      <button
        type="button"
        className="sl-btn-quiet"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void send({ type: 'session:end-early' })
            .catch(() => undefined)
            .finally(() => setBusy(false));
        }}
      >
        {session.group ? 'Leave session' : 'End early'}
      </button>
    </section>
  );
}

/** P18b: who else is in my group session, refreshed every 15 s while the popup is open. */
function GroupParticipants({ sessionId, look }: { sessionId: string; look: LookId }) {
  const state = useLiveSession(sessionId);
  if (state.status !== 'ready') return null;
  return (
    <div style={{ textAlign: 'left', width: '100%' }}>
      <ParticipantList session={state.session} look={look} />
      {state.session.roomCode && (
        <RoomLink roomCode={state.session.roomCode} groupName={state.session.groupName} />
      )}
    </div>
  );
}

function LastSession({ session }: { session: FinishedSession }) {
  return (
    <p className="sl-last">
      <span className="sl-last-badge" aria-hidden="true">
        <CheckIcon />
      </span>
      {lastSessionSummary(session)}
    </p>
  );
}

export default function FocusSession() {
  const { state, retry, reload } = useSessions();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') {
    return <LoadError what="Focus session" message={state.message} onRetry={retry} />;
  }
  const { active, last, pending } = state.data;
  // A check-in waiting for an answer comes first, before the Start form (P5).
  if (pending) {
    return <CheckIn key={pending.id} session={pending} onClosed={reload} />;
  }
  return (
    <>
      {active ? <RunningSession session={active} /> : <StartForm />}
      {!active && last && <LastSession session={last} />}
    </>
  );
}
