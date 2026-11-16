import { describe, expect, it } from 'vitest';
import {
  CHECK_IN_EXPIRY_MS,
  applyAutoSkips,
  checkInBadge,
  formatCheckIn,
  pendingCheckIn,
  recordCheckIn,
  toCheckIn,
} from './check-in';
import type { ActiveSession, FocusSession } from './session';

const T0 = Date.UTC(2026, 10, 16, 15, 0, 0);
const MIN = 60_000;

function session(id: string, endMin: number, checkIn: FocusSession['checkIn'] = null) {
  const s: FocusSession = {
    id,
    goal: `goal ${id}`,
    plannedMinutes: 25,
    start: T0 + (endMin - 25) * MIN,
    plannedEnd: T0 + endMin * MIN,
    actualEnd: T0 + endMin * MIN,
    endedEarly: false,
    minutesByCategory: { study: 20, neutral: 5, distraction: 0 },
    distractionVisits: 0,
    condition: null,
    checkIn,
  };
  return s;
}

const answered = { goalCompleted: 'yes', focusRating: 5, answeredAt: T0 } as const;
const active: ActiveSession = {
  id: 'run',
  goal: 'now',
  plannedMinutes: 25,
  start: T0,
  plannedEnd: T0 + 25 * MIN,
};

describe('pendingCheckIn', () => {
  it('is the latest session while it is unanswered', () => {
    const history = [session('a', 0, answered), session('b', 30)];
    expect(pendingCheckIn(history, null, T0 + 31 * MIN)?.id).toBe('b');
    expect(checkInBadge(history, null, T0 + 31 * MIN)).toBe('?');
  });

  it('only ever offers the most recent session, never an older unanswered one', () => {
    const history = [session('a', 0), session('b', 30, answered)];
    expect(pendingCheckIn(history, null, T0 + 31 * MIN)).toBeNull();
    expect(checkInBadge(history, null, T0 + 31 * MIN)).toBe('');
  });

  it('is null while a session is running, with no history, or once answered', () => {
    expect(pendingCheckIn([session('b', 30)], active, T0 + 31 * MIN)).toBeNull();
    expect(pendingCheckIn([], null, T0)).toBeNull();
    expect(pendingCheckIn([session('b', 30, answered)], null, T0 + 31 * MIN)).toBeNull();
  });

  it('expires exactly 12 hours after the session ended', () => {
    const history = [session('b', 0)];
    expect(pendingCheckIn(history, null, T0 + CHECK_IN_EXPIRY_MS - 1)?.id).toBe('b');
    expect(pendingCheckIn(history, null, T0 + CHECK_IN_EXPIRY_MS)).toBeNull();
  });
});

describe('applyAutoSkips', () => {
  it('returns null when nothing needs skipping', () => {
    expect(
      applyAutoSkips([session('a', 0, answered), session('b', 30)], T0 + 31 * MIN, false),
    ).toBeNull();
    expect(applyAutoSkips([], T0, true)).toBeNull();
  });

  it('skips the latest check-in after 12 hours as expired', () => {
    const now = T0 + CHECK_IN_EXPIRY_MS;
    const result = applyAutoSkips([session('b', 0)], now, false);
    expect(result?.[0]?.checkIn).toEqual({ skipped: true, reason: 'expired', answeredAt: now });
  });

  it('skips the waiting check-in when a new session starts', () => {
    const result = applyAutoSkips([session('a', 0, answered), session('b', 30)], T0 + HOUR(), true);
    expect(result?.[0]?.checkIn).toBe(answered);
    expect(result?.[1]?.checkIn).toEqual({
      skipped: true,
      reason: 'new-session',
      answeredAt: T0 + HOUR(),
    });
  });

  it('skips older unanswered sessions (e.g. data from before P5) and keeps the latest pending', () => {
    const result = applyAutoSkips([session('a', 0), session('b', 30)], T0 + 31 * MIN, false);
    expect(result?.[0]?.checkIn).toMatchObject({ skipped: true, reason: 'new-session' });
    expect(result?.[1]?.checkIn).toBeNull();
  });

  it('does not change the input array', () => {
    const history = [session('b', 0)];
    applyAutoSkips(history, T0, true);
    expect(history[0]?.checkIn).toBeNull();
  });
});

function HOUR() {
  return 60 * MIN;
}

describe('toCheckIn (validation)', () => {
  it('accepts valid answers and stamps the time', () => {
    expect(toCheckIn({ kind: 'answer', goalCompleted: 'partly', focusRating: 4 }, T0)).toEqual({
      goalCompleted: 'partly',
      focusRating: 4,
      answeredAt: T0,
    });
  });

  it('turns Skip into a user skip', () => {
    expect(toCheckIn({ kind: 'skip' }, T0)).toEqual({
      skipped: true,
      reason: 'user',
      answeredAt: T0,
    });
  });

  it.each([
    ['missing goal', undefined, 3],
    ['boolean goal', true, 3],
    ['unknown goal', 'maybe', 3],
    ['rating 0', 'yes', 0],
    ['rating 6', 'yes', 6],
    ['fractional rating', 'yes', 3.5],
    ['string rating', 'yes', '3'],
    ['missing rating', 'yes', undefined],
  ])('rejects %s', (_name, goalCompleted, focusRating) => {
    expect(toCheckIn({ kind: 'answer', goalCompleted, focusRating }, T0)).toBeNull();
  });
});

describe('recordCheckIn', () => {
  const history = [session('a', 0, answered), session('b', 30)];
  const now = T0 + 40 * MIN;

  it('saves the answer on the pending session only', () => {
    const result = recordCheckIn(
      history,
      'b',
      { kind: 'answer', goalCompleted: 'no', focusRating: 2 },
      now,
    );
    expect(Array.isArray(result) && result[1]?.checkIn).toEqual({
      goalCompleted: 'no',
      focusRating: 2,
      answeredAt: now,
    });
    expect(Array.isArray(result) && result[0]).toBe(history[0]);
  });

  it('refuses a session that is not the pending one', () => {
    expect(recordCheckIn(history, 'a', { kind: 'skip' }, now)).toBe('not-pending');
    expect(recordCheckIn(history, 'zzz', { kind: 'skip' }, now)).toBe('not-pending');
  });

  it('refuses an answer after it expired', () => {
    expect(recordCheckIn(history, 'b', { kind: 'skip' }, T0 + 30 * MIN + CHECK_IN_EXPIRY_MS)).toBe(
      'not-pending',
    );
  });

  it('refuses invalid answers', () => {
    expect(
      recordCheckIn(history, 'b', { kind: 'answer', goalCompleted: 'yes', focusRating: 9 }, now),
    ).toBe('invalid-answer');
  });
});

describe('formatCheckIn', () => {
  it('formats answers, skips and missing check-ins', () => {
    expect(formatCheckIn({ goalCompleted: 'partly', focusRating: 4, answeredAt: T0 })).toBe(
      'Finished: partly · Focus 4/5',
    );
    expect(formatCheckIn({ skipped: true, reason: 'expired', answeredAt: T0 })).toBe(
      'Check-in skipped',
    );
    expect(formatCheckIn(null)).toBe('');
  });
});
