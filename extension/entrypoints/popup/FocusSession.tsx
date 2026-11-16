/**
 * Focus session controls (P4). The popup can close at any moment, so it keeps no session state of
 * its own: it reads the active session from storage, follows storage changes, and asks the
 * background script to start or end sessions.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
  normalizeGoal,
  remainingMs,
  type ActiveSession,
  type FocusSession as FinishedSession,
} from '@/src/sessions/session';
import { loadSessionView, type LoadState, type SessionView } from '@/src/popup/popup-data';
import { ACTIVE_SESSION_KEY, SESSION_HISTORY_KEY } from '@/src/storage/sessions-store';
import { formatCheckIn } from '@/src/sessions/check-in';
import CheckIn from './CheckIn';
import { LoadError, Loading } from './LoadStatus';

const ERROR_TEXT: Record<string, string> = {
  'already-running': 'A session is already running.',
  'invalid-goal': 'Write what you will work on.',
  'invalid-duration': `Pick ${MIN_CUSTOM_MINUTES}–${MAX_CUSTOM_MINUTES} minutes.`,
  'not-pending': 'That check-in is no longer open.',
  'invalid-answer': 'Pick an answer for both questions.',
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

function StartForm() {
  const [goal, setGoal] = useState('');
  const [choice, setChoice] = useState<number | 'custom'>(25);
  const [custom, setCustom] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minutes = choice === 'custom' ? Number(custom) : choice;
  const canStart = normalizeGoal(goal) !== null && isValidDuration(minutes) && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await send({ type: 'session:start', goal, minutes });
      if (!reply.ok) setError(ERROR_TEXT[reply.error] ?? ERROR_TEXT.unknown!);
    } catch {
      setError(ERROR_TEXT.unknown!);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ display: 'grid', gap: 8 }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
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
      <fieldset style={{ border: 'none', padding: 0, margin: 0, fontSize: 13 }}>
        <legend style={{ marginBottom: 4 }}>How long?</legend>
        {PRESET_MINUTES.map((m) => (
          <label key={m} style={{ marginRight: 10 }}>
            <input
              type="radio"
              name="duration"
              checked={choice === m}
              onChange={() => setChoice(m)}
            />{' '}
            {m} min
          </label>
        ))}
        <label>
          <input
            type="radio"
            name="duration"
            checked={choice === 'custom'}
            onChange={() => setChoice('custom')}
          />{' '}
          Custom
        </label>
        {choice === 'custom' && (
          <div style={{ marginTop: 6 }}>
            <input
              type="number"
              min={MIN_CUSTOM_MINUTES}
              max={MAX_CUSTOM_MINUTES}
              step={1}
              value={custom}
              style={{ width: 70 }}
              onChange={(e) => setCustom(e.target.value)}
            />{' '}
            minutes ({MIN_CUSTOM_MINUTES}–{MAX_CUSTOM_MINUTES})
          </div>
        )}
      </fieldset>
      <button type="submit" disabled={!canStart}>
        Start focus session
      </button>
      {error && <div style={{ color: '#cf222e', fontSize: 12 }}>{error}</div>}
    </form>
  );
}

function RunningSession({ session }: { session: ActiveSession }) {
  const now = useNow();
  const left = remainingMs(session, now);
  const timeUp = left === 0;
  const [busy, setBusy] = useState(false);

  // Countdown reached zero while the popup is open: nudge the background in case the alarm is
  // late. It ends the session at its planned time either way.
  useEffect(() => {
    if (timeUp) void send({ type: 'session:check' }).catch(() => undefined);
  }, [timeUp]);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 13, color: '#57606a' }}>Focusing on</div>
      <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{session.goal}</div>
      <div
        style={{ fontSize: 36, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}
        aria-live="off"
      >
        {formatCountdown(left)}
      </div>
      <div style={{ fontSize: 12, color: '#57606a', textAlign: 'center' }}>
        {session.plannedMinutes} min session · ends at{' '}
        {new Date(session.plannedEnd).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </div>
      <button
        type="button"
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
    </div>
  );
}

function LastSession({ session }: { session: FinishedSession }) {
  const mins = session.minutesByCategory;
  const actual = Math.round((session.actualEnd - session.start) / 60_000);
  const checkIn = formatCheckIn(session.checkIn);
  return (
    <div style={{ fontSize: 12, color: '#57606a', marginTop: 10 }}>
      Last session: {actual} of {session.plannedMinutes} min
      {session.endedEarly ? ' (ended early)' : ''} · study {mins.study} · neutral {mins.neutral} ·
      distraction {mins.distraction} min · {session.distractionVisits} distraction visit
      {session.distractionVisits === 1 ? '' : 's'}
      {checkIn && ` · ${checkIn}`}
    </div>
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
    return (
      <section style={{ marginTop: 12 }}>
        <CheckIn key={pending.id} session={pending} onClosed={reload} />
      </section>
    );
  }
  return (
    <section style={{ marginTop: 12 }}>
      {active ? <RunningSession session={active} /> : <StartForm />}
      {!active && last && <LastSession session={last} />}
    </section>
  );
}
