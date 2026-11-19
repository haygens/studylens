/**
 * End-to-end: retention (P12). 40-day-old activity is rolled into weekly totals and deleted when
 * the background wakes up with the job overdue; a 40-day-old session is compacted; My Data shows
 * the weekly totals.
 */
import type { FocusSession } from '../src/sessions/session';
import { expect, stopBackground, test } from './fixtures';

const MIN = 60_000;

/** Local day `daysAgo` days before today at `hour`:00. */
function daysAgo(days: number, hour: number): number {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function dayKey(time: number): string {
  const d = new Date(time);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `activity:${d.getFullYear()}-${mm}-${dd}`;
}

const OLD = daysAgo(40, 10);
const RECENT = daysAgo(2, 10);

test.use({
  seed: {
    'interventions:enabled': false,
    'categories:rules': [
      { domain: 'wikipedia.org', category: 'study' },
      { domain: 'youtube.com', category: 'distraction' },
    ],
    [dayKey(OLD)]: [
      { hostname: 'en.wikipedia.org', start: OLD, end: OLD + 45 * MIN },
      { hostname: 'www.youtube.com', start: OLD + 50 * MIN, end: OLD + 60 * MIN },
    ],
    [dayKey(RECENT)]: [{ hostname: 'en.wikipedia.org', start: RECENT, end: RECENT + 5 * MIN }],
    'sessions:history': [
      {
        id: 'old-session',
        goal: 'Old private goal',
        plannedMinutes: 25,
        start: OLD,
        plannedEnd: OLD + 25 * MIN,
        actualEnd: OLD + 25 * MIN,
        endedEarly: false,
        condition: 'friction',
        minutesByCategory: { study: 20, neutral: 0, distraction: 5 },
        distractionVisits: 1,
        checkIn: { goalCompleted: 'yes', focusRating: 4, answeredAt: OLD + 26 * MIN },
        frictionShown: 2,
        frictionContinued: 1,
        frictionTurnedBack: 1,
        intentionShown: 0,
        intentionContinued: 0,
        intentionTurnedBack: 0,
      },
    ],
    // Overdue: the job last ran long ago (the wake-up at install may already have stamped today).
    'retention:last-run': 0,
  },
});

test('40-day-old activity becomes weekly totals when the background wakes up', async ({
  context,
  background,
  openMyData,
  openOptions,
  openPopup,
}) => {
  // Restart the background with the seeded data in place: the wake-up runs the overdue job.
  const page = await openOptions();
  await stopBackground(context, page);
  await openPopup(); // The popup messages the background, which wakes it up.

  await expect.poll(() => background.get(dayKey(OLD)), { timeout: 30_000 }).toBeUndefined();
  const totals =
    await background.get<{ site: string; category: string; ms: number }[]>('totals:weekly');
  expect(totals.map((t) => [t.site, t.category, t.ms / MIN]).sort()).toEqual([
    ['wikipedia.org', 'study', 45],
    ['youtube.com', 'distraction', 10],
  ]);
  // Recent records are untouched.
  expect(await background.get(dayKey(RECENT))).toHaveLength(1);
  expect(await background.get('retention:last-run')).toBeGreaterThan(OLD);

  // The old session is kept for Insights; only its goal text is gone, every number stays.
  const [session] = await background.get<FocusSession[]>('sessions:history');
  expect(session).toMatchObject({
    id: 'old-session',
    goal: '',
    compacted: true,
    condition: 'friction',
    distractionVisits: 1,
    minutesByCategory: { study: 20, neutral: 0, distraction: 5 },
    checkIn: { goalCompleted: 'yes', focusRating: 4 },
    frictionShown: 2,
    frictionContinued: 1,
    frictionTurnedBack: 1,
  });
  expect(JSON.stringify(await background.storage())).not.toContain('Old private goal');

  const myData = await openMyData();
  const weekly = myData.getByRole('table', { name: /^Weekly totals, Week of / });
  await expect(weekly.getByRole('row', { name: /wikipedia\.org Study 45m 00s/ })).toBeVisible();
  await expect(weekly.getByRole('row', { name: /youtube\.com Distraction 10m 00s/ })).toBeVisible();
  const sessions = myData.getByRole('table', { name: 'Focus sessions' });
  await expect(sessions.getByRole('cell', { name: 'Removed after 30 days' }).first()).toBeVisible();
  await expect(myData.getByText(/deleted automatically/)).toBeVisible();
});
