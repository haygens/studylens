import { describe, expect, it } from 'vitest';
import { appTitle } from './title';

describe('appTitle', () => {
  it('returns the product name', () => {
    expect(appTitle()).toBe('StudyLens');
  });
});
