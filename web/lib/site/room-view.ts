/** P18c: pure helpers for the live room page (/s/<code>), so they are unit-testable. */
import type { RoomParticipant } from '@studylens/shared';

/** Server clock minus this browser's clock, from one request (the middle of it is "now"). */
export function offsetFrom(sentAt: number, receivedAt: number, serverNow: number): number {
  return Math.round(serverNow - (sentAt + receivedAt) / 2);
}

/** "12:05" or "1:02:03" (rounded up to the second). */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "12 minutes left" for screen readers (updated once a minute, not every second). */
export function minutesLeftLabel(ms: number): string {
  if (ms <= 0) return 'Time is up';
  const minutes = Math.ceil(ms / 60_000);
  return minutes === 1 ? '1 minute left' : `${minutes} minutes left`;
}

/** A participant's status in words (never by color alone). */
export function statusText(p: RoomParticipant): string {
  switch (p.status) {
    case 'focusing':
      return p.recentlySeen ? 'Focusing' : 'Focusing · not seen for a few minutes';
    case 'finished':
      return 'Finished';
    case 'left':
      return 'Left early';
  }
}

export function participantLabel(p: RoomParticipant): string {
  return p.isHost ? `${p.displayName} (started it)` : p.displayName;
}
