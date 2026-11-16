import { describe, expect, it } from 'vitest';
import { testSecondsFrom } from './test-seconds';

describe('test-only session seconds', () => {
  it('is off outside the E2E build (unit tests run like a normal build)', () => {
    expect(__STUDYLENS_E2E__).toBe(false);
    expect(testSecondsFrom(10, __STUDYLENS_E2E__)).toBeNull();
  });

  it('ignores any value when not enabled', () => {
    expect(testSecondsFrom(10, false)).toBeNull();
  });

  it('accepts whole seconds 1–600 when enabled', () => {
    expect(testSecondsFrom(1, true)).toBe(1);
    expect(testSecondsFrom(600, true)).toBe(600);
    expect(testSecondsFrom(0, true)).toBeNull();
    expect(testSecondsFrom(601, true)).toBeNull();
    expect(testSecondsFrom(2.5, true)).toBeNull();
    expect(testSecondsFrom('10', true)).toBeNull();
  });
});
