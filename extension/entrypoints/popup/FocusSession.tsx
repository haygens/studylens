/**
 * Focus session controls (P4). The popup can close at any moment, so it keeps no session state of
 * its own: it reads the active session from storage, follows storage changes, and asks the
 * background script to start or end sessions.
 */
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '@/src/background/browser-adapter';
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

function StartForm() {
  const gate = useNoticeGate();
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
  const reason = startBlockReason({ gate, goal, lengthOk, busy });
  const canStart = reason === null;
  const reasonId = useId();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    setBusy(true);
    setError(null);
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
      <label className="sl-field">
        What will you work on?
        <input
          type="text"
          value={goal}
          maxLength={MAX_GOAL_LENGTH}
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
        className="sl-btn-primary sl-btn-big"
        disabled={!canStart}
        aria-describedby={reason ? reasonId : undefined}
      >
        Start focus session
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

  return (
    <section className="sl-card sl-run" aria-label="Focus session">
      <p className="sl-eyebrow">Focusing on</p>
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
          <span className="sl-time">{formatCountdown(left)}</span>
          <span className="sl-muted sl-small">of {Math.round(session.plannedMinutes)} min</span>
        </div>
      </div>
      <p className="sl-muted" style={{ margin: 0 }}>
        Ends at {ends} · {progress >= 0.5 ? 'past halfway, keep going!' : 'you can do this!'}
      </p>
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
        End early
      </button>
    </section>
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
