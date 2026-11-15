import { describe, expect, it } from 'vitest';
import { INTERVENTION_IDS, isInterventionId, isSiteCategory } from './types';

describe('InterventionId', () => {
  it('lists the three research conditions', () => {
    expect(INTERVENTION_IDS).toEqual(['control', 'friction', 'intention']);
  });

  it('isInterventionId accepts known ids and rejects others', () => {
    expect(isInterventionId('friction')).toBe(true);
    expect(isInterventionId('blocking')).toBe(false);
    expect(isInterventionId(42)).toBe(false);
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
