import { describe, expect, it } from 'vitest';
import { createMemoryDb } from '@/lib/db/memory';
import { ApiError } from './errors';
import { generateToken, hashToken, requireDevice, safeEqual } from './auth';

const NOW = Date.UTC(2026, 10, 22, 12);

function withAuth(value?: string): Request {
  return new Request('http://localhost/api/x', {
    headers: value === undefined ? {} : { authorization: value },
  });
}

describe('tokens', () => {
  it('generates distinct 256-bit tokens with a recognisable prefix', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^slt_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('hashes with SHA-256 (64 hex characters), deterministically', () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token.slice(4));
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('requireDevice', () => {
  async function setup() {
    const db = createMemoryDb();
    const token = generateToken();
    await db.createDevice({
      id: 'd1',
      displayName: 'Sam',
      tokenHash: hashToken(token),
      createdAt: NOW,
    });
    return { db, token };
  }

  it('returns the device for a valid token and updates last seen', async () => {
    const { db, token } = await setup();
    const device = await requireDevice(withAuth(`Bearer ${token}`), db, NOW + 120_000);
    expect(device.id).toBe('d1');
    expect((await db.findDeviceByTokenHash(hashToken(token)))?.lastSeenAt).toBe(NOW + 120_000);
  });

  it.each([
    ['missing header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['malformed token', 'Bearer not-a-token'],
    ['unknown token', `Bearer ${generateToken()}`],
  ])('rejects %s with 401', async (_label, header) => {
    const { db } = await setup();
    const err = await requireDevice(withAuth(header), db, NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).headers?.['WWW-Authenticate']).toMatch(/^Bearer/);
  });
});

describe('safeEqual', () => {
  it('compares strings', () => {
    expect(safeEqual('Bearer abc', 'Bearer abc')).toBe(true);
    expect(safeEqual('Bearer abc', 'Bearer abd')).toBe(false);
    expect(safeEqual('', 'Bearer abc')).toBe(false);
  });
});
