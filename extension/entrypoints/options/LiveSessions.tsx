/**
 * "Live group sessions" on the Study groups tab (P18b). Any member starts one for a group
 * (optional goal the group sees, 25 / 50 / custom 5–180 minutes); the others see it here and in
 * the popup and can join, late if they like. Everyone shares the server's end time. The
 * participants list (focusing / finished / left) refreshes every 15 s while this page is open
 * and visible. When it's over, a shared "Session complete!" card lists everyone's minutes — only
 * for members who share focus minutes in that group.
 *
 * Sends: the goal (optional) and length when starting; that I joined or left; a heartbeat from
 * the background while my group session runs. Never sites, labels, conditions or check-ins.
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  LIVE_GOAL_MAX_LENGTH,
  LIVE_MAX_MINUTES,
  LIVE_MIN_MINUTES,
  LIVE_PRESET_MINUTES,
  isLiveMinutes,
  toLocalTime,
  type GroupSummary,
  type LiveSession,
} from '@studylens/shared';
import { failureText } from '@/src/groups/api-client';
import { groupDeps } from '@/src/groups/browser-groups';
import { loadGroupDevice } from '@/src/groups/group-store';
import { joinLiveSession, startLiveSession } from '@/src/groups/live';
import {
  clockTime,
  focusingCount,
  liveAction,
  liveRemainingMs,
  timeLeftText,
} from '@/src/groups/live-view';
import type { ServerAccess } from '@/src/groups/permission';
import { localStore } from '@/src/background/browser-adapter';
import { E2E_BUILD_MARKER, MAX_TEST_SECONDS } from '@/src/e2e/test-seconds';
import { loadSessions } from '@/src/storage/sessions-store';
import type { FocusSession } from '@/src/sessions/session';
import {
  LiveSummary,
  ParticipantList,
  RoomLink,
  beginDeps,
  beginErrorText,
  leaveLocalSession,
  useActiveSession,
  useLiveSessions,
  useSecondTick,
} from '@/src/ui/live';
import { LookPill, LookStrip, useLook } from '@/src/ui/live-look';
import { ActivityConsentNote, ensureActivityConsent } from './GroupActivity';

const h2 = { margin: 0, fontSize: 'var(--sl-fs-h2)' } as const;
/** The Study groups tab shows the summary of my last group session for this long after it. */
const SUMMARY_WINDOW_MS = 12 * 60 * 60_000;

function LiveCard({
  session,
  offsetMs,
  access,
  setAccess,
  onChanged,
}: {
  session: LiveSession;
  offsetMs: number;
  access: ServerAccess | null;
  setAccess: (a: ServerAccess) => void;
  onChanged: () => void;
}) {
  const now = useSecondTick();
  const look = useLook();
  const active = useActiveSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = liveAction(
    session,
    active ? { groupSessionId: active.group?.sessionId ?? null } : null,
  );
  const mineHere = active?.group?.sessionId === session.id;
  const left = liveRemainingMs(session, offsetMs, now);

  function join() {
    // The Firefox prompt (if needed) must start in this click, before anything else.
    const consent = ensureActivityConsent(access, true, setAccess);
    setError(null);
    void consent.then(async (ok) => {
      if (!ok) return setError('Firefox didn’t allow sharing focus activity, so nothing was sent.');
      setBusy(true);
      const res = await joinLiveSession(beginDeps, session.id);
      setBusy(false);
      if (!res.ok) setError(beginErrorText(res));
      onChanged();
    });
  }

  async function leave() {
    setBusy(true);
    setError(null);
    // Tell the server right away, so this list is right on the next refresh.
    const device = await loadGroupDevice(localStore);
    const res = device ? await groupDeps.client.leaveLive(device.token, session.id) : null;
    if (mineHere) {
      // End my local session early. The background also tells the server (a harmless repeat
      // when the request above worked; it is retried later if offline).
      await leaveLocalSession().catch(() => undefined);
    } else if (res && !res.ok) {
      setError(failureText(res));
    }
    setBusy(false);
    onChanged();
  }

  return (
    <section
      className="sl-card sl-look slm-slide-up"
      data-look={look}
      style={{ marginTop: 12 }}
      aria-label={`Live session in ${session.groupName}`}
    >
      <LookStrip look={look} />
      <div className="sl-row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 className="sl-look-title">
          <LookPill look={look} /> {session.groupName}
        </h3>
        <span className="sl-muted">
          Ends at {clockTime(toLocalTime(session.endsAt, offsetMs))} · {timeLeftText(left)}
        </span>
      </div>
      {session.goal && <p style={{ margin: '6px 0 0' }}>Goal: {session.goal}</p>}
      <p className="sl-muted" style={{ margin: '6px 0 0' }}>
        {session.plannedMinutes} min session · {focusingCount(session)}
      </p>
      <ParticipantList session={session} look={look} />
      {session.roomCode && <RoomLink roomCode={session.roomCode} groupName={session.groupName} />}
      <div className="sl-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        {action === 'join' && (
          <button type="button" className="sl-btn-primary" disabled={busy} onClick={join}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        )}
        {action === 'in-it' && (
          <>
            <span className="sl-chip sl-chip-study">You’re in this session</span>
            <button
              type="button"
              className="sl-btn-quiet"
              disabled={busy}
              onClick={() => void leave()}
            >
              Leave session
            </button>
          </>
        )}
        {action === 'left' && <span className="sl-muted">You left this session.</span>}
        {action === 'busy' && (
          <span className="sl-muted">A focus session is running here. End it first to join.</span>
        )}
      </div>
      {error && (
        <p role="alert" className="sl-error" style={{ margin: '8px 0 0' }}>
          {error}
        </p>
      )}
    </section>
  );
}

function StartLiveForm({
  groups,
  access,
  setAccess,
  onStarted,
}: {
  groups: GroupSummary[];
  access: ServerAccess | null;
  setAccess: (a: ServerAccess) => void;
  onStarted: () => void;
}) {
  const active = useActiveSession();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [goal, setGoal] = useState('');
  const [choice, setChoice] = useState<number | 'custom'>(25);
  const [custom, setCustom] = useState('30');
  const [testSeconds, setTestSeconds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  // A group whose session just started disappears from the list: fall back to the first one.
  const selected = groups.some((g) => g.id === groupId) ? groupId : (groups[0]?.id ?? '');

  const minutes = choice === 'custom' ? Number(custom) : choice;
  // E2E test build only (compiled away otherwise): a length in seconds.
  const seconds = __STUDYLENS_E2E__ && testSeconds ? Number(testSeconds) : null;
  const lengthOk = seconds !== null || isLiveMinutes(minutes);
  const running = active !== null && active !== undefined;
  const canStart = !busy && !running && lengthOk && selected !== '';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    const consent = ensureActivityConsent(access, true, setAccess);
    setError(null);
    void consent.then(async (ok) => {
      if (!ok) return setError('Firefox didn’t allow sharing focus activity, so nothing was sent.');
      setBusy(true);
      const res = await startLiveSession(
        beginDeps,
        selected,
        goal,
        isLiveMinutes(minutes) ? minutes : LIVE_PRESET_MINUTES[0],
        seconds,
      );
      setBusy(false);
      if (!res.ok) return setError(beginErrorText(res));
      setGoal('');
      onStarted();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Start a group session"
      style={{ marginTop: 12, display: 'grid', gap: 8 }}
    >
      <h3 style={{ margin: 0, fontSize: 'var(--sl-fs-body)' }}>Start a group session</h3>
      {groups.length > 1 ? (
        <label className="sl-field">
          Group
          <select value={selected} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="sl-muted" style={{ margin: 0 }}>
          For “{groups[0]?.name}”
        </p>
      )}
      <label className="sl-field">
        Goal (optional, your group sees it)
        <input
          type="text"
          value={goal}
          maxLength={LIVE_GOAL_MAX_LENGTH}
          placeholder="e.g. Chapter 4 problems"
          onChange={(e) => setGoal(e.target.value)}
        />
      </label>
      <fieldset className="sl-field">
        <legend>How long?</legend>
        <div className="sl-seg">
          {LIVE_PRESET_MINUTES.map((m) => (
            <label key={m}>
              <input
                type="radio"
                name={`${id}-length`}
                checked={choice === m}
                onChange={() => setChoice(m)}
              />
              <span>{m} min</span>
            </label>
          ))}
          <label>
            <input
              type="radio"
              name={`${id}-length`}
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
              min={LIVE_MIN_MINUTES}
              max={LIVE_MAX_MINUTES}
              step={1}
              value={custom}
              style={{ width: 80 }}
              aria-label="Custom group session length in minutes"
              onChange={(e) => setCustom(e.target.value)}
            />
            minutes ({LIVE_MIN_MINUTES}–{LIVE_MAX_MINUTES})
          </label>
        )}
      </fieldset>
      {__STUDYLENS_E2E__ && (
        <label
          className="sl-small"
          style={{ color: 'var(--sl-warn)' }}
          data-testid={E2E_BUILD_MARKER}
        >
          Group test length in seconds (E2E build only){' '}
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
      <div>
        <button type="submit" className="sl-btn-primary" disabled={!canStart}>
          {busy ? 'Starting…' : 'Start group session'}
        </button>
      </div>
      {running && (
        <p className="sl-muted" role="note" style={{ margin: 0 }}>
          A focus session is running here. End it first to start a group session.
        </p>
      )}
      {!lengthOk && (
        <p className="sl-muted" role="note" style={{ margin: 0 }}>
          Pick {LIVE_MIN_MINUTES}–{LIVE_MAX_MINUTES} minutes.
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

/** My most recent group session, if it ended in the last 12 hours (for its summary card). */
function useRecentGroupSession(): FocusSession | null {
  const active = useActiveSession();
  const [recent, setRecent] = useState<FocusSession | null>(null);
  useEffect(() => {
    void loadSessions(localStore).then((history) => {
      const last = [...history].reverse().find((s) => s.group);
      setRecent(last && Date.now() - last.actualEnd < SUMMARY_WINDOW_MS ? last : null);
    });
  }, [active]);
  return recent;
}

export default function LiveSessions({
  groups,
  access,
  setAccess,
}: {
  groups: GroupSummary[];
  access: ServerAccess | null;
  setAccess: (a: ServerAccess) => void;
}) {
  const { state, refresh } = useLiveSessions(groups.length > 0);
  const recent = useRecentGroupSession();
  if (groups.length === 0 || state.status === 'off') return null;

  const sessions = state.status === 'ready' ? state.sessions : [];
  const offsetMs = state.status === 'ready' ? state.offsetMs : 0;
  const busyGroups = new Set(sessions.map((s) => s.groupId));
  const free = groups.filter((g) => !busyGroups.has(g.id));
  const recentShown = recent?.group && !sessions.some((s) => s.id === recent.group!.sessionId);

  return (
    <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-live-title">
      <h2 id="sl-live-title" style={h2}>
        Live group sessions
      </h2>
      <p className="sl-muted" style={{ margin: '6px 0 0' }}>
        Focus together: everyone who joins gets the same timer and sees who’s focusing, finished or
        left. Your sites, labels and check-in answers are never shared.
      </p>
      <ActivityConsentNote access={access} />
      {state.status === 'loading' && (
        <p className="sl-muted" role="status" style={{ margin: '8px 0 0' }}>
          Loading live sessions…
        </p>
      )}
      {state.status === 'error' && (
        <p className="sl-muted" role="status" style={{ margin: '8px 0 0' }}>
          Live sessions couldn’t load: {failureText(state.failure)} Trying again every 15 seconds.
        </p>
      )}
      {state.status === 'ready' && state.failure && (
        <p className="sl-muted" role="status" style={{ margin: '8px 0 0' }}>
          Couldn’t refresh: {failureText(state.failure)} Showing the last update.
        </p>
      )}
      {sessions.map((s) => (
        <LiveCard
          key={s.id}
          session={s}
          offsetMs={offsetMs}
          access={access}
          setAccess={setAccess}
          onChanged={refresh}
        />
      ))}
      {state.status === 'ready' && free.length > 0 && (
        <StartLiveForm groups={free} access={access} setAccess={setAccess} onStarted={refresh} />
      )}
      {recentShown && recent.group && (
        <div style={{ marginTop: 12 }}>
          <LiveSummary sessionId={recent.group.sessionId} />
        </div>
      )}
    </section>
  );
}
