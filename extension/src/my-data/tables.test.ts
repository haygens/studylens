import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FocusSession } from '../sessions/session';
import {
  activeSession,
  activityByDay,
  describeCheckIn,
  formatClock,
  formatDay,
  formatDuration,
  formatMinutes,
  recordingNow,
  sessionRows,
  siteLabels,
} from './tables';

beforeEach(() => {
  process.env.TZ = 'America/Los_Angeles';
});
afterEach(() => {
  delete process.env.TZ;
});

/** Local time (Los Angeles) on a day in November 2026. */
const at = (d: number, h: number, m = 0, s = 0) => new Date(2026, 10, d, h, m, s).getTime();

describe('formatting', () => {
  it('formats clock, day, duration and minutes', () => {
    expect(formatClock(at(16, 9, 5, 3))).toBe('9:05:03 AM');
    expect(formatClock(at(16, 0, 0))).toBe('12:00:00 AM');
    expect(formatClock(at(16, 13, 30))).toBe('1:30:00 PM');
    expect(formatDay('2026-11-16')).toBe('Mon, Nov 16, 2026');
    expect(formatDay(at(16, 23))).toBe('Mon, Nov 16, 2026');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(185_000)).toBe('3m 05s');
    expect(formatDuration(3_720_000)).toBe('1h 02m');
    expect(formatDuration(-5)).toBe('0s');
    expect(formatMinutes(25)).toBe('25 min');
    expect(formatMinutes(25 / 60)).toBe('0.4 min');
  });
});

describe('activityByDay', () => {
  it('groups by day (newest first), sorts records and skips other keys', () => {
    const days = activityByDay({
      'activity:2026-11-15': [{ hostname: 'a.com', start: at(15, 10), end: at(15, 10, 1) }],
      'activity:2026-11-16': [
        { hostname: 'youtube.com', start: at(16, 9, 10), end: at(16, 9, 12, 30) },
        { hostname: 'en.wikipedia.org', start: at(16, 9), end: at(16, 9, 10) },
        { broken: true },
      ],
      'activity:2026-11-14': [],
      'sessions:history': [],
    });
    expect(days.map((d) => d.day)).toEqual(['2026-11-16', '2026-11-15']);
    expect(days[0]).toEqual({
      day: '2026-11-16',
      label: 'Mon, Nov 16, 2026',
      total: '12m 30s',
      rows: [
        {
          hostname: 'en.wikipedia.org',
          start: '9:00:00 AM',
          end: '9:10:00 AM',
          duration: '10m 00s',
        },
        { hostname: 'youtube.com', start: '9:10:00 AM', end: '9:12:30 AM', duration: '2m 30s' },
      ],
    });
  });

  it('describes the site being recorded right now', () => {
    expect(
      recordingNow({ 'tracker:state': { open: { hostname: 'x.com', start: at(16, 14) } } }),
    ).toBe('x.com since 2:00:00 PM');
    expect(recordingNow({ 'tracker:state': { open: null } })).toBeNull();
    expect(recordingNow({})).toBeNull();
  });
});

const finished = (over: Partial<FocusSession>): FocusSession => ({
  id: 's1',
  goal: 'Read ch. 4',
  plannedMinutes: 25,
  start: at(16, 9),
  plannedEnd: at(16, 9, 25),
  actualEnd: at(16, 9, 25),
  endedEarly: false,
  minutesByCategory: { study: 20, neutral: 3.5, distraction: 1.5 },
  distractionVisits: 2,
  condition: null,
  frictionShown: 0,
  frictionContinued: 0,
  frictionTurnedBack: 0,
  checkIn: null,
  ...over,
});

describe('sessionRows', () => {
  it('names each research condition, including opted out', () => {
    const rows = sessionRows({
      'sessions:history': [
        finished({ id: 'a', condition: 'control' }),
        finished({ id: 'b', condition: 'friction' }),
        finished({ id: 'c', condition: 'intention' }),
        finished({ id: 'd', condition: 'opted-out' }),
        finished({ id: 'e', condition: 'bogus' as never }),
      ],
    });
    expect(rows.map((r) => r.condition)).toEqual([
      'None (research interventions not active)',
      'Opted out (research interventions off)',
      'Intention ("What did you come here for?")',
      'Friction (short countdown)',
      'Control (no intervention)',
    ]);
  });

  it('shows every field in words, newest first', () => {
    const rows = sessionRows({
      'sessions:history': [
        finished({ checkIn: { goalCompleted: 'partly', focusRating: 4, answeredAt: 0 } }),
        finished({
          id: 's2',
          start: at(16, 10),
          actualEnd: at(16, 10, 10),
          endedEarly: true,
          checkIn: { skipped: true, reason: 'expired', answeredAt: 0 },
        }),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['s2', 's1']);
    expect(rows[1]).toEqual({
      id: 's1',
      date: 'Mon, Nov 16, 2026 9:00:00 AM',
      goal: 'Read ch. 4',
      planned: '25 min',
      actual: '25 min',
      minutes: { study: '20 min', neutral: '3.5 min', distraction: '1.5 min' },
      distractionVisits: 2,
      checkIn: 'Goal finished: partly · Focus 4/5',
      condition: 'None (research interventions not active)',
      friction: '—',
    });
    expect(rows[0]).toMatchObject({
      actual: '10 min (ended early)',
      checkIn: 'Skipped (not answered within 12 hours)',
    });
  });

  it('explains every check-in state', () => {
    expect(describeCheckIn(null)).toBe('Not answered yet');
    expect(describeCheckIn({ skipped: true, reason: 'user', answeredAt: 0 })).toBe(
      'Skipped (you pressed Skip)',
    );
    expect(describeCheckIn({ skipped: true, reason: 'new-session', answeredAt: 0 })).toBe(
      'Skipped (a new session started first)',
    );
  });

  it('is empty with no history', () => {
    expect(sessionRows({})).toEqual([]);
  });
});

describe('labels and active session', () => {
  it('reads them from storage, ignoring malformed data', () => {
    expect(
      siteLabels({ 'categories:rules': [{ domain: 'YouTube.com', category: 'distraction' }, 7] }),
    ).toEqual([{ domain: 'youtube.com', category: 'distraction' }]);
    expect(activeSession({ 'sessions:active': { id: 'x' } })).toBeNull();
    expect(activeSession({})).toBeNull();
  });
});
