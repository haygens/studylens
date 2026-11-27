/**
 * Manual test window for live group sessions against PRODUCTION (P21b). Run:
 *   npm run try:live -w extension            (one window)
 *   npm run try:live -w extension -- --two   (a second window: "a friend" joins by code)
 *
 * Builds the normal Edge build, makes the same store-ID copy as smoke:live (`store-id-copy.mjs`,
 * so production CORS accepts it; nothing on the server or in Vercel changes), and opens installed
 * Edge (channel `msedge`, visible) with a temporary profile in TEMP (on M:) and the welcome page.
 * No automated clicks: everything after that is by hand.
 *
 * When every window is closed (or on Ctrl+C), the temporary profile(s) and the extension copy are
 * deleted and listed. Server test data is NOT deleted automatically: use "Delete my group data
 * from the server" in each window before closing it.
 */
import { chromium } from '@playwright/test';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { API, BUILD, STORE_ID, makeStoreIdCopy, tempDir } from './store-id-copy.mjs';

const TWO = process.argv.includes('--two');

if (!existsSync(path.join(BUILD, 'manifest.json'))) {
  console.error(`Build missing: ${BUILD}. Run \`npm run build:edge -w extension\`.`);
  process.exit(1);
}

const work = tempDir('studylens-try-');
const EXT = path.join(work, 'ext');
const folders = [work];
const contexts = [];

let cleaned = false;
async function cleanup(reason, code = 0) {
  if (cleaned) return;
  cleaned = true;
  console.log(`\n${reason} Cleaning up...`);
  await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
  // Profiles first, then the work folder with the extension copy.
  for (const dir of folders.slice(1).concat(folders[0])) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    console.log(`  ${existsSync(dir) ? 'COULD NOT REMOVE' : 'removed'} ${dir}`);
  }
  console.log(
    'Reminder: server data is only deleted by "Delete my group data from the server" in the extension.',
  );
  process.exit(code);
}

// Our own handlers (Playwright's are turned off below): it would exit before the folders are gone.
process.on('SIGINT', () => void cleanup('Ctrl+C.'));
process.on('SIGTERM', () => void cleanup('Stopped.'));
process.on('SIGHUP', () => void cleanup('Terminal closed.'));

try {
  const { files, version } = makeStoreIdCopy(EXT);
  console.log(
    `Extension copy ${version}: ${files} files identical to ${BUILD}, store ID key added.`,
  );

  const closed = new Set();
  async function launch(label) {
    const profile = tempDir(`studylens-try-${label}-`);
    folders.push(profile);
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'msedge',
      headless: false,
      viewport: null, // a normal, resizable window
      ignoreDefaultArgs: ['--enable-automation'],
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      args: [
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
        '--no-first-run',
      ],
    });
    contexts.push(context);
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(sw.url()).host;
    if (id !== STORE_ID)
      throw new Error(`extension ID is ${id}, expected the store ID ${STORE_ID}`);
    // A fresh install opens the welcome page by itself; open it if it didn't.
    const welcome = `chrome-extension://${id}/welcome.html`;
    const deadline = Date.now() + 5_000;
    while (!context.pages().some((p) => p.url().startsWith(welcome)) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 250));
    if (!context.pages().some((p) => p.url().startsWith(welcome)))
      await (await context.newPage()).goto(welcome);
    // Close the empty start tab so only StudyLens is open.
    for (const p of context.pages()) if (p.url() === 'about:blank') await p.close();
    context.on('close', () => {
      if (closed.has(context)) return;
      closed.add(context);
      console.log(`Window "${label}" closed.`);
      if (closed.size === contexts.length) void cleanup('All windows closed.');
    });
    console.log(`Window "${label}": profile ${profile}`);
    return id;
  }

  await launch('you');
  if (TWO) await launch('friend');
} catch (err) {
  console.error(`Could not start: ${err?.message ?? err}`);
  await cleanup('Start failed.', 1);
}

console.log(`
--------------------------------------------------------------------------
StudyLens ${TWO ? '(two windows: "you" and "friend")' : '(one window)'} - server ${API}
This uses the REAL server. Use made-up names.

 1. Pin StudyLens: puzzle icon in the toolbar > pin. Click it for the popup.
 2. Create a group: popup > "Study groups" (bottom link) >
    "Join or create a group" > display name + group name > "Create group".
    Note the join code.${
      TWO
        ? `
 3. Friend window: same steps, but enter the join code > "Join group".`
        : ''
    }
 ${TWO ? 4 : 3}. Start a group session: Study groups > "Live group sessions" >
    "Start group session".${TWO ? ' The friend joins from their popup.' : ''}
 ${TWO ? 5 : 4}. On the live card: "Open room page" opens /s/<code> in your look
    (Settings > Look: Sunrise = Hearth, Ocean = Rainy Window, Pastel = Cafe).
    The room page's "Room look" switcher changes it there.
 ${TWO ? 6 : 5}. When done, IN EACH WINDOW: Leave session > Study groups >
    "Delete my group data from the server" > "Yes, delete".

Close the window${TWO ? 's' : ''} or press Ctrl+C here to finish; the temporary profile${
  TWO ? 's' : ''
} and the extension copy are deleted then.
--------------------------------------------------------------------------
`);
