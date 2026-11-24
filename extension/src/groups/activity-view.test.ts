import { describe, expect, it } from 'vitest';
import { SHARING_DEFAULT, SHARING_OFF } from '@studylens/shared';
import {
  barHeights,
  friendsFocusingText,
  historyLabel,
  previewMember,
  todayText,
  weekdayOf,
} from './activity-view';

const TODAY = '2026-11-24';
const MINUTES = new Map([
  ['2026-11-24', 45],
  ['2026-11-22', 120],
  ['2026-11-10', 999], // outside the week
]);

describe('previewMember (what others see)', () => {
  it('both switches on: minutes, 7-day history and focusing now', () => {
    const m = previewMember('Sam', SHARING_DEFAULT, MINUTES, true, TODAY);
    expect(m.todayMinutes).toBe(45);
    expect(m.focusingNow).toBe(true);
    expect(m.history?.map((d) => d.localDate)).toEqual([
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
    ]);
    expect(m.history?.map((d) => d.focusMinutes)).toEqual([0, 0, 0, 0, 120, 0, 45]);
  });

  it('switches off: nothing but the name', () => {
    expect(previewMember('Sam', SHARING_OFF, MINUTES, true, TODAY)).toEqual({
      displayName: 'Sam',
      role: 'member',
      isMe: true,
      todayMinutes: null,
      focusingNow: null,
      history: null,
    });
  });

  it('only one switch on', () => {
    const minutes = previewMember(
      'Sam',
      { focusMinutes: true, focusingNow: false },
      MINUTES,
      true,
      TODAY,
    );
    expect(minutes.focusingNow).toBeNull();
    expect(minutes.todayMinutes).toBe(45);
    const presence = previewMember(
      'Sam',
      { focusMinutes: false, focusingNow: true },
      MINUTES,
      false,
      TODAY,
    );
    expect(presence).toMatchObject({ todayMinutes: null, history: null, focusingNow: false });
  });
});

describe('texts', () => {
  it('today', () => {
    expect(todayText({ todayMinutes: 135 })).toBe('2 h 15 min focused today');
    expect(todayText({ todayMinutes: 0 })).toBe('0 min focused today');
    expect(todayText({ todayMinutes: null })).toBe('Focus minutes not shared');
  });

  it('history label for screen readers, and bar heights', () => {
    const history = [
      { localDate: '2026-11-22', focusMinutes: 120 },
      { localDate: '2026-11-23', focusMinutes: 0 },
      { localDate: '2026-11-24', focusMinutes: 60 },
    ];
    expect(weekdayOf('2026-11-24')).toBe('Tue');
    expect(historyLabel(history)).toBe('Last 3 days: Sun 2 h, Mon 0 min, today 1 h');
    expect(barHeights(history)).toEqual([1, 0, 0.5]);
    expect(barHeights([{ localDate: '2026-11-24', focusMinutes: 0 }])).toEqual([0]);
  });

  it('popup line', () => {
    expect(friendsFocusingText(null)).toBeNull();
    expect(friendsFocusingText(0)).toBeNull();
    expect(friendsFocusingText(1)).toBe('1 friend focusing now');
    expect(friendsFocusingText(3)).toBe('3 friends focusing now');
  });
});
