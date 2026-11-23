import { describe, expect, it } from 'vitest';
import type { ApiError } from './errors';
import { makeRequest } from './test-helpers';
import {
  displayNameSchema,
  errorReportSchema,
  MAX_BODY_BYTES,
  readJson,
  registerDeviceSchema,
} from './validation';

describe('displayNameSchema', () => {
  it('trims and collapses spaces', () => {
    expect(displayNameSchema.parse('  Sam   Lee ')).toBe('Sam Lee');
  });

  it.each([
    ['empty', '   '],
    ['too long', 'x'.repeat(31)],
    ['an email', 'sam@uw.edu'],
    ['a web address', 'https://x'],
    ['invisible characters', 'Sam​Lee'],
    ['not a string', 42],
  ])('rejects %s', (_label, value) => {
    expect(displayNameSchema.safeParse(value).success).toBe(false);
  });
});

describe('errorReportSchema', () => {
  it('accepts a message with optional context and version', () => {
    expect(
      errorReportSchema.parse({ message: ' boom ', context: 'popup', extensionVersion: '0.5.0' }),
    ).toEqual({ message: 'boom', context: 'popup', extensionVersion: '0.5.0' });
  });

  it('rejects unknown fields so no extra data can be sent', () => {
    expect(errorReportSchema.safeParse({ message: 'x', url: 'https://a.b' }).success).toBe(false);
  });
});

describe('readJson', () => {
  const read = (req: Request) =>
    readJson(req, registerDeviceSchema).catch((e: unknown) => e as ApiError);

  it('returns parsed, validated data', async () => {
    expect(await read(makeRequest('POST', '/', { json: { displayName: 'Sam' } }))).toEqual({
      displayName: 'Sam',
    });
  });

  it('rejects a wrong content type (415), bad JSON (400) and a huge body (413)', async () => {
    const wrongType = await read(
      makeRequest('POST', '/', { body: '{}', headers: { 'content-type': 'text/plain' } }),
    );
    expect(wrongType).toMatchObject({ status: 415, code: 'unsupported_media_type' });

    const badJson = await read(
      makeRequest('POST', '/', { body: '{nope', headers: { 'content-type': 'application/json' } }),
    );
    expect(badJson).toMatchObject({ status: 400, code: 'invalid_json' });

    const huge = await read(
      makeRequest('POST', '/', { json: { displayName: 'x'.repeat(MAX_BODY_BYTES) } }),
    );
    expect(huge).toMatchObject({ status: 413, code: 'payload_too_large' });
  });

  it('lists the invalid fields (400 validation_failed)', async () => {
    const err = await read(makeRequest('POST', '/', { json: { displayName: '', extra: 1 } }));
    expect(err).toMatchObject({ status: 400, code: 'validation_failed' });
    const paths = (err as ApiError).details?.map((d) => d.path);
    expect(paths).toContain('displayName');
  });
});
