/**
 * Live group sessions (P18b): pure helpers for showing them — time left, each participant's
 * status in words (never by color alone), and the summary. No browser APIs.
 */
import {
  formatFocusMinutes,
  toLocalTime,
  type LiveParticipant,
  type LiveSession,
} from '@studylens/shared';

/** Milliseconds left until the shared end, in this browser's clock. */
export function liveRemainingMs(session: LiveSession, offsetMs: number, now: number): number {
  return Math.max(0, toLocalTime(session.endsAt, offsetMs) - now);
}

/** "12 min left" (rounded up), "less than a minute left", "ending now". */
export function timeLeftText(ms: number): string {
  if (ms <= 0) return 'ending now';
  if (ms < 60_000) return 'less than a minute left';
  return `${Math.ceil(ms / 60_000)} min left`;
}

/** "3:45 PM" in the user's locale. */
export function clockTime(localMs: number): string {
  return new Date(localMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * A participant's status in words: "Focusing", "Focusing · not seen for a few minutes",
 * "Finished · 25 min", "Left early · 10 min", "… · minutes not shared".
 */
export function participantText(p: LiveParticipant): string {
  const minutes =
    p.focusMinutes === null ? 'minutes not shared' : formatFocusMinutes(p.focusMinutes);
  switch (p.status) {
    case 'focusing':
      return p.recentlySeen ? 'Focusing' : 'Focusing · not seen for a few minutes';
    case 'finished':
      return `Finished · ${minutes}`;
    case 'left':
      return `Left early · ${minutes}`;
  }
}

/** "Sam (you, started it)". */
export function participantName(p: LiveParticipant): string {
  const tags = [p.isMe && 'you', p.isHost && 'started it'].filter(Boolean);
  return tags.length ? `${p.displayName} (${tags.join(', ')})` : p.displayName;
}

/** "3 focusing" / "1 focusing" for a session card's heading. */
export function focusingCount(session: LiveSession): string {
  const n = session.participants.filter((p) => p.status === 'focusing').length;
  return `${n} focusing`;
}

/**
 * What a member may do with a running session: join it, it's the one I'm in, or nothing (left it
 * / another local session runs).
 */
export type LiveAction = 'join' | 'in-it' | 'left' | 'busy';

export function liveAction(
  session: LiveSession,
  localSession: { groupSessionId: string | null } | null,
): LiveAction {
  if (session.me === 'left') return 'left';
  if (session.me === 'focusing') return 'in-it';
  return localSession ? 'busy' : 'join';
}

/** The summary heading: "Session complete!" once it is over, else that it still runs. */
export function summaryTitle(session: LiveSession): string {
  return session.state === 'ended' ? 'Session complete!' : 'The group session is still running';
}
