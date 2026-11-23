import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './cors';
import { EDGE_ORIGIN, FIREFOX_ORIGIN } from './test-helpers';

const UNPACKED = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

describe('isAllowedOrigin', () => {
  it('allows the Edge store extension and Firefox extension origins in production', () => {
    expect(isAllowedOrigin(EDGE_ORIGIN, 'production')).toBe(true);
    expect(isAllowedOrigin(FIREFOX_ORIGIN, 'production')).toBe(true);
  });

  it('rejects websites, other Chromium extensions and localhost in production', () => {
    for (const origin of [
      'https://evil.example',
      'http://localhost:3000',
      UNPACKED,
      'moz-extension://not-a-uuid',
      `${EDGE_ORIGIN}.evil.example`,
      'null',
    ]) {
      expect(isAllowedOrigin(origin, 'production'), origin).toBe(false);
    }
  });

  it('also allows localhost and unpacked dev builds outside production', () => {
    expect(isAllowedOrigin('http://localhost:3000', 'development')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173', 'test')).toBe(true);
    expect(isAllowedOrigin(UNPACKED, 'development')).toBe(true);
    expect(isAllowedOrigin('https://localhost.evil.example', 'development')).toBe(false);
  });
});
