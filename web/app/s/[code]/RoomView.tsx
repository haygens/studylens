'use client';
/**
 * The live room (P18c), client side: polls GET /api/rooms/<code> every 15 s while the page is
 * visible, and ticks the shared timer every second using the server's clock. Read-only. Unknown or
 * expired codes show only a short message. No cookies, no third-party requests (P21: the only
 * storage is the room look, in RoomShell.tsx).
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ROOM_POLL_MS,
  type LiveRoom,
  type LiveRoomResponse,
  type RoomParticipant,
} from '@studylens/shared';
import {
  DEFAULT_LOOK,
  ROOM_LOOKS,
  isAway,
  lookStatusText,
  type LookId,
} from '@studylens/shared/room-looks';
import { formatClock, minutesLeftLabel, offsetFrom, participantLabel } from '@/lib/site/room-view';

type State =
  | { status: 'loading' }
  | { status: 'ready'; room: LiveRoom; offsetMs: number; stale: boolean }
  | { status: 'gone' }
  | { status: 'error' };

/** A status dot: lit while focusing, hollow when away or gone, filled softly when finished. */
function dotClass(p: RoomParticipant): string {
  if (p.status === 'finished') return 'dot dot-done';
  return p.status === 'focusing' && !isAway(p) ? 'dot dot-on' : 'dot dot-off';
}

function statusClass(p: RoomParticipant): string {
  if (p.status === 'finished') return 'status status-finished';
  return p.status === 'focusing' && !isAway(p) ? 'status status-focusing' : 'status status-away';
}

export function RoomDetails({
  room,
  now,
  look = DEFAULT_LOOK,
}: {
  room: LiveRoom;
  now: number;
  look?: LookId;
}) {
  const left = Math.max(0, room.endsAt - now);
  const running = room.state === 'running' && left > 0;
  const copy = ROOM_LOOKS[look];
  const clock = formatClock(running ? left : 0);
  const endsAt = new Date(room.endsAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <>
      <div className="room-board slm-fade-in">
        <p className="room-pill-line">
          <span className={running ? 'room-pill' : 'room-pill room-pill-ended'}>
            {running && (
              <span className="slm-live-dot" aria-hidden="true">
                ●
              </span>
            )}
            {running ? copy.pill : 'Session complete'}
          </span>
        </p>
        <h1 className="room-title">{room.groupName}</h1>
        {room.goal && <p className="room-goal">Goal: {room.goal}</p>}
        <p
          className="room-timer"
          role="timer"
          aria-label={running ? minutesLeftLabel(left) : 'Time is up'}
        >
          <span key={clock} className="slm-tick">
            {clock}
          </span>
        </p>
        <p className="room-ends">
          {running
            ? `Ends at ${endsAt} · ${room.plannedMinutes} min session`
            : `Ended at ${endsAt}`}
        </p>
      </div>
      <section className="room-people slm-slide-up" aria-labelledby="people-title">
        <h2 id="people-title">{copy.listTitle}</h2>
        <ul className="people" aria-label={`Participants in ${room.groupName}`}>
          {room.participants.map((p, i) => (
            <li key={i}>
              <span className="person">
                <span className={dotClass(p)} aria-hidden="true" />
                {participantLabel(p)}
              </span>
              <span className={statusClass(p)}>{lookStatusText(look, p)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function RoomView({ code, look }: { code: string; look: LookId }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (res.status === 404) return setState({ status: 'gone' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as LiveRoomResponse;
      setState({
        status: 'ready',
        room: body.room,
        offsetMs: offsetFrom(sentAt, Date.now(), body.serverNow),
        stale: false,
      });
    } catch {
      // Keep showing the last update (marked as not current); otherwise a short error.
      setState((old) => (old.status === 'ready' ? { ...old, stale: true } : { status: 'error' }));
    }
  }, [code]);

  const done =
    state.status === 'gone' || (state.status === 'ready' && state.room.state === 'ended');

  // Poll every 15 s while visible; stop once the session is over or the link is gone.
  useEffect(() => {
    if (done) return;
    const first = setTimeout(() => void load(), 0);
    const whenVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(whenVisible, ROOM_POLL_MS);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [load, done]);

  // The timer ticks every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (state.status === 'loading') {
    return (
      <p className="room-note" role="status">
        Loading the room…
      </p>
    );
  }
  if (state.status === 'gone') {
    return (
      <div className="card room-card" role="status">
        <h1>This room link has expired or doesn’t exist.</h1>
        <p style={{ marginBottom: 0 }}>
          Room links work until one hour after the group session ends.{' '}
          <Link href="/">What is StudyLens?</Link>
        </p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="card room-card" role="alert">
        <h1>The room couldn’t load.</h1>
        <p style={{ marginBottom: 0 }}>Check your connection; it will try again in a moment.</p>
      </div>
    );
  }
  return (
    <>
      <RoomDetails room={state.room} now={now + state.offsetMs} look={look} />
      {state.stale && (
        <p className="room-note" role="status">
          Couldn’t refresh just now. Showing the last update.
        </p>
      )}
    </>
  );
}
