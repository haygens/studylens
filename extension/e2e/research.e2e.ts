/**
 * End-to-end: research instrumentation (P13c) — the intention page's equal time cost (3+
 * characters AND 10 seconds), study mode (locked site labels), and the research CSV export with
 * distraction attempts logged in a control session.
 */
import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import type { InterventionId } from '@studylens/shared';
import { RESEARCH_COLUMNS } from '../src/my-data/research-csv';
import type { ActiveSession, FocusSession } from '../src/sessions/session';
import {
  enableInterventions,
  expect,
  labelSites,
  startSession,
  test,
  type Background,
} from './fixtures';

const WIKI = 'https://en.wikipedia.org/wiki/Focus';
const YOUTUBE = 'https://www.youtube.com/watch?v=SECRET123';
const INTENTION_PAGE = /\/interstitial\.html\?m=intention&/;
const GOAL = 'Private goal about chapter 7';
const QUESTION = 'What did you come here for?';

interface Setup {
  context: BrowserContext;
  background: Background;
  openOptions: () => Promise<Page>;
  openPopup: () => Promise<Page>;
}

/** Labels the sites, starts a session with `condition`, and opens Wikipedia in a new tab. */
async function setup(
  { context, background, openOptions, openPopup }: Setup,
  condition: InterventionId,
): Promise<{ site: Page; popup: Page }> {
  await labelSites(openOptions);
  await enableInterventions(background);
  await background.set({ 'interventions:notice-seen': true, 'interventions:block': [condition] });
  const popup = await openPopup();
  await startSession(popup, GOAL, 600);
  expect((await background.get<ActiveSession>('sessions:active')).condition).toBe(condition);
  const site = await context.newPage();
  await site.bringToFront();
  await site.goto(WIKI);
  return { site, popup };
}

/** Navigates; the extension may redirect the tab mid-navigation, which aborts `goto`. */
async function visit(site: Page, url: string): Promise<void> {
  await site.goto(url).catch(() => undefined);
}

test('intention: Continue needs 3+ characters AND 10 seconds; the dwell time is logged', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const { site } = await setup({ context, background, openOptions, openPopup }, 'intention');
  await visit(site, YOUTUBE);
  await expect(site).toHaveURL(INTENTION_PAGE);
  const shownAt = Date.now();

  const continueButton = site.getByRole('button', { name: 'Continue to youtube.com' });
  await expect(site.getByText(/You can continue in \d+ seconds?\./)).toBeVisible();
  // Typed right away: still disabled, and the hint now only mentions the seconds.
  await site.getByLabel(QUESTION).fill('check one thing');
  await expect(continueButton).toBeDisabled();
  await expect(site.getByText(/^You can continue in \d+ seconds?\.$/)).toBeVisible();
  await site.waitForTimeout(4000);
  await expect(continueButton).toBeDisabled();
  // Back to studying works at any time (not tested here); Continue unlocks after 10 s.
  await expect(continueButton).toBeEnabled({ timeout: 15_000 });
  expect(Date.now() - shownAt).toBeGreaterThanOrEqual(9_000);
  await expect(site.getByText(/You can continue in/)).toHaveCount(0);

  // After 10 s but with fewer than 3 characters: disabled again.
  await site.getByLabel(QUESTION).fill('ab');
  await expect(continueButton).toBeDisabled();
  await expect(site.getByText('Type a few words (at least 3 letters) to continue.')).toBeVisible();
  await site.getByLabel(QUESTION).fill('abc');
  await continueButton.click();
  await expect(site).toHaveURL(YOUTUBE);

  await expect
    .poll(async () => (await background.get<ActiveSession>('sessions:active')).attempts.length)
    .toBe(1);
  const session = await background.get<ActiveSession>('sessions:active');
  expect(session.distractionAttempts).toBe(1);
  const [attempt] = session.attempts;
  expect(attempt).toMatchObject({
    site: 'youtube.com',
    condition: 'intention',
    outcome: 'continued',
  });
  expect(attempt?.dwellSeconds).toBeGreaterThanOrEqual(10);
  expect(JSON.stringify(await background.storage())).not.toMatch(
    /check one thing|SECRET123|https?:/,
  );
});

test('study mode locks the site labels until it is turned off; switches are recorded', async ({
  openOptions,
  background,
}) => {
  await labelSites(openOptions);
  const versionBefore = await background.get<number>('categories:version');
  expect(versionBefore).toBe(3); // Two labels added: version 1 → 3.

  const options = await openOptions();
  await options.goto(options.url().replace(/#.*$/, '') + '#settings');
  const toggle = options.getByLabel('Lock my site labels (study mode)');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect
    .poll(() => background.get<{ locked: boolean }>('study:label-lock'))
    .toMatchObject({
      locked: true,
    });

  // Site categories: a clear message, and nothing can be edited.
  await options.getByRole('link', { name: 'Site categories' }).click();
  await expect(options.getByText('Your labels are locked (study mode).')).toBeVisible();
  await expect(options.getByLabel('New site', { exact: true })).toBeDisabled();
  await expect(options.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await expect(options.getByLabel('Category for youtube.com')).toBeDisabled();
  await expect(options.getByRole('button', { name: 'Remove' }).first()).toBeDisabled();
  expect(await background.get<number>('categories:version')).toBe(versionBefore);

  // The message links to Settings; turning study mode off makes the labels editable again.
  await options.getByRole('link', { name: 'Settings', exact: true }).last().click();
  await options.getByLabel('Lock my site labels (study mode)').uncheck();
  await options.getByRole('link', { name: 'Site categories' }).click();
  await expect(options.getByText('Your labels are locked (study mode).')).toHaveCount(0);
  await options.getByLabel('Category for youtube.com').selectOption('neutral');
  await expect.poll(() => background.get<number>('categories:version')).toBe(versionBefore + 1);

  const lock = await background.get<{ locked: boolean; changes: { locked: boolean }[] }>(
    'study:label-lock',
  );
  expect(lock.locked).toBe(false);
  expect(lock.changes.map((c) => c.locked)).toEqual([true, false]);

  // My Data shows the switches.
  await options.getByRole('link', { name: 'My Data' }).click();
  await expect(
    options.getByRole('list', { name: 'Study mode changes' }).getByRole('listitem'),
  ).toHaveCount(2);
});

test('research CSV: one row per session with attempts from a control session, no goal or sites', async ({
  context,
  background,
  openOptions,
  openPopup,
  openMyData,
}) => {
  const { site, popup } = await setup({ context, background, openOptions, openPopup }, 'control');
  // Control: no helper page, but the attempt is logged at the same trigger point.
  await visit(site, YOUTUBE);
  await site.waitForTimeout(1500);
  await expect(site).toHaveURL(/youtube\.com\/watch/);
  await expect
    .poll(async () => (await background.get<ActiveSession>('sessions:active')).distractionAttempts)
    .toBe(1);

  await popup.bringToFront();
  await popup.getByRole('button', { name: 'End early' }).click();
  await popup.getByRole('button', { name: 'Skip' }).click();
  await expect(popup.getByText('Check-in skipped')).toBeVisible();
  const [done] = await background.get<FocusSession[]>('sessions:history');
  expect(done).toMatchObject({ mode: 'solo', sessionNumber: 1, labelSetVersion: 3 });
  expect(done?.attempts[0]).toMatchObject({ condition: 'control', outcome: 'visited' });

  const myData = await openMyData();
  await expect(
    myData.getByRole('table', { name: 'Focus sessions' }).getByText('1 visited', { exact: false }),
  ).toBeVisible();
  const [download] = await Promise.all([
    myData.waitForEvent('download'),
    myData.getByRole('button', { name: 'Export for research (CSV)' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^studylens-research-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await download.path(), 'utf8');
  const [header, row, end, ...more] = csv.split('\r\n');
  expect(header).toBe(RESEARCH_COLUMNS.join(','));
  expect(end).toBe('');
  expect(more).toEqual([]);
  const cells = Object.fromEntries(RESEARCH_COLUMNS.map((c, i) => [c, row?.split(',')[i]]));
  const participantId = await background.get<string>('research:participant-id');
  expect(cells).toMatchObject({
    participant_id: participantId,
    session_number: '1',
    mode: 'solo',
    condition: 'control',
    attempts: '1',
    continued: '',
    turned_back: '',
    checkin_status: 'skipped',
    ended_early: '1',
    label_set_version: '3',
    labels_locked: '0',
  });
  expect(participantId).toMatch(/^p-[0-9a-f]{12}$/);
  // No goal text, site names or addresses.
  expect(csv).not.toMatch(/chapter|youtube|wikipedia|SECRET|https?:|[a-z]\.[a-z]/i);
  await expect(myData.getByText(participantId)).toBeVisible();
});
