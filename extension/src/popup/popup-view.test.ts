import { describe, expect, it } from 'vitest';
import type { FocusSession } from '../sessions/session';
import {
  categoryTotals,
  checkInBlockReason,
  formatWholeMinutes,
  lastSessionSummary,
  sessionProgress,
  startBlockReason,
  type StartFormState,
} from './popup-view';

const MIN = 60_000;
const ready: StartFormState = {
  gate: 'open',
  goal: 'Problem set 3',
  minutes: 25,
  testSeconds: null,
  busy: false,
};

describe('startBlockReason', () => {
  it('is null when the session can start', () => {
    expect(startBlockReason(ready)).toBeNull();
    expect(startBlockReason({ ...ready, minutes: 0, testSeconds: 30 })).toBeNull();
  });

  it('explains every reason the Start button is disabled', () => {
    expect(startBlockReason({ ...ready, gate: 'blocked' })).toMatch(/research notice/);
    expect(startBlockReason({ ...ready, gate: 'loading' })).toMatch(/Loading/);
    expect(startBlockReason({ ...ready, goal: '   ' })).toMatch(/Write what you’ll work on/);
    expect(startBlockReason({ ...ready, minutes: 2 })).toMatch(/5 to 180 minutes/);
    expect(startBlockReason({ ...ready, minutes: 2.5 })).toMatch(/5 to 180 minutes/);
    expect(startBlockReason({ ...ready, busy: true })).toMatch(/Starting/);
  });

  it('puts the research notice first', () => {
    expect(startBlockReason({ ...ready, gate: 'blocked', goal: '' })).toMatch(/research notice/);
  });
});

describe('checkInBlockReason', () => {
  it('says which answer is missing', () => {
    expect(checkInBlockReason(true, true)).toBeNull();
    expect(checkInBlockReason(false, false)).toMatch(/both questions/);
    expect(checkInBlockReason(true, false)).toMatch(/how focused/);
    expect(checkInBlockReason(false, true)).toMatch(/Yes, Partly or No/);
  });
});

describe('formatWholeMinutes', () => {
  it('uses whole minutes with a unit', () => {
    expect(formatWholeMinutes(0)).toBe('<1 min');
    expect(formatWholeMinutes(20_000)).toBe('<1 min');
    expect(formatWholeMinutes(31_000)).toBe('1 min');
    expect(formatWholeMinutes(12 * MIN)).toBe('12 min');
    expect(formatWholeMinutes(60 * MIN)).toBe('1 h');
    expect(formatWholeMinutes(65 * MIN)).toBe('1 h 5 min');
  });
});

describe('categoryTotals', () => {
  it('sums today per category', () => {
    expect(
      categoryTotals([
        { category: 'study', ms: 3 },
        { category: 'study', ms: 4 },
        { category: 'distraction', ms: 2 },
      ]),
    ).toEqual({ study: 7, neutral: 0, distraction: 2 });
    expect(categoryTotals([])).toEqual({ study: 0, neutral: 0, distraction: 0 });
  });
});

describe('lastSessionSummary', () => {
  const base: FocusSession = {
    id: 's1',
    goal: 'Read',
    plannedMinutes: 25,
    start: 0,
    plannedEnd: 25 * MIN,
    actualEnd: 25 * MIN,
    endedEarly: false,
    condition: 'control',
    minutesByCategory: { study: 20, neutral: 3, distraction: 2 },
    distractionVisits: 1,
    checkIn: { goalCompleted: 'yes', focusRating: 4, answeredAt: 26 * MIN },
    frictionShown: 0,
    frictionContinued: 0,
    frictionTurnedBack: 0,
    intentionShown: 0,
    intentionContinued: 0,
    intentionTurnedBack: 0,
  };

  it('is one short line', () => {
    expect(lastSessionSummary(base)).toBe('Last session: 25 of 25 min · Finished: yes · Focus 4/5');
  });

  it('handles very short, early-ended and fractional test sessions', () => {
    expect(
      lastSessionSummary({
        ...base,
        plannedMinutes: 1 / 3,
        actualEnd: 10_000,
        endedEarly: true,
        checkIn: { skipped: true, reason: 'user', answeredAt: 0 },
      }),
    ).toBe('Last session: <1 of <1 min (ended early) · Check-in skipped');
    expect(lastSessionSummary({ ...base, checkIn: null })).toBe('Last session: 25 of 25 min');
  });
});

describe('sessionProgress', () => {
  it('is the share already done, clamped to 0–1', () => {
    expect(sessionProgress(100, 100)).toBe(0);
    expect(sessionProgress(100, 25)).toBe(0.75);
    expect(sessionProgress(100, 0)).toBe(1);
    expect(sessionProgress(100, 200)).toBe(0);
    expect(sessionProgress(0, 0)).toBe(1);
  });
});
