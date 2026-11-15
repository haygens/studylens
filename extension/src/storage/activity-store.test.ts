import { describe, expect, it } from 'vitest';
import {
  appendSegments,
  dayKey,
  getSegmentsForDays,
  isTrackingPaused,
  loadTrackerState,
  memoryStore,
  saveTrackerState,
  setTrackingPaused,
} from './activity-store';
import { initialState } from '../tracker/tracker';
import { startOfLocalDay, totalsByHostname } from '../tracker/totals';

const noon = new Date(2026, 10, 14, 12, 0, 0).getTime();
const MIN = 60_000;

describe('activity store', () => {
  it('buckets segments by local start day and reads them back', async () => {
    const store = memoryStore();
    const yesterday = noon - 24 * 60 * MIN;
    await appendSegments(store, [
      { hostname: 'a.com', start: noon, end: noon + MIN },
      { hostname: 'b.com', start: yesterday, end: yesterday + MIN },
    ]);
    await appendSegments(store, [
      { hostname: 'a.com', start: noon + 2 * MIN, end: noon + 3 * MIN },
    ]);

    expect(Object.keys(store.data).sort()).toEqual(['activity:2026-11-13', 'activity:2026-11-14']);
    expect(dayKey(noon)).toBe('activity:2026-11-14');
    expect(await getSegmentsForDays(store, [noon])).toHaveLength(2);
    expect(await getSegmentsForDays(store, [yesterday, noon])).toHaveLength(3);
  });

  it('round-trips tracker state and falls back to the initial state', async () => {
    const store = memoryStore();
    expect(await loadTrackerState(store)).toEqual(initialState());
    const state = { ...initialState(), open: { hostname: 'a.com', start: 1, lastSeen: 2 } };
    await saveTrackerState(store, state);
    expect(await loadTrackerState(store)).toEqual(state);
  });

  it('stores the paused flag', async () => {
    const store = memoryStore();
    expect(await isTrackingPaused(store)).toBe(false);
    await setTrackingPaused(store, true);
    expect(await isTrackingPaused(store)).toBe(true);
  });
});

describe('totalsByHostname', () => {
  it('sums per hostname and clips to the window', () => {
    const dayStart = startOfLocalDay(noon);
    const totals = totalsByHostname(
      [
        { hostname: 'a.com', start: dayStart - 5 * MIN, end: dayStart + 5 * MIN }, // crosses midnight
        { hostname: 'b.com', start: noon, end: noon + 2 * MIN },
        { hostname: 'a.com', start: noon, end: noon + 1 * MIN },
      ],
      dayStart,
      dayStart + 24 * 60 * MIN,
    );
    expect(totals).toEqual([
      { hostname: 'a.com', ms: 6 * MIN },
      { hostname: 'b.com', ms: 2 * MIN },
    ]);
  });
});
