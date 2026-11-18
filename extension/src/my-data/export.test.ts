import { afterEach, describe, expect, it } from 'vitest';
import { buildExport, exportFileName, exportJson } from './export';

afterEach(() => {
  delete process.env.TZ;
});

const stored = {
  'sessions:history': [{ id: 's1', goal: 'Read' }],
  'activity:2026-11-16': [{ hostname: 'en.wikipedia.org', start: 1, end: 2 }],
  'tracking:paused': false,
  'unknown:key': { kept: true },
};

describe('export', () => {
  it('includes every stored key exactly as stored, sorted', () => {
    const out = buildExport(stored, Date.UTC(2026, 10, 16, 20, 0));
    expect(out.storage).toEqual(stored);
    expect(Object.keys(out.storage)).toEqual([
      'activity:2026-11-16',
      'sessions:history',
      'tracking:paused',
      'unknown:key',
    ]);
    expect(out).toMatchObject({
      app: 'StudyLens',
      exportFormatVersion: 1,
      exportedAt: '2026-11-16T20:00:00.000Z',
    });
  });

  it('includes the friction and intention counts saved on each session', () => {
    const counts = {
      frictionShown: 0,
      frictionContinued: 0,
      frictionTurnedBack: 0,
      intentionShown: 2,
      intentionContinued: 1,
      intentionTurnedBack: 1,
    };
    const json = exportJson(
      { 'sessions:history': [{ id: 's1', condition: 'intention', ...counts }] },
      0,
    );
    expect(JSON.parse(json).storage['sessions:history'][0]).toMatchObject(counts);
  });

  it('is valid JSON that round-trips', () => {
    const parsed = JSON.parse(exportJson(stored, 0)) as { storage: unknown };
    expect(parsed.storage).toEqual(stored);
  });

  it('exports empty storage too', () => {
    expect(buildExport({}, 0).storage).toEqual({});
  });

  it('names the file by the local date', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 23:30 Pacific on Nov 16 is already Nov 17 in UTC.
    expect(exportFileName(Date.UTC(2026, 10, 17, 7, 30))).toBe('studylens-export-2026-11-16.json');
  });
});
