/**
 * Proves the normal Firefox/Edge builds contain none of the E2E-only test code (session lengths
 * in seconds). Run after building: `npm run check:builds -w extension`.
 *
 * - Every `.output/<browser>-mv3` folder must exist and must NOT contain the E2E markers.
 * - An E2E build (`*-e2e`), if present, MUST contain them, so this check can't pass by accident.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outRoot = fileURLToPath(new URL('../.output/', import.meta.url));
const MARKERS = ['studylens-e2e-build', 'E2E test build', 'testSeconds'];
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
