import { describe, expect, it } from 'vitest';
import { clockOffset, focusingStatusText, isLiveMinutes, toLocalTime } from './live';

describe('live group sessions (P18b)', () => {
  it('clockOffset uses the middle of the request', () => {
    // Local clock 1000 → 1200; the server said 6100 → server is 5000 ahead.
    expect(clockOffset(1000, 1200, 6100)).toBe(5000);
    expect(clockOffset(1000, 1000, 400)).toBe(-600);
    expect(toLocalTime(16_100, 5000)).toBe(11_100);
  });

  it('isLiveMinutes accepts whole minutes 5–180', () => {
    expect([5, 25, 50, 180].every(isLiveMinutes)).toBe(true);
    expect([4, 181, 25.5, NaN, '25', null].some(isLiveMinutes)).toBe(false);
  });

  it('focusingStatusText: "Focusing" while fresh, then "Away (last seen N min ago)"', () => {
    expect(focusingStatusText({ recentlySeen: true, lastSeenMinutesAgo: null })).toBe('Focusing');
    expect(focusingStatusText({ recentlySeen: false, lastSeenMinutesAgo: 7 })).toBe(
      'Away (last seen 7 min ago)',
    );
    expect(focusingStatusText({ recentlySeen: false, lastSeenMinutesAgo: 0 })).toBe(
      'Away (last seen 2 min ago)',
    );
  });
});
