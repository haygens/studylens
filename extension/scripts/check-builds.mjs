/**
 * Proves the normal Firefox/Edge builds contain none of the E2E-only test code (session lengths
 * in seconds). Run after building: `npm run check:builds -w extension`.
 *
 * - Every `.output/<browser>-mv3` folder must exist and must NOT contain the E2E markers.
 * - An E2E build (`*-e2e`), if present, MUST contain them, so this check can't pass by accident.
 * - Both manifests are complete and browser-correct: MV3, the same 4 permissions, no host
 *   permissions at install, exactly one OPTIONAL host permission (the StudyLens server, asked for
 *   only when the user joins a study group — P16), never in private windows, every icon file
 *   present. Edge: a service worker and no Firefox-only keys. Firefox: background scripts, the
 *   add-on ID that must never change, and data collection "none" required with only the study
 *   group category optional.
 * - Normal builds talk to the production server; only the E2E build knows the local test server.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Node 24 runs TypeScript files directly (type stripping), so the URLs have one source.
import { E2E_API_BASE, OPTIONAL_DATA_COLLECTION, PRODUCTION_API_BASE } from '../server-urls.ts';

const outRoot = fileURLToPath(new URL('../.output/', import.meta.url));
const MARKERS = ['studylens-e2e-build', 'E2E test build', 'testSeconds', E2E_API_BASE];
const REQUIRED = ['firefox-mv3', 'edge-mv3'];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

function markersIn(dir) {
  const found = new Set();
  for (const file of files(dir)) {
    if (!/\.(js|html|json|css)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of MARKERS) if (text.includes(m)) found.add(`${m} (${path.relative(dir, file)})`);
  }
  return [...found];
}

let failed = false;

const PERMISSIONS = ['alarms', 'idle', 'storage', 'tabs'];
const GECKO_ID = 'studylens@haygens.github.io';

/** Problems with a normal build's manifest (empty when it is correct). */
function manifestProblems(name, dir) {
  const m = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const problems = [];
  const check = (ok, text) => ok || problems.push(text);
  check(m.manifest_version === 3, 'manifest_version is not 3');
  check(m.name === 'StudyLens' && typeof m.version === 'string', 'name/version');
  check(
    JSON.stringify([...(m.permissions ?? [])].sort()) === JSON.stringify(PERMISSIONS),
    `permissions are ${JSON.stringify(m.permissions)}`,
  );
  check(!m.host_permissions && !m.optional_permissions, 'host permissions at install');
  check(
    JSON.stringify(m.optional_host_permissions) === JSON.stringify([`${PRODUCTION_API_BASE}/*`]),
    `optional_host_permissions are ${JSON.stringify(m.optional_host_permissions)}`,
  );
  check(
    files(dir).some(
      (f) => f.endsWith('.js') && readFileSync(f, 'utf8').includes(PRODUCTION_API_BASE),
    ),
    'the code does not use the production server URL',
  );
  check(!m.content_scripts, 'content scripts');
  check(m.incognito === 'not_allowed', 'incognito is not not_allowed');
  const icons = { ...m.icons, ...m.action?.default_icon };
  check(m.icons?.['128'], 'no 128px icon');
  for (const file of Object.values(icons)) {
    check(existsSync(path.join(dir, file)), `missing ${file}`);
  }
  check(existsSync(path.join(dir, m.action?.default_popup ?? '-')), 'missing popup');
  check(existsSync(path.join(dir, m.options_ui?.page ?? '-')), 'missing options page');
  if (name.startsWith('edge')) {
    check(
      m.background?.service_worker === 'background.js' && !m.background?.scripts,
      'Edge needs a service worker',
    );
    check(!m.browser_specific_settings, 'Firefox-only browser_specific_settings in the Edge build');
  } else {
    check(Array.isArray(m.background?.scripts), 'Firefox needs background scripts');
    check(m.browser_specific_settings?.gecko?.id === GECKO_ID, 'Firefox add-on ID changed');
    const dc = m.browser_specific_settings?.gecko?.data_collection_permissions;
    check(
      JSON.stringify(dc) ===
        JSON.stringify({ required: ['none'], optional: OPTIONAL_DATA_COLLECTION }),
      `data_collection_permissions are ${JSON.stringify(dc)}`,
    );
  }
  return problems;
}
for (const name of REQUIRED) {
  const dir = path.join(outRoot, name);
  if (!existsSync(dir)) {
    console.error(`✗ ${name}: missing — run the normal builds first.`);
    failed = true;
    continue;
  }
  const found = markersIn(dir);
  if (found.length) {
    console.error(`✗ ${name}: contains E2E-only code: ${found.join(', ')}`);
    failed = true;
  } else {
    console.log(`✓ ${name}: no E2E-only code`);
  }
  const problems = manifestProblems(name, dir);
  if (problems.length) {
    console.error(`✗ ${name}: manifest: ${problems.join('; ')}`);
    failed = true;
  } else {
    console.log(`✓ ${name}: manifest complete and correct for this browser`);
  }
}

for (const name of existsSync(outRoot) ? readdirSync(outRoot) : []) {
  if (!name.endsWith('-e2e')) continue;
  const found = markersIn(path.join(outRoot, name));
  if (found.length === 0) {
    console.error(`✗ ${name}: E2E build has no markers — the check above would prove nothing.`);
    failed = true;
  } else {
    console.log(`✓ ${name}: E2E build has the test-only code (expected)`);
  }
}

process.exit(failed ? 1 : 0);
