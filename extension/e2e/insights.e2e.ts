/**
 * End-to-end: the Insights tab (P11) renders from seeded local data — trends, time of day, and the
 * per-condition table, including the "not enough data yet" message for a sparse condition.
 */
import type { Page } from '@playwright/test';
import type { CheckIn, SessionCondition } from '@studylens/shared';
import type { FocusSession } from '../src/sessions/session';
import { expect, test } from './fixtures';

const MIN = 60_000;
/** `hour`:00 local time, `daysAgo` days before today. */
function at(daysAgo: number, hour: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

let n = 0;
function session(
  condition: SessionCondition | null,
  start: number,
  visits: number,
  checkIn: CheckIn | null,
): FocusSession {
  return {
    id: `seed-${n++}`,
    goal: 'Seeded goal',
    plannedMinutes: 25,
    start,
    plannedEnd: start + 25 * MIN,
    actualEnd: start + 25 * MIN,
    endedEarly: false,
    condition,
    minutesByCategory: { study: 20, neutral: 1, distraction: 4 },
    distractionVisits: visits,
    checkIn,
    frictionShown: 0,
    frictionContinued: 0,
    frictionTurnedBack: 0,
    intentionShown: 0,
    intentionContinued: 0,
    intentionTurnedBack: 0,
  };
}

const rated = (focusRating: 1 | 2 | 3 | 4 | 5, goalCompleted: 'yes' | 'partly' | 'no') =>
  ({ focusRating, goalCompleted, answeredAt: 0 }) as const;

/** Three sessions per condition (morning starts), one opted-out, plus labeled activity. */
function seed(intentionSessions: number): Record<string, unknown> {
  const history = [
    session('control', at(3, 9), 3, rated(3, 'yes')),
    session('control', at(2, 9), 2, rated(2, 'no')),
    session('control', at(1, 9), 1, rated(4, 'yes')),
    session('friction', at(3, 10), 1, rated(4, 'yes')),
    session('friction', at(2, 10), 0, rated(5, 'partly')),
    session('friction', at(1, 10), 2, null),
    ...Array.from({ length: intentionSessions }, (_, i) =>
      session('intention', at(i + 1, 14), 1, rated(4, 'yes')),
    ),
    session('opted-out', at(1, 19), 9, rated(1, 'no')),
  ].sort((a, b) => a.start - b.start);
  const today = new Date();
  const key = `activity:${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const start = at(0, 0) + 30 * MIN; // 00:30 today: safely inside today and before now
  return {
    'interventions:enabled': false,
    'categories:rules': [
      { domain: 'wikipedia.org', category: 'study' },
      { domain: 'youtube.com', category: 'distraction' },
    ],
    'sessions:history': history,
    [key]: [
      { hostname: 'en.wikipedia.org', start, end: start + 12 * MIN },
      { hostname: 'youtube.com', start: start + 12 * MIN, end: start + 15 * MIN },
    ],
  };
}

async function openInsights(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html#insights`);
  await expect(page.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible();
}

test.describe('with enough sessions in every condition', () => {
  test.use({ seed: seed(3) });

  test('shows trends, time of day, and averages for all three conditions', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openInsights(page, extensionId);

    // Trends: today's labeled activity, written as text next to the bars.
    const studyTable = page.getByRole('table', { name: 'Study vs distraction minutes per day' });
    const todayRow = studyTable.getByRole('row', { name: /\(today\)/ });
    await expect(todayRow).toContainText('12 min');
    await expect(todayRow).toContainText('3 min');
    const focusTable = page.getByRole('table', { name: 'Focus session minutes per day' });
    await expect(focusTable.getByRole('row')).toHaveCount(15); // header + 14 days

    // Time of day: morning = control + friction ratings (3, 2, 4, 4, 5) → 3.6 from 5 sessions.
    const timeOfDay = page.getByRole('region', { name: 'Best time of day' });
    await expect(timeOfDay.getByRole('row', { name: /Morning/ })).toContainText(
      '3.6 / 5 · 5 sessions',
    );
    await expect(timeOfDay.getByRole('row', { name: /Evening/ })).toContainText('1.0 / 5');

    const compared = page.getByRole('region', { name: 'Focus helpers compared' });
    await expect(compared.getByText('Early results, small sample.')).toBeVisible();
    await expect(compared.getByText(/Not enough data yet/)).toHaveCount(0);
    const control = compared.getByRole('row', { name: /Control/ });
    await expect(control).toContainText('2.0'); // visits (3 + 2 + 1) / 3
    await expect(control).toContainText('3.0 / 5');
    await expect(control).toContainText('Yes 67% · Partly 0% · No 33%');
    const friction = compared.getByRole('row', { name: /Friction/ });
    await expect(friction).toContainText('4.5 / 5 (2 answered)');
    await expect(compared.getByRole('row', { name: /Intention/ })).toContainText(
      'Yes 100% · Partly 0% · No 0%',
    );
    // The opted-out session is left out of the table and mentioned.
    await expect(compared).toContainText('Not included: 1 session with research interventions');
  });
});

test.describe('with a sparse condition', () => {
  test.use({ seed: seed(1) });

  test('shows "not enough data yet" for a condition with fewer than 3 sessions', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openInsights(page, extensionId);
    const compared = page.getByRole('region', { name: 'Focus helpers compared' });
    await expect(compared.getByRole('row', { name: /Intention/ })).toContainText(
      'Not enough data yet: 1 of 3 sessions needed.',
    );
    await expect(compared.getByRole('row', { name: /Control/ })).toContainText('3.0 / 5');
  });
});

test('shows empty states with no data, and is reachable from the tab bar', async ({
  openOptions,
}) => {
  const page = await openOptions();
  await page.getByRole('link', { name: 'Insights' }).click();
  await expect(page.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible();
  await expect(page.getByText(/No focus sessions or labeled browsing/)).toBeVisible();
  await expect(page.getByText(/No rated sessions yet/)).toBeVisible();
  await expect(page.getByText('Not enough data yet: 0 of 3 sessions needed.')).toHaveCount(3);
});
