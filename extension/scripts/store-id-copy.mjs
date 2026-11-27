/**
 * The "store-ID copy" of the normal Edge build, shared by `smoke-live.mjs` (automated production
 * check) and `try-live.mjs` (manual test window).
 *
 * The build is copied to a temp folder with TWO manifest-only changes (every other file is checked
 * to be byte-identical to `.output/edge-mv3`):
 *  - `key`: the Edge Add-ons store's public key, so the copy gets the store's extension ID
 *    (phepgpemnllainhhjemgknaeedjjekad). The production server's CORS accepts only that origin
 *    (an unpacked build otherwise gets a random ID). The key is public: Edge writes it into every
 *    installed copy's manifest.
 *  - the server origin moves from `optional_host_permissions` to `host_permissions`: the state
 *    after clicking "Allow" in the browser's prompt, which Playwright can't click.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Node 24 runs TypeScript files directly (type stripping).
import { PRODUCTION_API_BASE } from '../server-urls.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BUILD = path.join(ROOT, '.output', 'edge-mv3');
export const STORE_ID = 'phepgpemnllainhhjemgknaeedjjekad';
/** Public key of the Edge Add-ons listing (from the store's CRX header). */
export const STORE_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoKP+rzb85DOjdDXyCePwaf1AgI0bJN5aYzViwlGASxb3g3JB77IIwu1O7kvtv0c0RVehcfKMv7edwf9efqW5k51agaHcNyp6Yc8OMKcTrDPs2Em/luYGnwnHRhIWEG3S6MCb3xh2Vykai/9OEvHcH3NCzK3sSVqATQq44KeC0nQeSCbL1rIG4ToiB3yGfWbZXE708UsZ2QsnoDfRWPIh9P4B/Jng4AzT5T7MPZXgF/98dcDhj64wrDkwNR55RCjMBrE0mPJHBf4YS3hjvtNfY4LvG2SxsCU+SL2rnWVNSwTqfQ94zcC1BbCvTUm48nzbTQv9n0Y+9oaRyijJYppUjQIDAQAB';
export const API = PRODUCTION_API_BASE;

/** A new folder in TEMP; refuses to work on C: (CLAUDE.md: keep output off C:). */
export function tempDir(prefix) {
  const base = os.tmpdir();
  if (/^c:/i.test(base)) throw new Error(`TEMP is on C: (${base}); point TEMP/TMP to M: first.`);
  return mkdtempSync(path.join(base, prefix));
}

/** SHA-256 of every file under `dir`, keyed by its relative path (forward slashes). */
export function hashes(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        out.set(
          path.relative(dir, full).split(path.sep).join('/'),
          createHash('sha256').update(readFileSync(full)).digest('hex'),
        );
    }
  };
  walk(dir);
  return out;
}

/**
 * Copies `.output/edge-mv3` to `dest` and applies the two manifest changes above. Throws if the
 * build's optional host permission isn't exactly the production server, or if any file other than
 * the manifest differs from the build. Returns the number of identical files and the version.
 */
export function makeStoreIdCopy(dest) {
  cpSync(BUILD, dest, { recursive: true });
  const manifestPath = path.join(dest, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const optional = JSON.stringify(manifest.optional_host_permissions);
  if (optional !== JSON.stringify([`${API}/*`]))
    throw new Error(`unexpected optional_host_permissions: ${optional}`);
  manifest.key = STORE_PUBLIC_KEY;
  manifest.host_permissions = [`${API}/*`];
  delete manifest.optional_host_permissions;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const a = hashes(BUILD);
  const b = hashes(dest);
  a.delete('manifest.json');
  b.delete('manifest.json');
  const differ = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
  if (differ.length) throw new Error(`files differ from the build: ${differ.join(', ')}`);
  return { files: a.size, version: manifest.version };
}
