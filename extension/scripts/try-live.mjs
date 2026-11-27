/**
 * Manual test window for live group sessions against PRODUCTION (P21b, P21c). Run:
 *   npm run try:live -w extension            (one window)
 *   npm run try:live -w extension -- --two   (a second window: "a friend" joins by code)
 *
 * Builds the normal Edge build, makes the same store-ID copy as smoke:live (`store-id-copy.mjs`,
 * so production CORS accepts it; nothing on the server or in Vercel changes), and starts installed
 * Edge with a temporary profile in TEMP (on M:). The extension opens its welcome page by itself.
 *
 * P21c: Edge is started as a plain program, NOT through Playwright. A Playwright-controlled
 * window couldn't be clicked or closed by hand; this one is an ordinary Edge window.
 *
 * When every window is closed (or on Ctrl+C), the temporary profile(s) and the extension copy are
 * deleted and listed. Server test data is NOT deleted automatically: use "Delete my group data
 * from the server" in each window before closing it.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { API, BUILD, STORE_ID, makeStoreIdCopy, tempDir } from './store-id-copy.mjs';

const TWO = process.argv.includes('--two');

/** Installed Microsoft Edge (the same places Playwright's `msedge` channel looks). */
function edgePath() {
  const candidates = [
    process.env['PROGRAMFILES(X86)'],
    process.env.PROGRAMFILES,
    process.env.LOCALAPPDATA,
  ]
    .filter(Boolean)
    .map((base) => path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Microsoft Edge not found in: ${candidates.join(', ')}`);
  return found;
}

/** The extension ID Chromium derives from a manifest `key` (SHA-256 of the key, letters a-p). */
function idFromKey(key) {
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

if (!existsSync(path.join(BUILD, 'manifest.json'))) {
  console.error(`Build missing: ${BUILD}. Run \`npm run build:edge -w extension\`.`);
  process.exit(1);
}

const work = tempDir('studylens-try-');
const EXT = path.join(work, 'ext');
const profiles = [];
const running = new Map(); // label -> Edge process

const alive = (c) => c.exitCode === null && c.signalCode === null;

let cleaned = false;
async function cleanup(reason, code = 0) {
  if (cleaned) return;
  cleaned = true;
  console.log(`\n${reason} Cleaning up...`);
  const open = [...running.values()].filter(alive);
  for (const child of open)
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  await Promise.all(open.map((c) => (alive(c) ? new Promise((r) => c.once('exit', r)) : null)));
  for (const dir of [...profiles, work]) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
    console.log(`  ${existsSync(dir) ? 'COULD NOT REMOVE' : 'removed'} ${dir}`);
  }
  console.log(
    'Reminder: server data is only deleted by "Delete my group data from the server" in the extension.',
  );
  process.exit(code);
}

process.on('SIGINT', () => void cleanup('Ctrl+C.'));
process.on('SIGTERM', () => void cleanup('Stopped.'));
process.on('SIGHUP', () => void cleanup('Terminal closed.'));

function launch(edge, label) {
  const profile = tempDir(`studylens-try-${label}-`);
  profiles.push(profile);
  const child = spawn(
    edge,
    [
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { stdio: 'ignore' },
  );
  running.set(label, child);
  child.on('exit', () => {
    console.log(`Window "${label}" closed.`);
    if (![...running.values()].some(alive)) void cleanup('All windows closed.');
  });
  console.log(`Window "${label}": profile ${profile}`);
}

try {
  const { files, version } = makeStoreIdCopy(EXT);
  const manifest = JSON.parse(readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const id = idFromKey(manifest.key);
  if (id !== STORE_ID) throw new Error(`the key gives ID ${id}, expected the store ID ${STORE_ID}`);
  console.log(`Extension copy ${version}: ${files} files identical to the build, store ID ${id}.`);
  const edge = edgePath();
  launch(edge, 'you');
  if (TWO) launch(edge, 'friend');
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
