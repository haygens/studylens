# StudyLens — CLAUDE.md

StudyLens is a privacy-respecting study/focus browser extension with a research question:
**Which focus interventions actually help students study?**
Solo project for TCSS 490 Artifact 5 ("moonshot"). Final show and tell: **Monday, December 7, 2026**.

## Owner and workflow

- Owner: hs (solo). Windows machine, PowerShell. Comfortable with JS/TS basics, newer to the command line.
- Repo location: **`M:\Projects\studylens`** (moved from C: in Nov 2026 because C: ran out of space).
  The npm cache and TEMP/TMP/CLAUDE_CODE_TMPDIR point to M: as well.
- **Keep build/test output and caches off C:.** Don't redirect anything (Playwright browsers, npm/npx
  caches, temp profiles, logs) to C:. Report C: and M: free space in every Handoff.
- hs plans in a separate claude.ai chat and pastes prompts here. **At the end of every session, print a
  "Handoff" block** (see bottom) so hs can paste it back into the planning chat.
- When giving hs commands to run, give numbered, copy-paste PowerShell commands. No bash-only syntax.

## Stack

- Language: **TypeScript** everywhere (strict mode).
- Extension: **WXT** framework + **React**. Targets: **Firefox (MV3)** and **Edge (Chromium MV3)**.
  Chrome/Safari are future work — don't add Chrome-only or Safari-specific code.
- Web: **Next.js on Vercel (Hobby plan)** — React dashboard + API routes in one app.
- Database: **Turso** (libSQL via `@libsql/client`) — code done in P15, the Turso database and Vercel
  project are created by hs in the web dashboards. All server data access goes through the `Db`
  interface in `web/lib/db/` (libSQL implementation + in-memory stub). Schema = numbered migrations
  in `web/lib/db/schema.ts` (never edit a shipped one). See `docs/backend.md`.
- On this PC the libSQL native driver can't load (no Visual C++ runtime), so local `file:` databases
  fall back to Node's built-in `node:sqlite` automatically. CI forces real libSQL (`REQUIRE_LIBSQL=1`).
- The extension must not call the server until P16 (optional host permission, asked at join time).
- Tests: **Vitest**. CI: **GitHub Actions** (public repo).
- Tooling versions: Node 24, npm 11, TypeScript 6.0.x (TS 7 not yet supported by typescript-eslint),
  ESLint 10 flat config, Prettier 3.
- **No `gh` or `vercel` CLI.** Use plain `git` only. The GitHub repo is created on github.com;
  Vercel deploys automatically from GitHub (project root directory: `web/`). Env vars are set in the
  Vercel dashboard.

## Repo layout (npm workspaces)

```
studylens/
  CLAUDE.md
  PRIVACY.md
  docs/PLAN.md        # the plan, broken into pieces with checkboxes
  docs/LOG.md         # session log (required by the course) — append every session
  extension/          # WXT extension (popup, background, options/dashboard pages)
  web/                # Next.js app: API routes + web dashboard
  packages/shared/    # shared TypeScript types (session summary, intervention ids, etc.)
  .github/workflows/  # CI
```

## Privacy rules (non-negotiable — these are the project's core promise)

1. **Local-first.** All tracking data lives in the extension's local storage (IndexedDB or
   `storage.local`). Nothing leaves the device unless the user opts in.
2. **Domains only.** Record hostnames (`youtube.com`), never full URLs, paths, query strings, page titles,
   page content, keystrokes, form data, or screenshots.
3. **Minimal permissions.** Prefer `tabs`, `idle`, `alarms`, `storage`. Do NOT request broad host
   permissions (`<all_urls>`) at install. Request optional permissions at runtime only when a feature
   needs them (e.g. blocking during focus mode).
4. **Off in private windows.** Never track incognito/private browsing.
5. **User controls.** Pause tracking, a "My Data" page showing raw stored records, one-click export (JSON),
   one-click delete-all.
6. **Retention.** Raw session records older than 30 days are rolled into weekly totals, then deleted
   (via `alarms`). Server error logs expire after 14 days (via Vercel Cron).
7. **Sharing is opt-in and summary-only.** Anything synced (study groups, research data) is aggregate
   numbers like "focused 2h 15m", never site lists. Show a preview before anything is shared.
8. **No third-party analytics or trackers** in the extension or web app.
9. **Research consent.** No research data is sent anywhere without an explicit in-app consent screen.

If a requested change would break one of these rules, stop and tell hs instead of doing it.

## Research design (summary — details in docs/PLAN.md)

- Each focus session is randomly assigned one condition: `control`, `friction` (short countdown before a
  distraction site loads), or `intention` ("What did you come here for?" prompt).
- Measures: distraction visits, time on distraction sites, self-rated focus (1–5), goal completed (y/n).
- Users categorize sites themselves: study / neutral / distraction.
- **No research data from other people until IRB approval** (with Dr. Su). Before Dec 7: friends give
  usability feedback only; the study = design + preregistration draft + hs's own N=1 pilot.
- Every session has a `mode` (`solo` | `group`); group sessions are excluded from the main analysis.

## Conventions

- Small, focused commits with clear messages. Run tests before committing.
- Keep functions small; put browser-API calls behind thin wrappers so logic is unit-testable.
- Use the `browser.*` API via WXT (works on Firefox and Edge).
- Secrets go in environment variables (`.env.local`, Vercel env), never in code. `.env*` is gitignored.
- Update `docs/PLAN.md` checkboxes when a piece is done.

## Commands (run from the repo root)

- Install: `npm install` (CI uses `npm ci`)
- Extension dev (Firefox): `npm run dev:firefox -w extension`
- Extension dev (Edge): `npm run dev:edge -w extension`
- Extension build: `npm run build:firefox -w extension` / `npm run build:edge -w extension`
  (output in `extension/.output/`)
- Extension store zip: `npm run zip:firefox -w extension` / `npm run zip:edge -w extension`
- Web dev: `npm run dev -w web` (http://localhost:3000, health check at `/api/health`).
  Env: copy `web/.env.example` to `web/.env.local` (gitignored); `TURSO_DATABASE_URL=file:.data/dev.db`
  for a local DB file in `web/.data/` (on M:), or leave it empty for the in-memory stub.
- Web build: `npm run build -w web` (also runs in CI)
- API endpoints (P15): `GET /api/health`, `POST /api/devices`, `POST /api/errors` (bearer token),
  `GET /api/cleanup` (Vercel Cron, `CRON_SECRET`; schedule in `web/vercel.json`). Details:
  `docs/backend.md`. Database/API tests use temp DB files in `web/.data/test/` (or
  `STUDYLENS_TEST_DB_DIR`) and delete them afterwards.
- Tests (all workspaces): `npm test` — watch mode: `npm run test:watch`
- E2E tests (builds the E2E version and the normal Edge build, runs Playwright in installed Edge):
  `npm run test:e2e`
  — watch in a visible browser: `npm run test:e2e -- --headed`. Never install extra browsers locally.
- Smoke test of the real production Edge build (`.output/edge-mv3`, installed Edge, headless):
  `npm run smoke:edge` — replaces the manual Edge check before store submission.
- Prove normal builds have no E2E-only code (after both builds): `npm run check:builds -w extension`
- Icons (after editing `extension/assets/icon.svg`): `npm run icons -w extension`
- Store screenshots → `docs/store/screenshots/`: `npm run screenshots -w extension`
- UX screenshots of every screen, real size, per theme → `docs/ux-review/after/<theme>/`:
  `npm run build:e2e -w extension; node extension/scripts/ux-review-shots.mjs sunrise` (or `ocean`,
  `pastel`; no theme = the old v0.2.0 set in `docs/ux-review/screens/`)
- Themes: tokens in `extension/src/ui/themes.ts` (every color must come from there; unit tests check
  WCAG AA for every pair in `theme-pairs.ts`). Feedback form link: `FEEDBACK_URL` in
  `extension/src/ui/feedback.ts` (set to the anonymous Microsoft Form; empty = hidden).
- Firefox add-on ID `studylens@haygens.github.io` (in `extension/wxt.config.ts`) must NEVER change.
- Edge Add-ons store ID: `phepgpemnllainhhjemgknaeedjjekad` (assigned by Microsoft; listing:
  https://microsoftedge.microsoft.com/addons/detail/studylens/phepgpemnllainhhjemgknaeedjjekad).
  Updates are uploaded as a new package to this same product in Partner Center.
- Lint: `npm run lint`
- Format: `npm run format` — check only: `npm run format:check`
- Typecheck (all workspaces): `npm run typecheck`
- Everything CI runs: `npm run lint; npm run format:check; npm run typecheck; npm test`, the web build,
  both extension builds + `check:builds`, and (separate job) `npm run test:e2e`

## End-of-session handoff (always print this)

```
## Handoff — <date>
Done: <bullets>
Changed files: <list>
Tests: <pass/fail + count>
Problems / open questions: <bullets>
Disk space: C: <GB free>, M: <GB free>
Next piece (from PLAN.md): <id + name>
```

Also append the same content to `docs/LOG.md`.
