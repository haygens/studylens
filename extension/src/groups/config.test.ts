import { describe, expect, it } from 'vitest';
import { E2E_API_BASE, OPTIONAL_DATA_COLLECTION, PRODUCTION_API_BASE } from '../../server-urls';
import { inviteMessage } from './invite';
import { INSTALL_LINKS, SERVER_ORIGIN_PATTERN, serverPermissions } from './config';

describe('server permission request', () => {
  it('asks only for the server origin (from the build-time constant)', () => {
    // Unit tests build with a dummy base URL (vitest.config.ts).
    expect(SERVER_ORIGIN_PATTERN).toBe('https://api.test.invalid/*');
    expect(serverPermissions(false)).toEqual({ origins: [SERVER_ORIGIN_PATTERN] });
  });

  it('on Firefox also asks for the optional data collection category, in the same request', () => {
    expect(serverPermissions(true)).toEqual({
      origins: [SERVER_ORIGIN_PATTERN],
      data_collection: ['personallyIdentifyingInfo'],
    });
    expect(OPTIONAL_DATA_COLLECTION).toEqual(['personallyIdentifyingInfo']);
  });

  it('production uses HTTPS; the E2E server is local only', () => {
    expect(PRODUCTION_API_BASE).toBe('https://studylens-flame.vercel.app');
    expect(E2E_API_BASE).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});

describe('invite message', () => {
  it('has the group name, the readable code, both store links and the steps', () => {
    const text = inviteMessage({ name: 'TCSS 490', joinCode: 'ABCDEFGH' });
    expect(text).toContain('“TCSS 490”');
    expect(text).toContain('Join code: ABCD-EFGH');
    expect(text).toContain(INSTALL_LINKS.firefox);
    expect(text).toContain(INSTALL_LINKS.edge);
    expect(text).toMatch(/Study groups/);
  });
});
