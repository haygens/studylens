import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_COUNTS } from '../interventions/interstitial';
import { logAttempt, resolveAttempt, type DistractionAttempt } from '../interventions/attempts';
import { NEW_SESSION_FIELDS, type FocusSession } from '../sessions/session';
import { STORAGE_KEYS } from '../storage/keys';
import {
  RESEARCH_COLUMNS,
  researchCsv,
  researchFileName,
  researchRow,
  researchRows,
} from './research-csv';

const MIN = 60_000;
/** Local time, so date/hour checks don't depend on the machine's time zone. */
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m, 17).getTime();
const PID = 'p-0a1b2c3d4e5f';
const GOAL = 'Secret goal text about my thesis';

function session(over: Partial<FocusSession> = {}): FocusSession {
  const start = over.start ?? at(23, 9, 41);
  return {
    id: 's',
    goal: GOAL,
    plannedMinutes: 25,
    start,
    plannedEnd: start + 25 * MIN,
    actualEnd: start + 25 * MIN,
    endedEarly: false,
    condition: 'control',
    minutesByCategory: { study: 20.04, neutral: 3, distraction: 1.96 },
    distractionVisits: 2,
    checkIn: { goalCompleted: 'partly', focusRating: 4, answeredAt: start + 26 * MIN },
    ...NO_COUNTS,
    distractionAttempts: 0,
    attempts: [],
    ...NEW_SESSION_FIELDS,
    sessionNumber: 1,
    labelSetVersion: 3,
    labelsLocked: true,
    ...over,
  };
}

/** A friction session with two attempts on named sites (continued after 11 s, back after 4 s). */
function frictionSession(): FocusSession {
  let s = session({
    id: 'f',
    condition: 'friction',
    sessionNumber: 2,
    start: at(23, 14, 5),
    frictionShown: 2,
    frictionContinued: 1,
    frictionTurnedBack: 1,
  });
  s = logAttempt(s, 'youtube.com', 'friction', s.start + MIN);
  s = resolveAttempt(s, 'youtube.com', 'continue', s.start + MIN + 11_000);
  s = logAttempt(s, 'reddit.com', 'friction', s.start + 2 * MIN);
  s = resolveAttempt(s, 'reddit.com', 'back', s.start + 2 * MIN + 4_000);
  return { ...s, actualEnd: s.start + 10 * MIN, endedEarly: true, checkIn: null };
}

describe('research CSV', () => {
  it('has exactly the columns the codebook documents, in order', () => {
    const codebook = readFileSync(resolve(__dirname, '../../../docs/research/codebook.md'), 'utf8');
    const documented = [...codebook.matchAll(/^\| \d+ +\| `([a-z_]+)` +\|/gm)].map((m) => m[1]);
    expect(documented).toEqual([...RESEARCH_COLUMNS]);
  });

  it('makes one row per session with every column', () => {
    const row = researchRow(PID, session(), 1);
    expect(row).toEqual({
      participant_id: PID,
      session_number: 1,
      mode: 'solo',
      condition: 'control',
      start_date: '2026-11-23',
      start_hour: 9,
      planned_minutes: 25,
      actual_minutes: 25,
      study_minutes: 20,
      neutral_minutes: 3,
      distraction_minutes: 2,
      distraction_visits: 2,
      attempts: 0,
      continued: null,
      turned_back: null,
      mean_dwell_seconds: null,
      focus_rating: 4,
      goal_completed: 'partly',
      checkin_status: 'answered',
      ended_early: 0,
      label_set_version: 3,
      labels_locked: 1,
    });
  });

  it('friction/intention rows have continued, turned back and the mean dwell time', () => {
    expect(researchRow(PID, frictionSession(), 2)).toMatchObject({
      condition: 'friction',
      session_number: 2,
      start_hour: 14,
      actual_minutes: 10,
      attempts: 2,
      continued: 1,
      turned_back: 1,
      mean_dwell_seconds: 7.5,
      focus_rating: null,
      goal_completed: null,
      checkin_status: 'pending',
      ended_early: 1,
    });
  });

  it('sessions from before v0.4.0: position as the number, empty attempts and label version', () => {
    const old = session({
      sessionNumber: null,
      labelSetVersion: null,
      labelsLocked: false,
      distractionAttempts: null,
      condition: null,
      checkIn: { skipped: true, reason: 'user', answeredAt: 0 },
    });
    expect(researchRow(PID, old, 4)).toMatchObject({
      session_number: 4,
      condition: 'none',
      attempts: null,
      label_set_version: null,
      labels_locked: 0,
      checkin_status: 'skipped',
      focus_rating: null,
    });
  });

  it('reads the stored history, in session order, and leaves the running session out', () => {
    const stored = {
      [STORAGE_KEYS.sessionHistory]: [
        session({ id: 'old', sessionNumber: null }),
        frictionSession(),
      ],
      [STORAGE_KEYS.activeSession]: session({ id: 'running', sessionNumber: 3 }),
    };
    expect(researchRows(stored, PID).map((r) => r.session_number)).toEqual([1, 2]);
  });

  it('writes a header and CRLF rows, with empty cells for missing values', () => {
    const csv = researchCsv({ [STORAGE_KEYS.sessionHistory]: [session(), frictionSession()] }, PID);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(RESEARCH_COLUMNS.join(','));
    expect(lines[1]).toBe(
      'p-0a1b2c3d4e5f,1,solo,control,2026-11-23,9,25,25,20,3,2,2,0,,,,4,partly,answered,0,3,1',
    );
    expect(lines[2]).toBe(
      'p-0a1b2c3d4e5f,2,solo,friction,2026-11-23,14,25,10,20,3,2,2,2,1,1,7.5,,,pending,1,3,1',
    );
    expect(lines[3]).toBe('');
    expect(lines).toHaveLength(4);
    expect(researchCsv({}, PID)).toBe(RESEARCH_COLUMNS.join(',') + '\r\n');
  });

  it('never contains goal text, site names, web addresses or exact times', () => {
    const withUrlish: DistractionAttempt = {
      site: 'very-private-site.example',
      at: at(23, 14, 7),
      condition: 'friction',
      outcome: 'continued',
      dwellSeconds: 10,
    };
    const f = frictionSession();
    const stored = {
      [STORAGE_KEYS.sessionHistory]: [session(), { ...f, attempts: [...f.attempts, withUrlish] }],
      [STORAGE_KEYS.categoryRules]: [{ domain: 'youtube.com', category: 'distraction' }],
      'activity:2026-11-23': [{ hostname: 'www.youtube.com', start: 1, end: 2 }],
    };
    const csv = researchCsv(stored, PID);
    expect(csv).not.toContain(GOAL);
    expect(csv).not.toMatch(/thesis|youtube|reddit|private|example/i);
    expect(csv).not.toMatch(/https?:|www\.|\/\//);
    // No hostname-like text (letters, a dot, letters) anywhere.
    expect(csv).not.toMatch(/[a-z]\.[a-z]/i);
    // No exact times: no epoch milliseconds, no clock times.
    expect(csv).not.toMatch(/\d{10,}|\d{1,2}:\d{2}/);
  });

  it('names the file with the local date', () => {
    expect(researchFileName(at(5, 23, 59))).toBe('studylens-research-2026-11-05.csv');
  });
});
