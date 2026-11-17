import { describe, expect, it } from 'vitest';
import {
  INTERVENTION_IDS,
  isCheckIn,
  isFocusRating,
  isGoalCompleted,
  isInterventionId,
  isSessionCondition,
  isSiteCategory,
} from './types';

describe('InterventionId', () => {
  it('lists the three research conditions', () => {
    expect(INTERVENTION_IDS).toEqual(['control', 'friction', 'intention']);
  });

  it('isInterventionId accepts known ids and rejects others', () => {
    expect(isInterventionId('friction')).toBe(true);
    expect(isInterventionId('blocking')).toBe(false);
    expect(isInterventionId(42)).toBe(false);
    expect(isInterventionId('opted-out')).toBe(false);
  });

  it('isSessionCondition also accepts opted-out', () => {
    expect(isSessionCondition('opted-out')).toBe(true);
    expect(isSessionCondition('intention')).toBe(true);
    expect(isSessionCondition(null)).toBe(false);
    expect(isSessionCondition('blocking')).toBe(false);
  });
});

describe('SiteCategory', () => {
  it('isSiteCategory accepts the three labels only', () => {
    expect(isSiteCategory('study')).toBe(true);
    expect(isSiteCategory('distraction')).toBe(true);
    expect(isSiteCategory('blocked')).toBe(false);
    expect(isSiteCategory(undefined)).toBe(false);
  });
});

describe('CheckIn', () => {
  it('accepts an answered check-in', () => {
    expect(isCheckIn({ goalCompleted: 'partly', focusRating: 4, answeredAt: 1 })).toBe(true);
  });

  it('accepts a skipped check-in with a known reason', () => {
    expect(isCheckIn({ skipped: true, reason: 'user', answeredAt: 1 })).toBe(true);
    expect(isCheckIn({ skipped: true, reason: 'expired', answeredAt: 1 })).toBe(true);
    expect(isCheckIn({ skipped: true, reason: 'bored', answeredAt: 1 })).toBe(false);
  });

  it('rejects bad answers, ratings and timestamps', () => {
    expect(isCheckIn({ goalCompleted: true, focusRating: 4, answeredAt: 1 })).toBe(false);
    expect(isCheckIn({ goalCompleted: 'yes', focusRating: 6, answeredAt: 1 })).toBe(false);
    expect(isCheckIn({ goalCompleted: 'yes', focusRating: 2.5, answeredAt: 1 })).toBe(false);
    expect(isCheckIn({ goalCompleted: 'yes', focusRating: 3 })).toBe(false);
    expect(isCheckIn(null)).toBe(false);
  });

  it('type guards for the single answers', () => {
    expect(isGoalCompleted('no')).toBe(true);
    expect(isGoalCompleted('maybe')).toBe(false);
    expect(isFocusRating(1)).toBe(true);
    expect(isFocusRating(0)).toBe(false);
    expect(isFocusRating('3')).toBe(false);
  });
});
