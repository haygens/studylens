import { describe, expect, it } from 'vitest';
import type { FocusSession } from '../sessions/session';
import { memoryStore } from './activity-store';
import {
  ACTIVE_SESSION_KEY,
  SESSION_HISTORY_KEY,
  finishSession,
  loadActiveSession,
  loadSessions,
} from './sessions-store';

const done: FocusSession = {
  id: 'a',
  goal: 'Read',
  plannedMinutes: 25,
  start: 0,
  plannedEnd: 1_500_000,
  actualEnd: 1_500_000,
  endedEarly: false,
  minutesByCategory: { study: 20, neutral: 5, distraction: 0 },
  distractionVisits: 0,
  condition: null,
  frictionShown: 0,
  frictionContinued: 0,
  frictionTurnedBack: 0,
  intentionShown: 0,
  intentionContinued: 0,
  intentionTurnedBack: 0,
  checkIn: null,
};

describe('sessions store', () => {
  it('starts empty', async () => {
    const store = memoryStore();
    expect(await loadActiveSession(store)).toBeNull();
    expect(await loadSessions(store)).toEqual([]);
  });

  it('ignores malformed stored data', async () => {
    const store = memoryStore({
      [ACTIVE_SESSION_KEY]: { id: 1 },
      [SESSION_HISTORY_KEY]: [done, { id: 'b' }, null, 'x'],
    });
    expect(await loadActiveSession(store)).toBeNull();
    expect(await loadSessions(store)).toEqual([done]);
  });

  it('finishing appends to history once and clears the active session', async () => {
    const store = memoryStore({ [ACTIVE_SESSION_KEY]: done });
    await finishSession(store, done);
    await finishSession(store, done);
    expect(await loadSessions(store)).toEqual([done]);
    expect(await loadActiveSession(store)).toBeNull();
  });
});
