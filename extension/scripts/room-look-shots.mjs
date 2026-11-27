/**
 * P21: screenshots of the live room's three looks (phone 390 px and desktop 1280 px) for the
 * store listing and show and tell → docs/store/screenshots/looks/. Runs the room-looks E2E test
 * (it starts the local web server and makes a demo room) with STUDYLENS_LOOK_SHOTS=1.
 * Run: `npm run screenshots:looks -w extension`. The PNGs are committed.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

mkdirSync(fileURLToPath(new URL('../../docs/store/screenshots/looks/', import.meta.url)), {
  recursive: true,
});
const res = spawnSync('npx playwright test e2e/room-looks.e2e.ts', {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, STUDYLENS_LOOK_SHOTS: '1' },
  stdio: 'inherit',
  shell: true,
});
process.exit(res.status ?? 1);
