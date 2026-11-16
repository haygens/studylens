/**
 * Regression tests for the P4 manual-test bug: after a session ended with the popup closed, the
 * popup rendered only an empty debug box — no session section, no rows, no error. Both popup
 * sections waited on `browser.storage.local.get` with no error handling and no timeout, and
 * rendered nothing while waiting, so a storage read that failed or never answered was invisible.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATE_KEY, dayKey, memoryStore, type KeyValueStore } from '../storage/activity-store';
import { RULES_KEY } from '../storage/categories-store';
import { reconcileSession, startSession, type SessionDeps } from '../sessions/session-controller';
import { initialState, type TrackerState } from '../tracker/tracker';
import { LOAD_TIMEOUT_MS, loadDebugSnapshot, loadSessionView, settle } from './popup-data';

const MIN = 60_000;

const brokenStores: Record<string, KeyValueStore> = {
  'a read that rejects': {
    get: () => Promise.reject(new Error('An unexpected error occurred')),
    set: () => Promise.resolve(),
  },
  'a read that never answers': {
    get: () => new Promise(() => undefined),
    set: () => Promise.resolve(),
  },
};

afterEach(() => {
  vi.useRealTimers();
  delete process.env.TZ;
});

describe('settle', () => {
  it('turns a value into ready', async () => {
    expect(await settle(Promise.resolve(3), 1000)).toEqual({ status: 'ready', data: 3 });
  });

  it('turns a rejection into an error state instead of throwing', async () => {
    const r = await settle(Promise.reject(new Error('boom')), 1000);
    expect(r).toEqual({ status: 'error', message: 'boom' });
  });

  it('gives up with an error state when the promise never settles', async () => {
    vi.useFakeTimers();
    const pending = settle(new Promise<number>(() => undefined), 500);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual({
      status: 'error',
      message: 'Timed out after 500 ms reading extension storage.',
    });
  });
});

describe.each(Object.entries(brokenStores))('popup with %s', (_name, store) => {
  it('session section reports an error instead of staying blank forever', async () => {
    vi.useFakeTimers();
    const pending = loadSessionView(store);
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    expect((await pending).status).toBe('error');
  });

  it('debug view reports an error instead of staying blank forever', async () => {
    vi.useFakeTimers();
    const pending = loadDebugSnapshot(store, Date.now());
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    expect((await pending).status).toBe('error');
  });
});

describe('popup after a session ended with the popup closed', () => {
  it('shows the Start form state and the last session', async () => {
    const t0 = new Date(2026, 10, 15, 22, 0, 0).getTime();
    const store = memoryStore({
      [RULES_KEY]: [
        { domain: 'wikipedia.org', category: 'study' },
        { domain: 'youtube.com', category: 'distraction' },
      ],
    });
    const deps: SessionDeps = {
      store,
      newId: () => 's1',
      effects: {
        scheduleAlarms: () => Promise.resolve(),
        clearAlarms: () => Promise.resolve(),
        setBadge: () => Promise.resolve(),
      },
    };
    await startSession(deps, 'test session', 5, t0);
    await store.set({
      [dayKey(t0)]: [
        { hostname: 'en.wikipedia.org', start: t0, end: t0 + 0.5 * MIN },
        { hostname: 'www.youtube.com', start: t0 + 0.5 * MIN, end: t0 + MIN },
      ],
    });
    // The end alarm fires with the popup closed.
    await reconcileSession(deps, t0 + 5 * MIN + 1);

    const view = await loadSessionView(store);
    expect(view.status).toBe('ready');
    if (view.status !== 'ready') return;
    expect(view.data.active).toBeNull();
    expect(view.data.last?.goal).toBe('test session');
    expect(view.data.last?.distractionVisits).toBe(1);
  });
});

describe('debug view day buckets in late-evening Pacific time', () => {
  it('uses the local date, not the UTC date (which is already tomorrow)', async () => {
    process.env.TZ = 'America/Los_Angeles';
    // 23:30 PST on Nov 15 = 07:30 UTC on Nov 16.
    const now = Date.UTC(2026, 10, 16, 7, 30);
    expect(dayKey(now)).toBe('activity:2026-11-15');

    const state: TrackerState = { ...initialState(), open: null };
    const store = memoryStore({
      [STATE_KEY]: state,
      'activity:2026-11-15': [{ hostname: 'en.wikipedia.org', start: now - 10 * MIN, end: now }],
    });
    const snap = await loadDebugSnapshot(store, now);
    expect(snap.status).toBe('ready');
    if (snap.status !== 'ready') return;
    expect(snap.data.sites.map((s) => s.site)).toEqual(['wikipedia.org']);
  });
});
