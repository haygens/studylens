import { describe, expect, it } from 'vitest';
import {
  badgeText,
  createSession,
  formatCountdown,
  isValidDuration,
  normalizeGoal,
  type ActiveSession,
} from './session';

const T0 = Date.UTC(2026, 10, 15, 14, 0, 0);
const MIN = 60_000;

describe('session helpers', () => {
  it('normalizes the goal and rejects empty goals', () => {
    expect(normalizeGoal('  Finish   problem set 3 ')).toBe('Finish problem set 3');
    expect(normalizeGoal('   ')).toBeNull();
    expect(normalizeGoal('x'.repeat(500))).toHaveLength(200);
  });

  it('accepts whole minutes from 5 to 180', () => {
    for (const m of [5, 25, 50, 180]) expect(isValidDuration(m)).toBe(true);
    for (const m of [0, 4, 181, 25.5, NaN, -25]) expect(isValidDuration(m)).toBe(false);
  });

  it('creates a session with its planned end', () => {
    expect(createSession(' Read ch. 4 ', 25, T0, 'id-1')).toEqual({
      id: 'id-1',
      goal: 'Read ch. 4',
      plannedMinutes: 25,
      start: T0,
      plannedEnd: T0 + 25 * MIN,
      // Assigned by the session controller when the session starts (P8).
      condition: null,
      // Friction countdowns (P9), counted while the session runs.
      frictionShown: 0,
      frictionContinued: 0,
      frictionTurnedBack: 0,
    });
    expect(createSession('', 25, T0, 'id')).toBe('invalid-goal');
    expect(createSession('Read', 200, T0, 'id')).toBe('invalid-duration');
  });

  it('shows whole minutes left on the badge, rounded up', () => {
    const s = createSession('Read', 25, T0, 'id') as ActiveSession;
    expect(badgeText(s, T0)).toBe('25');
    expect(badgeText(s, T0 + 1)).toBe('25');
    expect(badgeText(s, T0 + MIN)).toBe('24');
    expect(badgeText(s, T0 + 24 * MIN + 59_000)).toBe('1');
    expect(badgeText(s, T0 + 25 * MIN)).toBe('');
    expect(badgeText(null, T0)).toBe('');
  });

  it('formats the countdown', () => {
    expect(formatCountdown(25 * MIN)).toBe('25:00');
    expect(formatCountdown(61_500)).toBe('1:02');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
    expect(formatCountdown(90 * MIN)).toBe('1:30:00');
  });
});

describe('createSession with test seconds (E2E build only)', () => {
  it('uses seconds and skips the minutes check', () => {
    const s = createSession('Read', 0, T0, 'id', 30) as ActiveSession;
    expect(s.plannedEnd).toBe(T0 + 30_000);
    expect(s.plannedMinutes).toBe(0.5);
  });

  it('still requires a goal', () => {
    expect(createSession(' ', 25, T0, 'id', 30)).toBe('invalid-goal');
  });
});
