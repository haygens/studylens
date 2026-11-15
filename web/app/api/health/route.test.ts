import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/health', () => {
  it('returns { ok: true } with status 200', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
