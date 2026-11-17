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
- Database: **Turso** — NOT set up yet. All server data access goes through `web/lib/db/` (a data layer
  with an interface), so the backend can start with an in-memory/stub implementation.
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
- Web dev: `npm run dev -w web` (http://localhost:3000, health check at `/api/health`)
- Web build: `npm run build -w web`
- Tests (all workspaces): `npm test` — watch mode: `npm run test:watch`
- E2E tests (builds the E2E version, runs Playwright in installed Edge): `npm run test:e2e`
  — watch in a visible browser: `npm run test:e2e -- --headed`. Never install extra browsers locally.
- Prove normal builds have no E2E-only code (after both builds): `npm run check:builds -w extension`
- Icons (after editing `extension/assets/icon.svg`): `npm run icons -w extension`
- Store screenshots → `docs/store/screenshots/`: `npm run screenshots -w extension`
- Firefox add-on ID `studylens@haygens.github.io` (in `extension/wxt.config.ts`) must NEVER change.
- Lint: `npm run lint`
- Format: `npm run format` — check only: `npm run format:check`
- Typecheck (all workspaces): `npm run typecheck`
- Everything CI runs: `npm run lint; npm run format:check; npm run typecheck; npm test`, both builds +
  `check:builds`, and (separate job) `npm run test:e2e`

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
