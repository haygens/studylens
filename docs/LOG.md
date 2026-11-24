# StudyLens — Project Log

Append an entry every session (Claude Code prints a Handoff block — paste it here).
Newest entries at the bottom.

---

## 2026-11-14 — Planning

Done:

- Chose the moonshot: StudyLens, a privacy-respecting focus/study extension with a research question
  (which focus interventions help students study?).
- Decided stack: TypeScript, WXT + React extension (Firefox + Edge), Next.js on Vercel, Turso later,
  Vitest + GitHub Actions, public repo.
- Wrote CLAUDE.md, docs/PLAN.md (20 pieces over 3 weeks), PRIVACY.md draft.

Decisions:

- Firefox + Edge only (both free to publish); Chrome ($5) and Safari ($99/yr, needs a Mac) are future work.
- Local-first, domains-only tracking; sharing is opt-in and summary-only.
- Users: friends. Confirm consent approach with instructor before presenting results.

Next piece: P1 — Repo scaffold.

---

## Handoff — 2026-11-14 (P1 Repo scaffold)

Done:

- `git init` (branch `main`) + npm workspaces monorepo: `extension/`, `web/`, `packages/shared/`.
- Extension: WXT 0.21 + React 19 + strict TS. Scripts `dev:firefox`, `dev:edge`, `build:firefox`,
  `build:edge`, `zip:firefox`, `zip:edge`. Manifest permissions: `storage`, `tabs`, `idle`, `alarms`
  only; `incognito: "not_allowed"`; Firefox `data_collection_permissions: none`. Placeholder popup
  "StudyLens". Both builds verified.
- Web: Next.js 16 (App Router) placeholder page + `GET /api/health` → `{ ok: true }`.
  `web/lib/db/` has a `Db` interface, in-memory stub, and `getDb()`. `next build` verified.
- Shared: `InterventionId` (+ `INTERVENTION_IDS`, `isInterventionId`) and `SessionSummary` (no domains).
- Root Vitest (one project per workspace), ESLint 10 flat config (typescript-eslint, react-hooks,
  Next plugin), Prettier, `.gitignore`, `.gitattributes` (LF line endings).
- CI: `.github/workflows/ci.yml` — npm ci, lint, format check, typecheck, test on ubuntu-latest.
- CLAUDE.md: real Commands section; Stack notes no gh/vercel CLI, GitHub repo made on the website,
  Vercel auto-deploys from GitHub with root directory `web/`.

Changed files: root `package.json`, `package-lock.json`, `tsconfig.base.json`, `vitest.config.ts`,
`eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.gitattributes`,
`.github/workflows/ci.yml`, `packages/shared/**`, `extension/**`, `web/**`, CLAUDE.md, docs/PLAN.md,
docs/LOG.md (Prettier also reformatted PRIVACY.md/PLAN.md whitespace only).

Tests: pass — 5 tests in 4 files (shared 2, extension 1, web 2). Lint, format check, typecheck clean.

Problems / open questions:

- Not pushed yet — hs creates the empty public repo on github.com, then runs the push commands.
- TypeScript pinned to 6.0.x: TS 7 is out but typescript-eslint only supports <6.1.
- `npm audit`: 7 moderate (minimatch, in dev-only tooling, not shipped). Left as-is; revisit later.
- Firefox add-on ID is a placeholder (`studylens@studylens.dev`); pick a final one before AMO
  submission (P7) — it can't change after the first upload.

Next piece (from PLAN.md): P2 — Activity tracking (background).

## Handoff — 2026-11-14 (P2)

Done:

- Pure tracker `extension/src/tracker/tracker.ts`: `step(state, event, now)` → new state + closed
  segments `{ hostname, start, end }`. Events: `tab`, `focus`, `idle`, `paused`, `heartbeat`, `sync`.
  Tracks only when window focused + idle state `active` + not paused + trackable hostname.
- `hostname.ts`: http/https only, lowercase, strips `www.`; ignores about:, edge://, chrome://,
  moz-extension://, file://, data:, Edge's `ntp.msn.com` new tab. Never keeps path/query/title.
- Suspension safety: whole state persisted in `storage.local` after every event; open segment has
  `lastSeen`. 1-minute heartbeat alarm re-reads full browser state. Gap cap `MAX_GAP_MS` = 2 min:
  gaps up to 2 min are counted; a bigger gap (sleep/crash/browser closed) closes the segment at its
  last confirmed time and the unverified gap counts as 0 (conservative — never over-counts).
- Segments < 1 s dropped. Stored in day buckets `activity:YYYY-MM-DD` via
  `src/storage/activity-store.ts` (behind a `KeyValueStore` interface). Paused flag key
  `tracking:paused` (no UI yet).
- Background: thin wrappers in `src/background/browser-adapter.ts`; `entrypoints/background.ts`
  serializes events through a promise queue. Idle threshold 60 s. Private-window tabs ignored.
- TEMPORARY popup debug view (`entrypoints/popup/DebugActivity.tsx`): today's minutes per hostname.

Changed files: `extension/src/tracker/{tracker,hostname,totals,tracker.test}.ts`,
`extension/src/storage/{activity-store,activity-store.test}.ts`,
`extension/src/background/browser-adapter.ts`, `extension/entrypoints/background.ts`,
`extension/entrypoints/popup/{App,DebugActivity}.tsx`, docs/PLAN.md, docs/LOG.md.

Tests: pass — 23 tests in 6 files (16 new tracker/storage tests). Lint, format check, typecheck,
Firefox + Edge builds clean. Permissions still only storage/tabs/idle/alarms, incognito not_allowed.

Problems / open questions:

- Gap-cap policy: over-cap gaps count 0 (not "count up to the cap"). Loses ≤1 min per crash/sleep;
  never invents time. Change `MAX_GAP_MS`/policy in tracker.ts if the planner prefers otherwise.
- The 60 s before an idle event still counts as active (user may be reading). Could subtract it later.
- `www.` is stripped so `www.youtube.com` and `youtube.com` merge; other subdomains stay separate
  (`m.youtube.com`). P3 categories may want a "registrable domain" grouping.
- Segments crossing midnight are stored under their start day; readers clip (see `totalsByHostname`).
- Manual browser test on Firefox still to do by hs (checklist in session output).

Next piece (from PLAN.md): P3 — Site categories.

## 2026-11-14 — P2 manual test

P2 manual test in Firefox (2026-11-14): tracking works; time stops when Firefox loses focus; private
windows not tracked. Idle test not yet done. Observed wikipedia.org and en.wikipedia.org as separate
rows (fixed in P3).

## Handoff — 2026-11-14 (P3)

Done:

- Site grouping: `extension/src/tracker/registrable-domain.ts` → `registrableDomain(host)` using the
  bundled tldts public suffix list (offline; ICANN suffixes only, so `foo.github.io` → `github.io`).
  IPs/localhost returned unchanged. Kept out of `hostname.ts` so the background script stays 3.8 kB.
  Hostnames are still stored as-is; grouping happens only when reading.
- Category rules (`src/categories/rules.ts`, pure): `{ domain, category }`; a rule covers its
  subdomains; most specific (longest) domain wins; unlabeled = neutral. `siteKey()` gives a
  subdomain with its own rule (docs.google.com) its own display row so rows never mix categories.
  `normalizeRuleDomain()` accepts pasted URLs / `www.` / caps, rejects bare suffixes (`com`, `co.uk`).
- `src/categories/sites.ts`: `totalsBySite()` / `unlabeledSites()`. `src/categories/suggestions.ts`:
  12 built-in suggestions, only applied on Accept / Accept all; hidden once any rule exists for that
  domain. `SiteCategory` type added to `packages/shared`.
- `src/storage/categories-store.ts`: rules in `storage.local` key `categories:rules` (validated,
  de-duplicated on load and save). `recentHostTotals()` added to activity-store (last N days).
- Options page (`entrypoints/options/`, opens in a tab): Your labels (add / edit domain / change
  category / remove), Sites you visited recently (unlabeled, last 7 days, top 15, quick buttons),
  Suggestions (Accept / Accept all).
- Popup debug view: rows grouped by site with category column (hover shows merged hostnames),
  current site's category, "Edit site categories…" button.

Changed files: `extension/src/tracker/{hostname,registrable-domain}.ts`,
`extension/src/categories/{rules,rules.test,sites,suggestions,display}.ts`,
`extension/src/storage/{activity-store,activity-store.test,categories-store,categories-store.test}.ts`,
`extension/entrypoints/options/{index.html,main.tsx,App.tsx}`,
`extension/entrypoints/popup/DebugActivity.tsx`, `extension/package.json`, `package-lock.json`,
`packages/shared/src/{types,types.test}.ts`, docs/PLAN.md, docs/LOG.md.

Tests: pass — 46 tests in 8 files (23 new). Lint, format check, typecheck, Firefox + Edge builds
clean. Permissions unchanged (storage/tabs/idle/alarms), incognito not_allowed, no host permissions.

Problems / open questions:

- Private suffixes (github.io, vercel.app) are NOT treated as suffixes, so all `*.github.io` sites
  group together. Flip `allowPrivateDomains` in registrable-domain.ts if that's unwanted.
- "Recently visited" counts finished segments only (the open segment appears after it closes).
- Options page doesn't live-update if tracking happens while it's open; reload the page.
- Manual Firefox test of P3 still to do by hs.

Next piece (from PLAN.md): P4 — Focus sessions.

## Handoff — 2026-11-15 (P4)

Done:

- Fix: registrable-domain grouping now uses tldts `allowPrivateDomains`, so hosted sites
  (`someone.github.io`, `app.vercel.app`) get their own rows. Tests added.
- `src/sessions/session.ts`: session types (`ActiveSession`, `FocusSession` with `condition: null`
  for P8 and `checkIn: null` for P5), goal/duration validation (5–180 whole minutes), badge text,
  countdown formatting.
- `src/sessions/session-stats.ts` (pure): `computeSessionStats()` → minutes per category (clipped
  to the session, rounded to 0.1) + distraction visits. A visit = a distraction segment that starts
  during the session and is not a no-gap continuation of the same site. Switching between two
  different distraction sites counts; coming back after a gap counts; a distraction site already
  open at session start does not count (its minutes do).
- `src/storage/sessions-store.ts`: `sessions:active` (one at a time) and `sessions:history` in
  `storage.local`, validated on load.
- `src/sessions/session-controller.ts`: start / end early / reconcile / badge refresh, with alarms
  and badge injected. Reconcile runs on every background wake-up, on `runtime.onStartup`, and on
  the end alarm: an overdue session ends at its planned end time.
- Background: one shared task queue for tracking + sessions; the tracker gets a heartbeat right
  before a session ends so the current site is counted. Popup → background messages
  (`session:start`, `session:end-early`, `session:check`). Alarms: `studylens-session-end` at the
  planned end, `studylens-session-tick` every minute aligned to the badge's minute changes.
- Popup: goal box, 25 / 50 / custom (5–180) minutes, Start; while running: goal, live countdown,
  end time, End early; "Last session" summary line. Debug view moved below.
- PRIVACY.md: lists the per-session numbers stored.

Changed files: `extension/src/tracker/registrable-domain.ts`, `extension/src/categories/rules.test.ts`,
`extension/src/sessions/{session,session.test,session-stats,session-stats.test,session-controller,session-controller.test,messages}.ts`,
`extension/src/storage/{sessions-store,sessions-store.test}.ts`,
`extension/src/background/browser-adapter.ts`, `extension/entrypoints/background.ts`,
`extension/entrypoints/popup/{App,FocusSession,DebugActivity}.tsx`, PRIVACY.md, docs/PLAN.md,
docs/LOG.md.

Tests: pass — 77 tests in 12 files (31 new). Lint, format check, typecheck, Firefox + Edge builds
clean. Permissions unchanged (storage/tabs/idle/alarms), incognito not_allowed, no notifications.

Problems / open questions:

- A goal is required to start (needed for P5's "did you finish your goal?"). Say if it should be
  optional.
- Category rules are applied when the session ends; editing rules later doesn't recompute old
  sessions.
- Bare private suffixes (e.g. a rule for `github.io`) are still accepted as rule domains and label
  every `*.github.io` site.
- When the session ends with the popup closed, nothing pops up — the badge just disappears (P5 adds
  the check-in).
- Manual Firefox test of P3 + P4 still to do by hs.

Next piece (from PLAN.md): P5 — End-of-session check-in.

## Handoff — 2026-11-16 (P4 popup bug fix)

Done:

- Bug from the P4 manual test in Firefox: the popup showed only an empty debug box, with no
  session section, no rows and no console error.
- Root cause (code side): both popup sections loaded from `browser.storage.local` with no error
  handling and no timeout, and drew nothing while waiting (`if (!loaded) return null` in
  FocusSession; `snap === null` in the debug view). One storage read that failed or never
  answered left both sections blank. The empty debug box itself proves this: both
  sections were stuck waiting at the same time, and they share nothing except `storage.local`.
- Likely trigger: the C: drive was full (0 MB free) when the test ran. Firefox keeps
  `storage.local` in IndexedDB in the profile on C:, so storage could not answer. Not confirmed
  in the browser; re-test now that there is space.
- Ruled out with tests: the session-end path with the popup closed (alarm → reconcile → history
  written, `sessions:active` = null), the storage shape the popup reads after that, and UTC/local
  mixing (`dayKey` and `startOfLocalDay` both use local time; a test at 23:30 Pacific confirms).
- Fix: new `extension/src/popup/popup-data.ts`. `loadSessionView` and `loadDebugSnapshot` return a
  `LoadState` (loading / ready / error) and never reject or hang (`settle` with a 5 s timeout;
  errors are also logged with `console.error`).
- Popup: "Loading..." while loading, a red error box with the message and a Retry button on
  failure, and a React `ErrorBoundary` around each section so a render crash shows an error
  instead of a blank popup.

Changed files: `extension/src/popup/{popup-data,popup-data.test}.ts` (new),
`extension/entrypoints/popup/{ErrorBoundary,LoadStatus}.tsx` (new),
`extension/entrypoints/popup/{App,FocusSession,DebugActivity}.tsx`, docs/LOG.md.

Tests: pass — 86 tests in 13 files (9 new). Lint, format check, typecheck, Firefox + Edge builds
clean.

Problems / open questions:

- The disk-full trigger is not confirmed. Re-run the P4 manual test now that C: has space, and
  keep C: above a few GB free.
- If the popup now shows "Timed out ... reading extension storage" or another error, check the
  background console (steps in the session reply) and send the error text.

Next piece (from PLAN.md): P5 — End-of-session check-in.

P4 retest in Firefox (2026-11-16) after the popup fix and freeing disk
space: 5-min session ended on its own with the popup closed; Last session showed study 0.6 /
distraction 0.6 min and 2 distraction visits, matching what I did; labels survived a reload; no
background console errors. P3 manual checks (grouping, suggestions, labels) also passed.

## Handoff — 2026-11-16 (P5 end-of-session check-in)

Done:

- Logged the P4/P3 Firefox retest (passed).
- Check-in after every focus session: shows the goal, "Did you finish your goal?" (Yes / Partly /
  No), "How focused were you?" (1–5, 1 = very distracted, 5 = fully focused), Save and Skip.
- Saved on the session as `checkIn`: `{ goalCompleted, focusRating, answeredAt }` or
  `{ skipped: true, reason, answeredAt }`. `reason` is `user` / `expired` / `new-session` (added
  beyond the spec so analysis can tell a real Skip from an auto-skip). Shared types:
  `CheckIn`, `GoalCompleted`, `FocusRating`, `SkipReason`, `isCheckIn` in packages/shared.
  `SessionSummary.goalCompleted` is now `'yes' | 'partly' | 'no'` instead of boolean.
- Popup open when the session ends → switches straight to the check-in (history change reloads
  the view). Popup closed → badge "?" and the next popup open shows the check-in first.
- Only the latest session can be pending. Auto-skip: older unanswered sessions, the pending one
  when a new session starts, and the pending one 12 h after it ended (checked on the 1-minute
  heartbeat, which also clears the "?" badge).
- Pure logic in `extension/src/sessions/check-in.ts` (pending selection, auto-skip, validation,
  formatting). The background validates every answer again before saving.
- Last session line now ends with e.g. "Finished: partly · Focus 4/5" or "Check-in skipped".
- Sessions saved before P5 have `checkIn: null`; the latest one may show a check-in once (or is
  auto-skipped if older than 12 h).
- PRIVACY.md: check-in answers (incl. skipped) stay on the device; no browser notifications.
  No new permissions; incognito still `not_allowed`.

Changed files: `extension/src/sessions/check-in{,.test}.ts` (new),
`extension/entrypoints/popup/CheckIn.tsx` (new), `extension/entrypoints/popup/FocusSession.tsx`,
`extension/entrypoints/background.ts`, `extension/src/sessions/{session,session-controller,
session-controller.test,messages}.ts`, `extension/src/storage/sessions-store.ts`,
`extension/src/popup/popup-data{,.test}.ts`, `packages/shared/src/types{,.test}.ts`, PRIVACY.md,
docs/PLAN.md, docs/LOG.md.

Tests: pass — 122 tests in 14 files (36 new). Lint, format check, typecheck, Firefox + Edge
builds clean.

Problems / open questions:

- Manual Firefox test of P5 not done yet (checklist in the session reply).
- Confirm `reason` on skipped check-ins is fine for the research design (P17 summaries can drop it).

Next piece (from PLAN.md): P6 — My Data page.

## Handoff — 2026-11-16 (P5b E2E tests)

Done:

- Playwright E2E tests in `extension/e2e/`. They load the E2E build of the extension into a fresh
  persistent browser profile: installed Microsoft Edge locally (`channel: 'msedge'`, no browser
  download), Playwright's Chromium in CI. Override with `E2E_CHANNEL`.
- No real internet: request routing serves stub pages for en.wikipedia.org and www.youtube.com
  and blocks every other http(s) request.
- Badge and storage are read from the background service worker
  (`chrome.action.getBadgeText`, `chrome.storage.local.get`), not from screenshots.
- Scenarios (7 tests, ~55 s): a) labels via the options page; b) 25 s session, Wikipedia →
  YouTube → Wikipedia → YouTube with the popup closed → badge "?", popup opens on the check-in,
  Partly + 4 → "Finished: partly · Focus 4/5", badge clears, `distractionVisits` = 2 and study /
  distraction minutes > 0; c) popup open at the end switches to the check-in, Skip → "Check-in
  skipped", reason `user`; d) End early → check-in right away, `endedEarly: true`; e) popup shows
  "Loading..." with slow storage and an error + Retry when storage never answers.
- E2E-only build: `wxt build -b edge --mode e2e` → `.output/edge-mv3-e2e`, named "StudyLens (E2E
  test build)". `__STUDYLENS_E2E__` is a build-time literal; only that build gets (1) a "Test length
  in seconds" field in the popup, which the background honors, and (2) OS idle ignored. Problem
  found: Chrome's idle state is system-wide, so with nobody touching the PC (or on a CI runner)
  the tracker correctly stopped counting and test b failed sometimes. Idle rules stay covered by
  unit tests.
- Proof the normal builds don't include it: `npm run check:builds -w extension` scans
  `.output/firefox-mv3` and `.output/edge-mv3` for the E2E markers and fails if found. It also
  fails if the E2E build lacks them, so it can't pass by accident. Runs in CI after both builds.
  Unit test: the flag is false in normal (test) builds and the gate ignores seconds when off.
- Scripts: `npm run test:e2e` (root or extension) builds the E2E version, then runs Playwright.
  CI has a separate `e2e` job; the fast `check` job now also builds both targets + `check:builds`.
- Playwright output folders (`test-results/`, `playwright-report/`, `blob-report/`) are gitignored.

Changed files: `extension/e2e/{fixtures,sessions.e2e,popup-loading.e2e}.ts`,
`extension/playwright.config.ts`, `extension/scripts/check-builds.mjs`,
`extension/src/e2e/test-seconds{,.test}.ts`, `extension/build-flags.d.ts` (all new);
`extension/{wxt.config,vitest.config}.ts`, `extension/package.json`, `extension/entrypoints/
{background.ts,popup/FocusSession.tsx}`, `extension/src/background/browser-adapter.ts`,
`extension/src/sessions/{session,session.test,session-controller,messages}.ts`,
`.github/workflows/ci.yml`, `.gitignore`, `.prettierignore`, `eslint.config.js`, `package.json`,
`package-lock.json`, CLAUDE.md, docs/PLAN.md, docs/LOG.md.

Tests: unit pass — 127 tests in 15 files (5 new). E2E pass — 7 tests (Edge 139, headless).
Lint, format check, typecheck, Firefox + Edge builds, `check:builds` clean.

Problems / open questions:

- C: has only ~2.3 GB free. E2E runs use a temporary browser profile that is deleted afterwards.
- Playwright's own browsers are not installed locally (on purpose). If a future Edge update blocks
  `--load-extension`, the fallback is `npx playwright install chromium` (~150 MB) +
  `E2E_CHANNEL=chromium`.
- The E2E build ignores OS idle, so idle handling is only unit-tested.

Next piece (from PLAN.md): P6 — My Data page.

## Handoff — 2026-11-16 (P6 My Data page)

Done:

- Options page now has two tabs: Site categories and **My Data** (`options.html#my-data`).
  The popup has a "My Data" link that opens it.
- My Data shows the raw stored data in tables: "Right now" (site being recorded, running
  session), activity records grouped by day (site, start, end, duration; newest day open),
  focus sessions (goal, planned/actual length, study/neutral/distraction minutes, distraction
  visits, check-in answers or skip reason in words, condition), and site labels. Also a "What
  StudyLens never collects" box matching PRIVACY.md and a plain retention note: 30 days, and the
  automatic cleanup isn't on yet (P12).
- Export: one button downloads every stored key, exactly as stored, as
  `studylens-export-YYYY-MM-DD.json` (Blob + temporary link, no downloads permission).
- Delete everything: type DELETE to confirm (no browser dialogs). The background removes every
  stored key, which ends a running session without a check-in. It also stops the session alarms
  and clears the badge. The page then says "Everything is deleted." The pause setting is kept
  if tracking was paused, so deleting never silently turns tracking back on.
- Pause tracking: a toggle in the popup ("Pause tracking" / yellow "Tracking paused" banner with
  Resume) and on My Data. Both use `tracking:paused`. A running session keeps its timer; the
  tracker records nothing while paused.
- Single source of truth: `extension/src/storage/keys.ts` lists every storage key; the stores take
  their key names from it. Delete removes _all_ keys present, including unknown ones. A test runs
  every write path (tracking, labels, sessions, check-ins, pause) and fails if any key isn't
  listed, then checks delete leaves storage empty.
- Pure modules with tests: `src/storage/keys.ts`, `src/my-data/{export,tables,delete-all}.ts`.
- E2E (`e2e/my-data.e2e.ts`): tables show a visited site and a finished session; export is
  valid JSON with those records; delete-all empties storage (only the tracker's empty
  bookkeeping returns), ends the running session, clears badge and alarms, and the popup shows
  the Start form with no Last session; pause records nothing, the session timer keeps running,
  and resume records again.
- Debug view in the popup left as is. No new permissions; incognito still `not_allowed`.
- PRIVACY.md: controls section describes My Data, pause, export, delete; retention notes that
  cleanup isn't on yet.

Changed files: `extension/src/storage/keys{,.test}.ts`, `extension/src/my-data/{export,tables,
delete-all}.ts` + `{export,tables}.test.ts`, `extension/src/ui/use-tracking-paused.ts`,
`extension/entrypoints/options/{App,MyData}.tsx`, `extension/entrypoints/popup/TrackingStatus.tsx`,
`extension/e2e/my-data.e2e.ts` (new); `extension/entrypoints/options/SiteCategories.tsx` (renamed
from App.tsx), `extension/entrypoints/options/index.html`, `extension/entrypoints/popup/App.tsx`,
`extension/entrypoints/background.ts`, `extension/src/background/browser-adapter.ts`,
`extension/src/sessions/messages.ts`, `extension/src/storage/{activity,categories,sessions}-store.ts`,
`extension/e2e/fixtures.ts`, PRIVACY.md, docs/PLAN.md, docs/LOG.md.

Tests: unit pass — 143 tests in 18 files (16 new). E2E pass — 10 tests (3 new) in local Edge.
Lint, format check, typecheck, Firefox + Edge builds, `check:builds` clean.

Problems / open questions:

- C: has 2.3 GB free (unchanged this session).
- Retention text promises 30 days, but nothing deletes old records until P12. Both My Data and
  PRIVACY.md say so plainly.
- "Delete everything" keeps `tracking:paused: true` if paused. Say if you'd rather it reset too.

Next piece (from PLAN.md): P7 — Privacy policy + store listing.

## Handoff — 2026-11-16 (P7 v0.1.0 release prep for AMO)

Done:

- Version 0.1.0 (`extension/package.json` + its `package-lock.json` entry). Firefox add-on ID is
  now `studylens@haygens.github.io`. It appears only in `extension/wxt.config.ts` (`GECKO_ID`) and
  must never change. The old placeholder ID appears nowhere except an earlier entry in this log.
- `strict_min_version: 142.0`, because `data_collection_permissions` needs Firefox 140 on desktop
  and 142 on Android, and 142 keeps lint free of that warning. Added `homepage_url` and an
  explicit toolbar `default_icon`.
- Icons: original lens-over-a-page SVG (`extension/assets/icon.svg`). PNGs at 16/32/48/96/128 in
  `extension/public/icon/`. They are rendered with the Playwright + Edge we already have
  (`npm run icons -w extension`), so there is no new dependency.
- Popup: the debug view became a plain "Today" section (Site / Category / Minutes table, "Now:"
  line, "Edit site categories…"). Renamed `DebugActivity` → `TodayActivity` and
  `loadDebugSnapshot` → `loadTodaySnapshot`. No "debug" or "P2/P3" wording is visible anywhere.
  E2E e1 now checks for that.
- PRIVACY.md finalized for 0.1.0: effective date, no network requests at all, 60 s idle rule,
  pause setting stored, cleanup "planned for a later version", future opt-in features
  described as not in 0.1.0, contact via GitHub issues.
- README.md: what it is, privacy summary, install placeholder, exact reviewer build steps
  (Windows 11, Node 24.22.0, npm 11.19.1, `npm ci`, `npm run build:firefox -w extension`).
- `docs/store/amo-listing.md`: name, summary (213 chars), description, categories, URLs, and
  reviewer notes covering every permission, domains-only, no remote code, and test steps.
- Screenshots (1280×800) in `docs/store/screenshots/`, made by `npm run screenshots -w extension`.
  It uses the E2E build (ignores OS idle, short session) but never captures the Start form, and
  checks before each capture that no test-only text is on screen.
- Zips: `wxt zip` now zips sources from the repo root with an allowlist (root package.json +
  lock, tsconfig.base, README, PRIVACY, `extension/**`, `packages/shared/**`,
  `web/package.json`). Excluded: node_modules, .output, .wxt, .env\*, tests, e2e,
  Playwright output.
- Reproducibility verified: unzipped the sources into a clean temp folder, ran `npm ci` and the
  Firefox build, and all 12 output files had SHA-256 hashes identical to the upload zip. The temp
  folder was then deleted.
- addons-linter 10.15.0 (the linter inside `web-ext lint`, installed temporarily and then
  removed): 0 errors, 0 notices, 2 warnings. Both are `innerHTML` inside React DOM's library
  code; our code never uses innerHTML.

Changed files: `extension/wxt.config.ts`, `extension/package.json`, `package-lock.json`,
`extension/entrypoints/popup/{App,TodayActivity}.tsx` (TodayActivity renamed from DebugActivity),
`extension/src/popup/popup-data{,.test}.ts`, `extension/e2e/popup-loading.e2e.ts`,
`extension/assets/icon.svg`, `extension/public/icon/{16,32,48,96,128}.png`,
`extension/scripts/{make-icons,screenshots}.mjs` (new), PRIVACY.md, README.md (new),
`docs/store/amo-listing.md` + `docs/store/screenshots/*.png` (new), CLAUDE.md, docs/LOG.md.

Tests: unit pass — 143 tests in 18 files. E2E pass — 10 tests in local Edge. Lint, format check,
typecheck, Firefox + Edge builds, `check:builds` clean. CI green on the release commit, tagged
`v0.1.0`.

Problems / open questions:

- C: has 1.54 GB free (was 2.3 GB). Most of the drop is the npm download cache growing during the
  clean-room `npm ci`. `npm cache clean --force` would free it, but future installs would be slower.
- No LICENSE file. AMO asks for a license (e.g. MIT). Pick one before or during upload.
- P7 is not checked off; it is done when Mozilla accepts the upload.
- "Delete everything" still keeps tracking paused (decision from P6, unchanged).

Next piece (from PLAN.md): P7 finish — upload to AMO after the manual Firefox check. Then P8 —
Intervention engine.

2026-11-16: Final manual Firefox check passed (popup, Today section, icon, new ID, idle test: +0.9 min over 2 min untouched). Submitted v0.1.0 to addons.mozilla.org as a listed add-on (Firefox desktop only, experimental, MIT, categories Tabs + Alerts & Updates) with the sources zip. Validator: 0 errors, 2 warnings (React innerHTML). Added the icon, 4 screenshots, and version notes to the listing. Status: Awaiting Review.

## Handoff — 2026-11-16 (P8 intervention engine)

Done:

- AMO listing (`docs/store/amo-listing.md`): "This add-on is experimental" changed to Yes (ticked
  for the v0.1 testing stage; untick after friends have tested). Separate commit.
- Block randomization per user (`extension/src/interventions/randomize.ts`, browser-free): a
  shuffled block of control / friction / intention in storage (`interventions:block`); each new
  session takes the next one; a used-up block is reshuffled. Shuffle uses `crypto.getRandomValues`
  with rejection sampling (no Math.random); random source is injectable (seeded one for tests).
- Condition is assigned when a session starts and saved on the active session in the same write
  as the shortened block, so a refused start uses up nothing. Sessions ended early keep it. Older
  v0.1 sessions without the field read as `null`.
- Feature flag `interventions:enabled`, default OFF (`INTERVENTIONS_DEFAULT_ENABLED = false` in
  `src/storage/interventions-store.ts`). Off → condition `null`, no block consumed. E2E tests turn
  it on by writing the storage key.
- Opt-out: "Research interventions" card (plain explanation of each condition) on My Data and on a
  new Settings tab of the options page (pause tracking + research). Opted out → condition
  `"opted-out"` (added to the shared `SessionCondition` type) and no block consumed.
- One-time popup notice ("Keep on" / "Turn off"), behind the same flag. Shown only if the flag is
  on, not seen and not already opted out. It counts as seen as soon as it is shown.
- The condition is never shown when starting/running a session; My Data shows it per session in
  words.
- New keys in the single key list: `interventions:enabled`, `interventions:opted-out`,
  `interventions:block`, `interventions:notice-seen`. "Delete everything" removes them all, except
  it keeps `interventions:opted-out` while it is `true` (like the pause setting).
- PRIVACY.md: new "Research interventions (version 0.2.0 and later)" section; My Data wording
  updated. No new permissions (still storage, tabs, idle, alarms); incognito stays `not_allowed`.
- v0.1.0 zips untouched (SHA-256 checked before and after the builds); tag untouched.

Changed files: `packages/shared/src/types{,.test}.ts`, `extension/src/interventions/` (new:
`randomize{,.test}.ts`, `assignment.test.ts`), `extension/src/storage/interventions-store.ts`
(new), `extension/src/storage/{keys,keys.test,sessions-store}.ts`,
`extension/src/sessions/{session,session-controller}.ts` + tests, `extension/src/my-data/tables{,.test}.ts`,
`extension/src/popup/popup-data.test.ts`, `extension/src/ui/{use-interventions.ts,ResearchCard.tsx}`
(new), `extension/entrypoints/popup/{App,InterventionsNotice}.tsx`,
`extension/entrypoints/options/{App,MyData}.tsx`, `extension/entrypoints/background.ts`,
`extension/e2e/{fixtures,interventions.e2e}.ts`, PRIVACY.md, docs/PLAN.md, docs/LOG.md,
`docs/store/amo-listing.md`.

Tests: unit pass — 165 tests in 20 files. E2E pass — 14 tests in local Edge (4 new). Lint,
format check, typecheck, Firefox + Edge builds, `check:builds` clean.

Problems / open questions:

- C: has only about 0.4 GB free (was 1.54 GB after P7). Builds and E2E runs may start failing
  soon. `npm cache clean --force` and emptying `extension/test-results` would help.
- The notice counts as seen when it is shown, even if the popup is closed without pressing a
  button (interventions then stay on, the default). Change if you'd rather it wait for a click.
- When P10 is done: set `INTERVENTIONS_DEFAULT_ENABLED = true` and bump the version to 0.2.0.
  The extension version is still 0.1.0 in `extension/package.json`.

Next piece (from PLAN.md): P9 — Friction intervention.

## Handoff — 2026-11-16 (P9)

Done:

- Housekeeping (separate commit): CLAUDE.md notes the repo is now at `M:\Projects\studylens`, that
  build/test output and caches stay off C:, and that every Handoff reports C: and M: free space. No
  tracked file still pointed at the old C: path.
- P8 follow-up: the research notice now keeps showing until "Keep on" or "Turn off" is pressed.
  Closing the popup no longer counts as seen. `answerNotice()` saves the choice and the "seen" flag
  in one write. Unit and E2E tests updated.
- P9 friction intervention:
  - Trigger: entering a Distraction site (navigating to it, or switching into a tab already on it)
    during a running `friction` session, while tracking isn't paused. "Entering" means the tracker's
    previous active site was a different site, the same rule `distractionVisits` uses.
  - Mechanism: `tabs.update` to the extension's own `friction.html`. It shows the domain, the
    session goal, a 10 s countdown, then "Continue to <site>". "Back to studying" works right away:
    it goes back in history (passing through the Distraction site goes back once more, with no
    second countdown), or shows a neutral "Back to studying" page when there's nowhere to go back to.
  - Constants: `FRICTION_COUNTDOWN_SECONDS = 10`, `FRICTION_GRACE_MINUTES = 5`
    (`src/interventions/friction.ts`).
  - Counts on every session: `frictionShown`, `frictionContinued`, `frictionTurnedBack` (0 for older
    sessions). They appear in My Data (new "Friction countdowns" column) and in the export.
  - New storage key `friction:state` (grace periods, last redirect, "back" marker: site names, tab
    ids and times only). It's in the single key list, and "Delete everything" removes it.
  - Privacy: the full target URL lives only in the countdown page's own address. A unit test runs
    every friction path with secret-looking URLs and checks that no path, query or scheme ends up in
    storage. The E2E test checks the same in a real browser.
  - Edge cases: never on extension, about: or edge:// pages, private windows, or friction.html
    itself. Duplicate events for one navigation are ignored (3 s). If the session ends during the
    countdown, Continue still works and is counted on the finished session. The background keeps no
    state in memory. The E2E Continue test stops the service worker during the countdown (and
    proves it stopped).
  - No new permissions; incognito stays `not_allowed` (checked in both built manifests).
  - PRIVACY.md: how the countdown works, what's counted, and that full addresses are never stored.

Changed files: `CLAUDE.md`, `PRIVACY.md`, `docs/PLAN.md`, `docs/LOG.md`,
`extension/entrypoints/background.ts`, `extension/entrypoints/friction/{index.html,main.tsx,App.tsx}`
(new), `extension/entrypoints/popup/InterventionsNotice.tsx`,
`extension/entrypoints/options/MyData.tsx`,
`extension/src/interventions/{friction,friction-controller}{,.test}.ts` (new),
`extension/src/interventions/assignment.test.ts`, `extension/src/storage/friction-store.ts` (new),
`extension/src/storage/{keys,keys.test,interventions-store,sessions-store,sessions-store.test}.ts`,
`extension/src/sessions/{session,messages}.ts` + tests,
`extension/src/background/browser-adapter.ts`, `extension/src/ui/use-interventions.ts`,
`extension/src/my-data/tables{,.test}.ts`, `extension/e2e/{fixtures,interventions.e2e,friction.e2e}.ts`.

Tests: unit pass, 203 tests in 22 files. E2E pass, 19 tests in local Edge (5 new friction tests;
the friction file passed 3 times in a row, and the Continue test 6 times in a row). Lint, format
check, typecheck, Firefox and Edge builds, and `check:builds` are clean.

Problems / open questions:

- Friction is E2E-tested only in Edge/Chromium. Try it by hand in Firefox (steps below).
- Coming back to the browser from another app while a Distraction tab is active doesn't trigger
  friction. Only navigating and switching tabs do, as specified. `distractionVisits` still counts
  that case as a visit.
- To try friction by hand (the flag is still OFF until P10), open the background console:
  Firefox `about:debugging#/runtime/this-firefox` → StudyLens → Inspect → Console. Edge:
  `edge://extensions` → Developer mode → StudyLens → "service worker". Then run
  `browser.storage.local.set({ 'interventions:enabled': true, 'interventions:block': ['friction'] })`
  (in Edge use `chrome.` instead of `browser.`). The next session will be a friction session.
  Turn it back off with `browser.storage.local.set({ 'interventions:enabled': false })`.

Disk space: C: 3.85 GB free, M: 13.57 GB free.

Next piece (from PLAN.md): P10 — Intention intervention.

## Handoff — 2026-11-18 (P10 intention intervention + v0.2.0 prep)

Done:

- P9 follow-up: README has a new "Known limitations" section. Friction and intention trigger when
  you navigate to a Distraction site or switch tabs to one. They do not trigger when you come back
  to the browser from another app, even though that return still counts as a distraction visit.
- Refactor: friction and intention now share one page and one controller, with a `mode`
  (`friction` | `intention`): `src/interventions/interstitial{,-controller}.ts`,
  `src/storage/interstitial-store.ts`, `entrypoints/interstitial/` (`interstitial.html`). Files were
  renamed with `git mv`. Trigger rules, duplicate-event window, 5-minute grace period, "Back"
  handling and the stopped-background handling are the same code for both modes. One message
  type: `interstitial:choice` with `{ choice, mode, sessionId, hostname }`.
- Storage key `friction:state` renamed to `interstitial:state` (it's in the single key list). v0.1
  never wrote the old key because the flag was off. An old dev profile would show it as "unknown",
  and "Delete everything" still removes it.
- P10 intention page: shows the hostname and the session goal, then "What did you come here for?"
  "Continue to <site>" enables at ≥ 3 non-space characters (`intentionReady`). "Back to studying"
  works right away. No countdown. Pressing Enter continues once the answer is long enough.
- Privacy: the typed answer exists only in the page's React state. `choiceMessage()` takes no text
  at all. The box has `autocomplete="off"`, is not inside a form, and is emptied before the page
  navigates away (and on pagehide). Counts on every session: `intentionShown`,
  `intentionContinued`, `intentionTurnedBack`. My Data has a new "Intention prompts" column, and
  the export includes the counts.
- Fix found by E2E: after Continue or Back, the next visit to the same site in the same tab within
  3 s was wrongly ignored as a duplicate event. Answering the page now clears that marker.
- v0.2.0: `INTERVENTIONS_DEFAULT_ENABLED = true`, and the version is bumped to 0.2.0 (package.json +
  lock). New and existing users see the notice. It now explains all three conditions in plain
  words. **No session can start until the notice is answered**: the popup's Start button stays
  disabled and shows a note, and `startSession` in the background refuses with
  `notice-unanswered`. The Research card's "Not active yet" note now reads "Switched off" (shown
  only if the flag is stored as false).
- E2E fixtures: new `build` option (`e2e` or `normal`) and `seed` option. By default each test
  starts with `interventions:enabled = false` so older tests don't get random interstitials.
  `npm run test:e2e` now also runs `build:edge`, because `notice-default-install.e2e.ts` loads the
  normal Edge build with empty storage.
- `scripts/screenshots.mjs` switches interventions off in its throwaway profile. Otherwise the
  notice would leave Start disabled.
- PRIVACY.md (0.2.0) says StudyLens never stores what you type, and explains the intention page
  and that the feature is on by default behind the notice. README, CLAUDE.md (test:e2e) and
  `docs/store/amo-listing.md` are updated for 0.2.0 (not uploaded).
- Release prep (not tagged, not uploaded):
  - `extension/.output/studylens-0.2.0-firefox.zip` (SHA-256 `43cc28ae…6e50`)
  - `extension/.output/studylens-0.2.0-sources.zip` (SHA-256 `9c14f798…3f2f`)
  - The sources zip, unzipped into a clean `M:\temp\studylens-verify-0.2.0` with `npm ci` and
    `build:firefox`, gave identical SHA-256 for all 15 files. That folder was then deleted.
  - addons-linter was installed temporarily in `M:\temp\addons-linter-tmp` (44 MB), then deleted:
    0 errors, 0 notices, 2 warnings (the same React DOM `innerHTML` warnings as v0.1).
  - Both manifests: version 0.2.0, permissions `storage, tabs, idle, alarms`, no host or optional
    permissions, `incognito: not_allowed`. The v0.1.0 tag is unchanged.

Changed files: `CLAUDE.md`, `PRIVACY.md`, `README.md`, `docs/{PLAN,LOG}.md`,
`docs/store/amo-listing.md`, `package-lock.json`, `extension/package.json`,
`extension/scripts/screenshots.mjs`, `extension/entrypoints/background.ts`,
`extension/entrypoints/interstitial/{App.tsx,index.html,main.tsx}` (renamed from `friction/`),
`extension/entrypoints/popup/{FocusSession,InterventionsNotice}.tsx`,
`extension/entrypoints/options/MyData.tsx`,
`extension/src/interventions/interstitial{,-controller}{,.test}.ts` (renamed from `friction*`),
`extension/src/interventions/assignment.test.ts`, `extension/src/storage/interstitial-store.ts`
(renamed), `extension/src/storage/{keys,interventions-store,sessions-store}.ts` + tests,
`extension/src/sessions/{session,session-controller,messages}.ts` + tests,
`extension/src/background/browser-adapter.ts`, `extension/src/my-data/tables.ts` + tests,
`extension/src/my-data/export.test.ts`, `extension/src/popup/popup-data.test.ts`,
`extension/src/ui/ResearchCard.tsx`, `extension/e2e/{fixtures,interstitial.e2e}.ts`,
`extension/e2e/notice-default-install.e2e.ts` (new).

Tests: unit pass, 235 tests in 22 files. E2E pass, 26 tests in local Edge. The interstitial file
also passed 30/30 with `--repeat-each=3`. Lint, format check, typecheck, Firefox and Edge builds,
and `check:builds` are clean.

Problems / open questions:

- Friction and intention are E2E-tested only in Edge/Chromium. Use the Firefox checklist (below)
  before uploading 0.2.0.
- Firefox may keep a closed page's form data for back/forward. The box is emptied before leaving,
  but please confirm by hand (checklist step I5).
- Store screenshots still show the v0.1 look (no notice). Fine for now; retake later if wanted.
- C: free space dropped from 3.83 to 3.42 GB between sessions. Nothing from this project writes to
  C:, so it's probably Windows or other apps.

Firefox manual checklist (background console: `about:debugging#/runtime/this-firefox` → StudyLens →
Inspect → Console). Setup: label `youtube.com` Distraction and `wikipedia.org` Study, then open
wikipedia.org.

- N1. Fresh profile, open the popup: the notice lists the three conditions, Start is disabled with
  a note. Close and reopen the popup: the notice is still there. Press Keep on: Start works.
- F1. Run `browser.storage.local.set({ 'interventions:block': ['friction'] })`, then start a
  session. Go to youtube.com: "A moment before youtube.com", your goal, a 10 s countdown, then
  Continue. After Continue, YouTube loads. Leave and come back within 5 min: no countdown.
- F2. New friction session (set the block again): YouTube → Back to studying → back on Wikipedia,
  no second countdown. Switch to a tab already on YouTube: countdown shows.
- I1. Set the block to `['intention']`, then start a session. Go to youtube.com: "Before you open
  youtube.com", your goal, the question box, and no countdown.
- I2. Continue is disabled for "ab" and "a b", enabled for "abc". Continue → YouTube. Within 5 min:
  no prompt again.
- I3. New intention session: type something, press Back to studying → back on Wikipedia. Do it
  again with the box empty: Back works right away.
- I4. Wikipedia during an intention session: no prompt. Control session (`['control']`): nothing.
- I5. Type a unique word, press Continue, then the browser Back button and Forward button: the box
  must not show the word. Then run
  `browser.storage.local.get(null).then(d => JSON.stringify(d).includes('YOURWORD'))`: expect
  `false`.
- M1. End the session, open My Data: Condition plus "Friction countdowns" / "Intention prompts"
  counts. The export JSON has the `intention*` counts.

Disk space: C: 3.42 GB free, M: 14.26 GB free.

Next piece (from PLAN.md): P11 — Local dashboard.

---

2026-11-18 Firefox manual test of v0.2.0 build: research notice blocks Start until answered;
friction countdown, Continue, and 5-min grace period work; intention page works, Continue locked
until 3 characters, Back/Forward never re-shows a filled-in box; typed text not in storage
(checked from the background console: false); My Data shows condition and intervention counts
correctly. FINDING: distractionVisits over-counted (5 and 3 for sessions with one real YouTube
visit each), because switching to another window (DevTools) and back, and the interstitial
Back/Forward, each counted as a new visit.

2026-11-18 Fix: distraction-visit definition 2 (before P11, separate commit). A visit counts only
when the active site changes into a Distraction site from a different site (or a Distraction site
is the first site after the session starts). Returning to the same site after another window,
idle, the friction/intention page, or Back/Forward no longer counts. Same-site records under 60 s
apart are merged for the calculation only (stored records unchanged). **Sessions that ended before
this commit keep their stored `distractionVisits` from definition 1 (every return after a gap
counted), so those numbers may be too high.** They are not recalculated. Only hs's own test
sessions exist with v0.2.0 (it was never uploaded). See README "How measures are defined".

## Handoff — 2026-11-18

Done:

- Logged hs's 2026-11-18 Firefox manual test of v0.2.0, including the over-counting finding
  (own commit `e56ecac`).
- **Distraction visits, definition 2** (own commit `f3adc2c`, before P11). A visit counts only
  when the active site changes into a Distraction site from a different site. Returning to the
  same site after another window, idle, the friction/intention page, or Back/Forward does not
  count. Same-site records less than 60 s apart are merged for the calculation only. The new
  `siteRuns` / `countDistractionVisits` live in `src/sessions/session-stats.ts`. The manual-test
  sequences are unit tests (5 → 1 and 3 → 1). There is also a tracker test showing the
  interstitial URL is never a site. README has a new "How measures are defined" section, and the
  "Known limitations" note is fixed. Stored sessions are not recalculated (see the note above).
- v0.2.0 zips rebuilt from `f3adc2c` (still **not uploaded**):
  - `extension/.output/studylens-0.2.0-firefox.zip` (SHA-256 `eee854f0…cdd8`)
  - `extension/.output/studylens-0.2.0-sources.zip` (SHA-256 `9d8d2331…cd3f`)
  - Unzipped the sources into a clean `M:\temp\studylens-verify-0.2.0`, then ran `npm ci` and
    `build:firefox`: all 15 files had the same SHA-256 as the zip. Folder deleted afterwards.
  - These zips do **not** include P11 (built before it). The later P11 builds did not change them
    (hashes re-checked).
- **P11 Local dashboard**: new **Insights** tab on the options page (`options.html#insights`).
  - Focus trends for the last 14 days: focus-session minutes per day, plus study vs distraction
    minutes per day (all tracked time on labeled sites).
  - Best time of day: average focus rating by start-time band (morning 5–12, afternoon 12–17,
    evening 17–22, night 22–5), answered check-ins only.
  - Per-condition table for control / friction / intention: sessions, average visits, average
    distraction minutes, average rating (with number answered), and goal yes/partly/no %. Opted-out
    and no-condition sessions are excluded (their counts are shown below the table). With fewer
    than 3 sessions a condition shows "Not enough data yet: n of 3 sessions needed." There is an
    "Early results, small sample" banner and no significance tests.
  - Sessions and activity records are split at local midnight (DST-safe). This fixes the P2
    midnight note for these charts. All activity day buckets are read, so a record that started
    the day before the window still counts for its part inside it.
  - Charts are HTML tables with CSS bars, and each bar has its number written next to it. Study is
    blue and distraction is red with stripes: the usual green/red failed the colorblind check
    (ΔE 5.5); blue/red passes (ΔE 26.8). No chart library, and no new permissions.
  - Pure logic in `src/insights/insights.ts` (15 unit tests, also passing with TZ set to
    Auckland, Kolkata, and UTC). `e2e/insights.e2e.ts` covers all three conditions with seeded
    data, the sparse "not enough data" case, and the empty state.

Changed files: `docs/LOG.md`, `docs/PLAN.md`, `README.md`,
`extension/src/sessions/session-stats{,.test}.ts`, `extension/src/sessions/session-controller.test.ts`,
`extension/src/tracker/tracker.test.ts`, `extension/src/insights/insights{,.test}.ts` (new),
`extension/entrypoints/options/{App,Insights,MyData}.tsx` (Insights new; MyData exports
`useAllData`), `extension/e2e/insights.e2e.ts` (new).

Tests: unit pass, 257 tests in 23 files. E2E pass, 29/29 in local Edge. Lint, format check,
typecheck, Firefox and Edge builds, and `check:builds` are clean.

Problems / open questions:

- Old sessions (before `f3adc2c`) keep their definition-1 visit counts, and the Insights table
  averages them together with new ones. Only hs's own test sessions exist, so this is fine. If it
  matters later, delete those test sessions (My Data → Delete everything) before collecting real
  data.
- The v0.2.0 zips are from `f3adc2c` and have no Insights tab. Options: upload them as v0.2.0
  (then tag `f3adc2c` as `v0.2.0` so the sources match), or bump to 0.2.1/0.3.0 with Insights and
  rebuild. PRIVACY.md is unchanged: Insights only reads local data and stores or sends nothing.
- The Best-time-of-day chart includes opted-out sessions (it isn't about conditions).
- Firefox check for Insights by hand: open the options page → Insights. Then check visit counts:
  run one session with a single YouTube visit, switch to DevTools and back a few times, and use
  Back/Forward through the interstitial. My Data should show 1 visit.

Disk space: C: 3.77 GB free, M: 14.25 GB free.

Next piece (from PLAN.md): P12 — Retention job.

## Handoff — 2026-11-18 (P12 + P13 prep)

Done:

- **P12 Retention job** (`src/retention/retention.ts`, pure, runs over the KeyValueStore
  interface).
  - **What:** once per local day, activity day buckets more than 30 days before today are rolled
    into weekly totals and the raw records deleted. Example: on Nov 18, Oct 19 is kept and Oct 18
    is rolled. Totals are kept per week (Monday start), per site (domain group, same as
    `siteKey`), and per category at roll time. Records crossing midnight are split, so each part
    counts toward its own day's week.
  - **When:** the heartbeat alarm checks `retention:last-run` every minute, so the job runs once
    per local day. It also runs on every background wake-up if it is overdue. It always runs
    inside the background's task queue, so nothing else writes at the same time.
  - **Safe to repeat or interrupt:** step 1 is a single atomic `storage.set` (new totals, emptied
    old buckets, compacted sessions, run time). Step 2 removes the emptied buckets. A second run
    changes nothing. A run cut off before step 2 is finished by the next one, with no loss and
    no double counting. Both cases are unit-tested.
  - **Sessions** are kept (Insights needs them). After 30 days they are compacted: the goal text
    and friction/intention counts are deleted and `compacted: true` is set. Start/end, planned
    length, minutes per category, visits, condition and check-in stay.
  - **New keys** `totals:weekly` and `retention:last-run` (in `keys.ts`; the key-list test covers
    them).
  - **My Data:** new "Weekly totals (older than 30 days)" section. Compacted sessions show
    "Removed after 30 days". The retention note now says cleanup is on. The export includes
    the totals, and its `about` text explains them.
  - **Insights** is unchanged by cleanup (unit-tested: identical output before/after). Its trends
    cover 14 days, and the other charts use sessions.
  - **Docs:** PRIVACY.md updated (cleanup is on; what is kept; weekly totals listed; Insights
    stores nothing; effective date Nov 18, covers Firefox and Edge). README updated too.
  - **Tests:** 17 retention unit tests with a fake clock, covering:
    - exactly 30 vs 31 days, and the next day
    - week boundary Sun → Mon
    - a record crossing midnight into another week, and into a kept day
    - merging into existing totals
    - running twice, interrupted before the remove, interrupted before the write
    - once per local day
    - Insights unchanged
  - They pass with TZ set to Auckland, New York (DST change in range), Kolkata, and UTC. Also new
    My Data table tests, and `retention.e2e.ts`: it seeds 40-day-old activity and a session, stops
    the background, wakes it, and checks the weekly totals, deletion, compaction, and My Data.
- **Small Insights fix:** the "Not included" note lists only non-zero groups, and its wording now
  fits sessions from before research interventions were on (`excludedText`, unit-tested).
- **P13 prep (Edge):**
  - The Edge manifest is MV3 with `background.service_worker`, has no `browser_specific_settings`,
    icons 16–128 present, permissions `storage, tabs, idle, alarms`, `incognito: not_allowed`.
  - `check:builds` now verifies both manifests: permissions, no host/optional permissions, no
    content scripts, all icon/popup/options files present. Edge: service worker and no gecko
    keys. Firefox: background scripts and the unchanged add-on ID.
  - New `docs/store/edge-listing.md` (fields, files, description, notes for certification),
    `docs/store/edge/store-logo-300x300.png` and `small-promo-tile-440x280.png`.
  - The AMO listing was updated to match (screenshots, Insights, cleanup, reviewer notes).
- **Screenshots** (1280×800, `npm run screenshots -w extension`):
  `1-focus-session`, `2-friction-countdown`, `3-intention-question`, `4-insights` (sample
  sessions), `5-my-data`, `6-check-in`, `7-site-categories`. Each one is checked for test-only text.
- **Zips** (from commit `1648bd3`, version 0.2.0, **not uploaded**; v0.1.0 tag untouched at
  `48fba49`):
  - `extension/.output/studylens-0.2.0-edge.zip` (SHA-256 `8e764caa…3ba3`)
  - `extension/.output/studylens-0.2.0-firefox.zip` (SHA-256 `fbc537a5…bd7d`)
  - `extension/.output/studylens-0.2.0-sources.zip` (SHA-256 `51ac40ea…4e4d`)
  - Sources zip unzipped into a clean `M:\temp\studylens-verify-0.2.0`, then `npm ci` +
    `build:firefox`: all 15 files had identical SHA-256. Folder deleted afterwards.
  - addons-linter installed temporarily in `M:\temp\addons-linter-tmp` (30 MB), then deleted:
    0 errors, 0 notices, 2 warnings (React DOM `innerHTML`, same as before).

Changed files: `PRIVACY.md`, `README.md`, `docs/{PLAN,LOG}.md`, `docs/store/amo-listing.md`,
`docs/store/edge-listing.md` (new), `docs/store/edge/*.png` (new), `docs/store/screenshots/*.png`
(renamed/refreshed), `extension/entrypoints/background.ts`,
`extension/entrypoints/options/{Insights,MyData}.tsx`,
`extension/scripts/{check-builds,screenshots}.mjs`, `extension/src/retention/retention{,.test}.ts`
(new), `extension/src/tracker/local-day.ts` (new, moved from Insights),
`extension/src/insights/insights{,.test}.ts`, `extension/src/my-data/{export,tables,tables.test}.ts`,
`extension/src/sessions/session.ts`, `extension/src/storage/{keys,keys.test,sessions-store}.ts`,
`extension/e2e/retention.e2e.ts` (new).

Tests: unit pass, 277 tests in 24 files. E2E pass, 30/30 in local Edge. Lint, format check,
typecheck, Firefox, Edge, E2E and web builds, and `check:builds` are clean.

Problems / open questions:

- Compaction drops the friction/intention counts (Continue / Back to studying) after 30 days, as
  asked. If P20 wants "how often people continued" as a measure, upload (P17) must happen within
  30 days, or keep the counts. They are small numbers, not personal.
- Weekly totals keep the label a site had when it was rolled up. Later label changes don't
  rewrite old weeks (documented).
- The Insights screenshot uses made-up sample sessions (documented in the listings and the
  script). It shows the UI, not research results.
- Edge listing: Partner Center field limits weren't checked live. Check the short description
  and search terms when submitting.
- Before uploading: test Edge by hand (P13 "verify on Edge"), and run the Firefox checklist for
  Insights and cleanup. Cleanup can be forced from the background console with
  `browser.storage.local.set({ 'retention:last-run': 0 })` and then reopening the popup.

Disk space: C: 3.77 GB free, M: 14.19 GB free.

Next piece (from PLAN.md): P13 — Edge build + submit (manual verify on Edge, then submit).

## Handoff — 2026-11-19 (P12 decision: keep session numbers)

Done:

- **Decision applied:** after 30 days, retention drops only the session's **goal text**. All
  numeric fields stay: condition, check-in answers, planned/actual times, minutes per category,
  distraction visits, and the friction/intention counts (shown / continued / turned back). They
  are needed for the P20 results and contain nothing personal.
- `compactSession` now returns the session with `goal: ''` and `compacted: true` and nothing
  else changed. My Data shows "Removed after 30 days" only in the Goal column; the friction and
  intention columns show the real counts. The "How long data is kept" text, PRIVACY.md, README
  and code comments were updated.
- Tests: the retention unit test checks the exact compacted session (counts kept). The tables test
  checks that compacted rows show the counts. `retention.e2e.ts` now checks that the 40-day-old
  session keeps condition, visits, minutes, check-in and friction counts, and that the goal text is
  gone from storage.
- **Zips rebuilt** from commit `23622c0` (version 0.2.0, **not uploaded**, v0.1.0 tag untouched
  at `48fba49`):
  - `M:\Projects\studylens\extension\.output\studylens-0.2.0-edge.zip` (SHA-256 `4936ffcb…cd20`)
  - `M:\Projects\studylens\extension\.output\studylens-0.2.0-firefox.zip` (SHA-256 `1a754424…4f47`)
  - `M:\Projects\studylens\extension\.output\studylens-0.2.0-sources.zip` (SHA-256 `1ade15e4…1364`)
  - The sources zip was unzipped into a clean `M:\temp\studylens-verify-0.2.0`, then `npm ci` +
    `build:firefox`: all 15 files had identical SHA-256. The folder was deleted afterwards.
- Store screenshots unchanged (the changed text isn't in any of them).

Changed files: `PRIVACY.md`, `README.md`, `docs/LOG.md`, `extension/e2e/retention.e2e.ts`,
`extension/entrypoints/options/MyData.tsx`, `extension/src/my-data/{tables,tables.test}.ts`,
`extension/src/retention/{retention,retention.test}.ts`, `extension/src/sessions/session.ts`,
`extension/src/storage/sessions-store.ts`.

Tests: unit pass, 277 tests in 24 files. E2E pass, 30/30 in local Edge. Lint, format check,
typecheck, Firefox/Edge/web builds and `check:builds` are clean.

Problems / open questions:

- Sessions that the earlier P12 code already compacted on hs's own test install lost their counts.
  Those can't be recovered. v0.2.0 was never published, so no other users are affected.
- Still to do before uploading: test Edge by hand (P13), and run the Firefox checklist.

Disk space: C: 3.48 GB free, M: 14.20 GB free.

Next piece (from PLAN.md): P13 — Edge build + submit (manual verify on Edge, then submit).

## Handoff — 2026-11-19 (v0.1.0 live on AMO; Edge smoke test; 0.2.0 release notes)

Done:

- **v0.1.0 approved and live on AMO:**
  https://addons.mozilla.org/en-US/firefox/addon/studylens/. P7 is checked off in PLAN.md. In
  README.md, an "Install for Firefox" link replaces the "coming soon" placeholder.
- **New `npm run smoke:edge`** (`extension/scripts/smoke-edge.mjs`, separate from the E2E suite).
  It builds the normal Edge build, then loads the real production files (`.output/edge-mv3`) in
  the installed Edge (`msedge`, headless) with a fresh profile in M:\temp (deleted afterwards).
  It uses stub pages only and downloads no browsers. Result: **11 passed, 0 failed, 0 skipped**
  (Edge 139.0.3405.125):
  - manifest version 0.2.0, MV3, service worker, no gecko keys
  - permissions exactly storage/tabs/idle/alarms, no host/optional permissions, no content
    scripts, incognito not allowed
  - no test-only code (15 files scanned)
  - the build has the same 15 files (SHA-256) as `studylens-0.2.0-edge.zip`
  - the research notice shows and Start stays disabled until "Keep on"
  - a 25-min session starts and the badge shows "25"
  - visiting a stub wikipedia.org shows it in Today ("wikipedia.org Neutral 0.1"), and the
    storage has no path
  - End early shows the check-in, with badge "?"
  - the options tabs Site categories, Insights, Settings and My Data render with no error alerts
  - no console errors or uncaught errors from the extension pages or the service worker
- The production build stops counting when the PC has been idle for 60 s. If that happens, the
  Today check reports SKIPPED instead of failing. It didn't happen in this run.
- **`docs/store/release-notes-0.2.0.md`:** short notes for the AMO 0.1.0 → 0.2.0 update and the
  first Edge release (helpers, Insights, automatic cleanup, the distraction-visit fix).
- The smoke command was added to CLAUDE.md, README.md and the P13 line in PLAN.md.

Changed files: `CLAUDE.md`, `README.md`, `docs/PLAN.md`, `docs/LOG.md`,
`docs/store/release-notes-0.2.0.md` (new), `extension/scripts/smoke-edge.mjs` (new),
`extension/package.json`, `package.json`.

Tests: unit pass, 277 tests in 24 files. Smoke on Edge 11/11. Lint, format check, typecheck and
`check:builds` are clean. The extension code didn't change, so the three 0.2.0 zips from
`23622c0` are still current.

Problems / open questions:

- The smoke test isn't in CI. It needs the installed Edge, and CI uses Playwright's Chromium.
  Run it locally before submitting.
- Edge Partner Center may not have a release-notes field for a first submission. If it doesn't,
  use the Edge text in the description or the certification notes.

Disk space: C: 3.34 GB free, M: 14.21 GB free.

Next piece (from PLAN.md): P13 — Edge build + submit (submit `studylens-0.2.0-edge.zip`), and
upload 0.2.0 to AMO.

## Handoff — 2026-11-20 (v0.2.0 live on AMO; Edge account pending; UX review + mockups)

Done:

- **v0.2.0 approved and live on AMO** (auto-approved 2026-11-20).
- **Edge:** registered in Partner Center as an individual developer. Account verification is
  pending (the verification email hasn't arrived yet). P13 stays open until Microsoft verifies the
  account; then submit `studylens-0.2.0-edge.zip`. Status noted on the P13 line in PLAN.md.
- **New piece P13b. UI polish + onboarding (v0.3.0)** added to PLAN.md before P14 (welcome page,
  colorful redesign, clearer popup, accessibility, feedback link). Not built yet.
- **UX review (no extension code changed):**
  - New `extension/scripts/ux-review-shots.mjs` captures every screen at real size into
    `docs/ux-review/screens/` (E2E build in installed Edge, headless, throwaway profile in
    M:\temp, stub pages only): popup fresh install / notice / idle / running / check-in / paused /
    keyboard focus, friction (countdown + done), intention (empty + typed), back-to-studying, and
    every options tab (Site categories empty + labeled, Insights empty + sample, Settings, My Data).
  - `docs/ux-review/REVIEW.md`: problems per screen for a first-time user, each with severity and a
    fix; 3 visual directions with palettes, type scales, radius/spacing; a prioritized "must fix
    before friends" vs "nice to have" list. Recommendation: Sunrise.
  - Mockups (static HTML, no scripts or external files): `docs/ux-review/mockup-sunrise.html`,
    `docs/ux-review/mockup-ocean.html`, `docs/ux-review/mockup-pastel.html` (popup idle, running,
    check-in, friction page). Every text color was checked for 4.5:1 contrast.
  - Biggest findings: no first-run flow (a long research notice is the first thing a user sees),
    Start/Save/Continue are disabled with no visible reason, the My Data sessions table breaks
    headers mid-word, Study is green everywhere except blue in Insights, and many 11–12 px texts.

Changed files: `CLAUDE.md`, `docs/PLAN.md`, `docs/LOG.md`, `docs/ux-review/` (new: REVIEW.md, 3
mockups, 22 screenshots), `extension/scripts/ux-review-shots.mjs` (new).

Tests: unit pass, 277 tests in 24 files. Lint and format check clean. No extension code changed, so
E2E, builds and the 0.2.0 zips are unaffected.

Problems / open questions:

- Pick a visual direction (Sunrise recommended) before starting P13b.
- Where should the feedback link go: a GitHub issue form (needs a GitHub account) or a mailto link?
- Edge account verification is still pending.

Disk space: C: 3.36 GB free, M: 14.19 GB free.

Next piece (from PLAN.md): P13 — submit to Edge once the account is verified; meanwhile P13b — UI
polish + onboarding (v0.3.0).

## Handoff — 2026-11-21 (P13b: themes, welcome page, UI polish — v0.3.0 built, not uploaded)

Status notes from hs (2026-11-20): **v0.2.0 is approved and live on AMO** (auto-approved). Edge:
registered in Partner Center as an individual developer, account verification pending (email not
received yet), so P13 stays open.

Done (one commit per part):

1. **Theme system** (`21af5e5`): Sunrise (default), Ocean, Pastel as design tokens in
   `extension/src/ui/themes.ts` → `--sl-*` CSS variables on any element with `data-theme`. Shared
   styles in `src/ui/styles.css`. Every page (popup, options, helper pages, welcome) applies the
   stored theme before rendering and follows changes live. `ui:theme` is in the key list; Delete
   everything resets it to Sunrise. Settings tab: "Look" card with live preview cards. System fonts
   only, no new permissions, reduced motion respected.
2. **Contrast + consistency** (`5e90173`): unit tests check every text/background and control pair
   (`theme-pairs.ts`) in every theme for WCAG AA (4.5:1 text, 3:1 controls/focus/bars). A guard test
   fails if any UI file has a hard-coded color. Insights now uses the theme's Study color (was blue);
   category chips (icon + label + color) everywhere; Distraction bars striped.
3. **Must-fix items** (`3421713`): new popup (logo header, "Tracking on · Pause" pill, one primary
   Start button, ring timer, short last-session line, Today bar + chips + whole minutes, footer);
   disabled buttons always explain why next to them; shorter research notice for existing users;
   helper pages with countdown ring; Site categories intro + Quick start first when empty; empty
   states that say what to do; readable My Data sessions table; visible focus; popup text 13 px+.
4. **Welcome / onboarding** (`3bfb071`): `runtime.onInstalled` opens `welcome.html` on install
   (3 steps with progress: look, sites, helpers; ends with a toolbar picture). The research
   question must still be answered before the first session. Upgrades from <0.3.0 get only a
   "New: themes!" popup hint. Keys `onboarding:welcome`, `onboarding:themes-hint`.
5. **Delight** (`a47b4a6`): "Session complete!" card with one-time confetti (none with reduced
   motion, none for ended-early sessions), encouraging empty states.
6. **Feedback link** (`cc4f48c`): `FEEDBACK_URL` in `extension/src/ui/feedback.ts`, empty = hidden.
   When set: "Send feedback" in the popup footer and a Settings card, new tab, nothing sent.
7. **Version 0.3.0** (`b0730d4`): PRIVACY.md (theme/onboarding settings, feedback link, no web
   fonts), README, `docs/store/release-notes-0.3.0.md`.
8. **Tests** (`0e61d82`): E2E for the welcome flow, Skip/close-early path, theme switching (live,
   reset by Delete everything), no blank screen in any theme (9 screens × 3 themes), and the
   upgrade from 0.2.0 (a copy of the build reloads itself with a new manifest version, which fires
   `onInstalled` "update"). smoke:edge found the field name `testSeconds` in the production popup;
   fixed so E2E-only code compiles away again.
9. **Screenshots** (`de46063`): `docs/ux-review/after/{sunrise,ocean,pastel}/` (23 each), store
   screenshots + Edge images refreshed in Sunrise.
10. **Zips** (from `de46063`, **not uploaded**):
    - `M:\Projects\studylens\extension\.output\studylens-0.3.0-edge.zip` (SHA-256 `529762cb…af776c86`)
    - `M:\Projects\studylens\extension\.output\studylens-0.3.0-firefox.zip` (SHA-256 `3b98f651…31610c22`)
    - `M:\Projects\studylens\extension\.output\studylens-0.3.0-sources.zip` (SHA-256 `8da329d9…1fa2bb00`)
    - Sources zip unzipped into a clean `M:\temp\studylens-verify-0.3.0`, `npm ci` + `build:firefox`:
      all 21 files identical SHA-256. Folder deleted.
    - addons-linter 10.16.0 installed temporarily in `M:\temp\addons-linter-tmp` (30 MB), then
      deleted: 0 errors, 0 notices, 2 warnings (React DOM `innerHTML`, same as before).
    - Manifests: version 0.3.0, permissions `storage, tabs, idle, alarms` only, no host permissions.

Changed files (main ones): `extension/src/ui/*` (themes, styles, page, icons, chips, picker,
contrast, feedback), `extension/src/onboarding/*`, `extension/src/storage/{keys,theme-store,
onboarding-store}.ts`, `extension/src/popup/popup-view.ts`, `extension/entrypoints/**` (popup,
options, interstitial, new welcome), `extension/e2e/*` (fixtures, welcome, themes, upgrade,
sessions, notice), `extension/scripts/{smoke-edge,screenshots,ux-review-shots}.mjs`,
`extension/package.json`, `package-lock.json`, `PRIVACY.md`, `README.md`, `CLAUDE.md`,
`docs/PLAN.md`, `docs/LOG.md`, `docs/store/*`, `docs/ux-review/after/**`.

Tests: unit 649 passed (30 files). E2E 37/37 in local Edge (36 + 1 skipped in CI's Chromium). smoke:edge 12/12 (incl. same files
as the 0.3.0 Edge zip). Lint, format check, typecheck, Firefox/Edge/web builds, check:builds clean.

Problems / open questions:

- `FEEDBACK_URL` is empty: paste the Microsoft Form link into `extension/src/ui/feedback.ts`, then
  rebuild the zips (the link only appears after that).
- Friends who close the welcome page early see "New here? Finish setting up StudyLens" in the popup
  until they finish it (by design).
- Edge account verification still pending; then submit `studylens-0.3.0-edge.zip` (P13).
- Firefox build shows Vite's ">500 kB chunk" notice (React in one shared chunk). Harmless.
- CI: the upgrade E2E test failed in CI's Playwright Chromium (an unpacked extension doesn't come
  back after `runtime.reload()` there; restarting the browser doesn't fire an "update" either). It
  now runs only in Edge (locally, passing) and is skipped in CI; the install/update rules are
  unit-tested in CI. CI E2E failures now also show as GitHub annotations (`github` reporter).

Disk space: C: 1.64 GB free, M: 14.02 GB free. (C: went from 3.16 to 1.64 GB during the session: the
growth is in hs's own Edge profile, Spotify, Firefox and OneDrive caches, not StudyLens output,
which stays on M:. Nothing was deleted.)

Next piece (from PLAN.md): P13 — Edge submit once verified (0.3.0 zip); upload 0.3.0 to AMO when
ready; then P14 — Recruit friends.

## Handoff — 2026-11-21 (Feedback link live, v0.3.0 zips rebuilt)

Done:

- `FEEDBACK_URL` in `extension/src/ui/feedback.ts` now points at the anonymous Microsoft Form.
  "Send feedback" shows in the popup footer and on the Settings tab (Feedback card) and opens the
  form in a new tab (`target="_blank"`, `rel="noopener noreferrer"`).
- PRIVACY.md: the feedback section now says it opens an anonymous Microsoft Form in a new tab;
  StudyLens itself sends nothing; the form is a separate Microsoft service with its own privacy
  terms and doesn't ask for names or emails.
- README: "Feedback and support" section with the form link. Release notes 0.3.0 + CLAUDE.md
  mention it too.
- Tests: unit test checks the constant is the form link. E2E checks the link is visible with the
  right href/target/rel in the popup and on Settings in all 3 themes, absent on the other 7
  screens, and that clicking it opens a new tab at the form URL (the form request is answered by
  a local stub, so tests never contact Microsoft).
- Commit `a64489e`, pushed. CI: **both jobs passed** (`check` and `e2e`).
- Zips rebuilt from `a64489e` content (**not uploaded**):
  - `M:\Projects\studylens\extension\.output\studylens-0.3.0-edge.zip` (SHA-256 `00be4e1c…200f7854`)
  - `M:\Projects\studylens\extension\.output\studylens-0.3.0-firefox.zip` (SHA-256 `dadf6229…0b6220b4`)
  - `M:\Projects\studylens\extension\.output\studylens-0.3.0-sources.zip` (SHA-256 `c90ea12d…454386c1`)
  - Sources zip unzipped into a clean `M:\temp\studylens-verify-0.3.0`, `npm ci` + `build:firefox`:
    all 21 files identical SHA-256 (form URL present). Folder deleted.
  - addons-linter 10.16.0 temporarily in `M:\temp\addons-linter-tmp`, then deleted: 0 errors,
    0 notices, 2 warnings (React DOM `innerHTML`, same as before).
  - Manifests: version 0.3.0, permissions `storage, tabs, idle, alarms` only, no host permissions.

Changed files: `extension/src/ui/feedback.ts`, `extension/src/ui/feedback.test.ts`,
`extension/e2e/themes.e2e.ts`, `PRIVACY.md`, `README.md`, `docs/store/release-notes-0.3.0.md`,
`CLAUDE.md`, `docs/LOG.md`.

Tests: unit 650 passed (30 files). E2E 38/38 in local Edge. smoke:edge 12/12 (same files as the
new Edge zip; it failed once against the old zip before the rebuild, as expected). Lint, format
check, typecheck, Firefox/Edge/web builds, check:builds clean. CI green.

Problems / open questions:

- Edge account verification still pending; then submit the new `studylens-0.3.0-edge.zip` (P13).
- The old 0.3.0 zips from earlier today were overwritten. Upload only the new ones.

Disk space: C: 2.47 GB free, M: 14.02 GB free.

Next piece (from PLAN.md): P13 — Edge submit once verified (0.3.0 zip); upload 0.3.0 to AMO; then
P14 — Recruit friends.

## Handoff — 2026-11-21 (Plan update: IRB-first; P13c research instrumentation — v0.4.0 built, not uploaded)

Done:

- **Plan update** (`55d4825`, separate commit): no research data from other people until IRB
  approval (with Dr. Su); before Dec 7 friends give usability feedback only, and the study is
  presented as design + preregistration draft + hs's own N=1 pilot. P17 (research upload) removed.
  New/rewritten pieces: P13c, P14 (usability only), P15 backend + Turso, P16 group join (random
  device ID + display name + group code, optional host permission asked only on first join/create),
  P18 passive study groups, P18b live group sessions _(stretch)_, P19 reliability _(partly
  stretch)_, P19b preregistration draft + analysis script. Research section: design fixes, analysis
  plan (mixed-effects, participant random effect, session order, ≥5 solo sessions per condition per
  person, labels frozen, hypotheses not shared, OSF preregistration, group sessions excluded).
  CLAUDE.md research summary updated.
- **P13c** (`965c7c6`, `ae0ffc2`):
  1. **Distraction attempts** logged at the same trigger point in every condition. Control logs
     `visited` (no page; the site gets the same 5-min grace period as after Continue).
     Friction/intention log the attempt when the page opens; Continue/Back set `continued` /
     `turned_back` + dwell seconds (0.1 s), also if the session ended while the page was open. Per
     session: `distractionAttempts` count + compact `attempts` list (site group, time, condition,
     outcome, dwell; max 200 entries, count keeps going). `distractionVisits` kept. Retention
     removes attempt site names after 30 days.
  2. **Equal time cost:** intention Continue needs 3+ characters AND 10 s (`HELPER_MIN_SECONDS`,
     shared with friction). A hint shows what's missing and the seconds left.
  3. **Session order:** `sessionNumber` (key `sessions:counter`). After the update, numbering
     continues after the sessions already in history.
  4. **Mode:** `mode: 'solo'` on every session (old sessions read as solo).
  5. **Study mode:** Settings → "Lock my site labels (study mode)" (key `study:label-lock` with
     on/off times). While on, `saveRules` refuses, and Site categories shows a message + disables
     every control. Label-set version (key `categories:version`, +1 on each real change) and
     `labelsLocked` are stored on each session.
  6. **Research CSV:** My Data → "Export for research (CSV)", 22 columns (requested ones +
     `checkin_status`, `labels_locked`), random local participant ID (`research:participant-id`,
     `p-` + 12 hex, made on first run). No goal text, hostnames, URLs or exact times. Every column
     is in `docs/research/codebook.md` (a unit test checks the codebook matches the code).
  7. New keys in `keys.ts`; PRIVACY.md, README, My Data and Research card wording,
     `docs/store/release-notes-0.4.0.md`. No new permissions; `data_collection_permissions`
     still `none`.
  8. Tests: see below. The study-mode checkbox now updates right away (E2E found it lagging
     behind the save).
  9. **Version 0.4.0. Zips (not uploaded), built from `ae0ffc2`:**
     - `M:\Projects\studylens\extension\.output\studylens-0.4.0-edge.zip` (SHA-256 `21c6be53…1b01d902`)
     - `M:\Projects\studylens\extension\.output\studylens-0.4.0-firefox.zip` (SHA-256 `6a7067ab…baaad8`)
     - `M:\Projects\studylens\extension\.output\studylens-0.4.0-sources.zip` (SHA-256 `f06820b2…4bd1452`)
     - Sources zip unzipped into a clean `M:\temp\studylens-verify-0.4.0`, `npm ci` +
       `build:firefox`: all 21 files identical SHA-256. Folder deleted.
     - addons-linter 10.16.0 temporarily in `M:\temp\addons-linter-tmp` (30 MB), then deleted:
       0 errors, 0 notices, 2 warnings (React DOM `innerHTML`, same as before).
     - Manifests: version 0.4.0, permissions `storage, tabs, idle, alarms` only, no host
       permissions, Firefox ID unchanged.

Changed files (main): `packages/shared/src/types.ts`, `extension/src/interventions/{attempts,
interstitial,interstitial-controller}.ts`, `extension/src/storage/{research-store,categories-store,
sessions-store,keys}.ts`, `extension/src/sessions/{session,session-controller}.ts`,
`extension/src/my-data/{research-csv,tables}.ts`, `extension/src/retention/retention.ts`,
`extension/src/ui/{StudyModeCard.tsx,use-label-lock.ts,ResearchCard.tsx}`,
`extension/entrypoints/{background.ts,interstitial/App.tsx,options/App.tsx,options/MyData.tsx,
options/SiteCategories.tsx}`, `extension/e2e/{research,interstitial,insights}.e2e.ts`, unit tests,
`extension/package.json`, `extension/scripts/smoke-edge.mjs`, `package-lock.json`, `PRIVACY.md`,
`README.md`, `CLAUDE.md`, `docs/PLAN.md`, `docs/LOG.md`, `docs/research/codebook.md`,
`docs/store/release-notes-0.4.0.md`.

Tests: unit 694 passed (`npm test`, all workspaces). New unit tests cover attempt logging in all 3
conditions, dwell time, the 10 s + 3 characters rule, session numbering, mode, label lock + version,
participant ID, retention of attempts, and the CSV columns + no-PII checks. E2E 41/41 in local Edge
(new: intention 10 s rule, study mode lock, research CSV export). smoke:edge 11 passed, 0 failed,
1 skipped ("visiting a stub site records it in Today" skips when the PC has had no keyboard/mouse
input for 60 s, which was the case during the automated run). Lint, format check, typecheck,
Firefox/Edge/web builds, check:builds clean. CI: **both jobs passed** (`check`, `e2e`) on `ae0ffc2`.

Problems / open questions:

- Each session did **not** keep a label snapshot before this (the prompt assumed it did). P13c
  stores the label-set version + locked flag per session instead. Should we also store the label
  list per version (domains only, local) so the pilot can show which labels were used?
- "Delete everything" also resets the participant ID and session numbering (the device then counts
  as a new participant). Fine for the N=1 pilot; to revisit before any IRB study.
- smoke:edge's activity check needs a real person at the PC. Re-run `npm run smoke:edge` while
  using the computer to get 12/12.
- Edge account verification is still pending (P13). Upload 0.4.0 to AMO/Edge when ready.

Disk space: C: 3.66 GB free, M: 14.09 GB free.

Next piece (from PLAN.md): P14 — Recruit friends (usability only); also P13 Edge submit once
verified; P19b preregistration draft can start using the codebook.

## 2026-11-21 — Store status

2026-11-21: v0.4.0 approved and live on AMO. Edge developer account verified (Authorized).
Submitted studylens-0.4.0-edge.zip to Microsoft Edge Add-ons (Public, all markets, category
Productivity; privacy tab: single purpose + justifications for storage, tabs, idle, alarms; no
remote code; data usage disclosed as Web history (stored locally only); all three certifications).
Status: In certification.

## 2026-11-22 — Edge approved

2026-11-22: v0.4.0 approved by Microsoft and live on Microsoft Edge Add-ons:
https://microsoftedge.microsoft.com/addons/detail/studylens/phepgpemnllainhhjemgknaeedjjekad
(store ID `phepgpemnllainhhjemgknaeedjjekad`, recorded in CLAUDE.md and
docs/store/edge-listing.md). P13 checked off in PLAN.md. README now has "Install for Edge" next to
"Install for Firefox".

Handoff — 2026-11-22

Done: P13 checked off; Edge listing link added to README; Edge store ID recorded in CLAUDE.md and
docs/store/edge-listing.md.

Changed files: README.md, CLAUDE.md, docs/PLAN.md, docs/LOG.md, docs/store/edge-listing.md

Tests: docs-only change; Prettier check on the changed files passed. Test suite not re-run.

Problems / open questions: none.

Disk space: C: 3.55 GB free, M: 14.08 GB free.

Next piece (from PLAN.md): P14 — Recruit friends (usability only); P19b preregistration draft.

## 2026-11-22 — P15 backend foundation (code)

Handoff — 2026-11-22

Done:

- Data layer `web/lib/db/`: `Db` interface with a libSQL implementation (Turso in production, a
  local file for dev/tests) and the in-memory stub. Schema as numbered migrations for devices,
  groups, memberships, group_sessions, session_participants, device_presence, daily_totals,
  error_logs, rate_limits. No browsing data, hostnames/URLs, IPs or emails (a test checks the
  column names). The old research-upload methods (`addSessionSummary`) were removed (P17 is gone).
- libSQL's Windows native driver can't load on this PC (the Visual C++ runtime is missing). Local
  `file:` databases fall back to Node's built-in `node:sqlite` automatically (same SQL). CI forces
  the real libSQL driver (`REQUIRE_LIBSQL=1`), and it passed there.
- API: `GET /api/health`, `POST /api/devices` (token returned once, only its SHA-256 hash stored),
  `POST /api/errors` (bearer token, 20/hour/device, scrubbed, no device ID stored),
  `GET /api/cleanup` (`CRON_SECRET`). zod strict schemas, consistent JSON errors,
  `withErrorLogging`, rate limits in the DB (registration: global 100/hour, no IPs), CORS for
  the Edge store ID + Firefox `moz-extension://` origins (localhost/unpacked builds outside
  production only). Shared API types in `packages/shared/src/api.ts`.
- `web/vercel.json` (daily cron 09:00 UTC), `web/.env.example`, CI now also runs the web build.
- Docs: `docs/backend.md`, a draft PRIVACY.md "Study groups (coming in a later version — not
  active yet)" section, CLAUDE.md commands. PLAN: P15 (code) checked; P15d deployment added.
- The extension is unchanged and still never calls the server.

Changed files: `web/lib/db/{index,types,memory,executor,schema,migrate,retention,sql-db,contract,
test-utils}.ts` + tests, `web/lib/api/{auth,cors,errors,handler,rate-limit,scrub,validation,
test-helpers}.ts` + tests, `web/lib/version.ts`, `web/app/api/{health,devices,errors,cleanup}/
route.ts` + tests, `web/package.json` (0.1.0, `@libsql/client`, `zod`), `web/vercel.json`,
`web/.env.example`, `packages/shared/src/{api,index}.ts`, `.github/workflows/ci.yml`, `.gitignore`,
`.prettierignore`, `eslint.config.js`, `package-lock.json`, `docs/backend.md`, `PRIVACY.md`,
`CLAUDE.md`, `docs/PLAN.md`, `docs/LOG.md`.

Tests: 768 unit/API tests pass (`npm test`; 74 new). Lint, format check, typecheck, the web build,
both extension builds and check:builds are clean. A manual smoke test of `next start` on a local DB
file got the expected status from every endpoint (200/201/202/401/403). CI: **both jobs passed**
(`check`, `e2e`) on `e614542`.

Problems / open questions:

- Install the Microsoft Visual C++ Redistributable (x64, about 25 MB on C:) to use the real libSQL
  driver locally? Optional; everything works without it.
- Registration rate limit is global (no IPs stored), so a flood could block new sign-ups for up to
  an hour. Fine for a class-sized pilot.
- daily_totals has no retention rule yet. Decide in P18 (e.g. keep 35 days).
- Vercel's own platform request logs include IPs (outside the app's control); mentioned in the
  PRIVACY draft.
- Error-message scrubbing also turns code like `browser.tabs` into `[domain]` (privacy over
  debugging).

Disk space: C: 3.50 GB free, M: 13.99 GB free.

Next piece (from PLAN.md): P15d — Backend deployment (Turso + Vercel, by hs), then P16 — Group join.

## 2026-11-23 — P15 re-check + deployment steps

Handoff — 2026-11-23

Done:

- The P15 prompt was pasted again; P15 (code) was already finished on 2026-11-22 (commits
  `c470c87`..`2340e64`, CI green on both jobs). Nothing was rebuilt.
- Re-verified: 768 tests pass, typecheck and format check clean.
- Added "Deploying (P15d)" to `docs/backend.md`: step-by-step Turso database + token, Vercel
  import with root directory `web/`, the three env vars, and a PowerShell CRON_SECRET generator.

Changed files: `docs/backend.md`, `docs/LOG.md`.

Tests: 768 pass (41 files).

Problems / open questions: same as 2026-11-22 (optional VC++ runtime, global registration rate
limit, daily_totals retention to decide in P18).

Disk space: C: 3.15 GB free, M: 14.07 GB free.

Next piece (from PLAN.md): P15d — Backend deployment (hs), then P16 — Group join.

## Handoff — 2026-11-23 (Vercel build fix)

Done:

- Cause of the first Vercel failure ("Please install typescript"): with Root Directory = `web`,
  the install runs inside `web/`, so npm installs only `web/`'s own dependencies. `typescript`
  lived only in the root `package.json`. Reproduced exactly in a fresh clone on M:.
- Added `typescript` (~6.0.3) and `vitest` (^5.1.0) to `web/` devDependencies (same versions as
  root; `next build` type-checks the test files, so it needs vitest's types too). `@types/*` were
  already declared. `@studylens/shared` already resolves (workspace dep + `transpilePackages`).
- Verified in a fresh clone on M: (`M:\temp\vercel-repro`, deleted afterwards): `npm ci` inside
  `web/` then `npm run build` succeeds; also succeeds with `npm ci` at the repo root.
- Note in `docs/backend.md` (Deploying, step 3) explaining why `web/` must declare its build deps.
- Vercel settings: no changes needed — keep Install/Build Command on defaults.

Changed files: `web/package.json`, `package-lock.json`, `docs/backend.md`, `docs/LOG.md`.

Tests: 768 unit tests pass (41 files); E2E 41/41 on the second run (first run had one flaky
failure, extension untouched); lint, format, typecheck, web build, both extension builds and
check:builds clean.

Problems / open questions: one flaky E2E test on the first local run (passed on rerun).

Disk space: C: 3.46 GB free, M: 14.02 GB free.

Next piece (from PLAN.md): P15d — Backend deployment (hs: redeploy on Vercel), then P16 — Group join.

## Handoff — 2026-11-23 (P15d deployed)

Done:

- P15d done by hs: backend deployed to Vercel at **https://studylens-flame.vercel.app** (Root
  Directory `web`, function region `pdx1` Portland set in the Vercel dashboard, Turso database in
  `aws-us-west-2`). `/api/health` returns `{"ok":true,"db":"up","version":"0.1.0"}` (re-checked
  from this PC).
- Recorded the URL and regions in `CLAUDE.md`, `docs/backend.md` (status + Turso location step),
  and `README.md`; checked off P15d in `docs/PLAN.md`.

Changed files: `CLAUDE.md`, `README.md`, `docs/backend.md`, `docs/PLAN.md`, `docs/LOG.md`.

Tests: docs only; format check clean.

Problems / open questions:

- Confirm the daily cleanup cron shows under Vercel → Project → Settings → Cron Jobs (part of the
  P15d check in PLAN.md).
- The function region lives only in the Vercel dashboard. It could also go in `web/vercel.json`
  (`"regions": ["pdx1"]`) so it's tracked in git.

Disk space: C: 3.43 GB free, M: 14.01 GB free.

Next piece (from PLAN.md): P16 — Group join (no accounts).

## P16 in progress — 2026-11-23 (paused by hs after stage 1)

Done (committed and pushed):

- Housekeeping: `web/vercel.json` now has `"regions": ["pdx1"]` (function region saved in git);
  `docs/backend.md` updated (`267e89b`).
- Stage 1 (`ca66824`): shared group contract in `packages/shared/src/groups.ts` (join codes: 8
  characters from `23456789ABCDEFGHJKMNPQRSTWXYZ`, case-insensitive, dash/spaces ignored; limits
  20 members/group, 5 groups/device; request/response types) + new error codes (`not_found`,
  `group_full`, `too_many_groups`). `Db` interface + libSQL and in-memory implementations:
  `createGroup`, `joinGroup`, `listGroups`, `leaveGroup`, `updateDisplayName`, `deleteDevice`.
  Limits are checked inside single INSERT statements (no race past 20 members). Leaving/deleting
  hands ownership to the longest-standing member and deletes empty groups. Device deletion uses
  explicit deletes (works even if the remote DB doesn't enforce foreign keys; tested with
  `foreign_keys = OFF`). 17 new tests (contract on node:sqlite + memory, SQL, shared).

Flaky E2E investigation (housekeeping, not finished): CI annotations for the last 13 e2e runs
show no flaky or retried tests (CI uses Chromium). Locally (Edge) a 3× repeat of the whole suite
(`--repeat-each=3`): 123/123 passed (14.0 min), no failure reproduced. Which test flaked on 2026-11-23 was not recorded,
so no timing fix has been made yet.

Firefox research (for stage 4/docs): required stays `["none"]`; plan is optional
`["personallyIdentifyingInfo"]` (display name), requested in the same `permissions.request` as
the server origin. `technicalAndInteraction` is optional-only and MDN says optional-only
permissions can't be combined with other optional permissions in one request, so it is avoided.
Sources: MDN browser_specific_settings, MDN permissions.request, Extension Workshop "Firefox
built-in consent for data collection and transmission".

Left (not started):

- Stage 2: server routes — `POST /api/groups`, `POST /api/groups/join`, `GET /api/groups`,
  `DELETE /api/groups/:id/membership`, `PATCH`/`DELETE /api/devices/me`; in-memory per-client-
  address rate limits (joins, creates, registrations — fixes the "global registration limit"
  question; IPs never persisted); route tests; backend.md.
- Stage 3: extension plumbing — build-time API base constant (prod vs local E2E server),
  `optional_host_permissions`, Firefox optional data collection, API client with timeouts,
  storage keys (device token, pending server delete), check:builds updates, version 0.5.0-dev.
- Stage 4: "Study groups" options tab (consent screen → permission → create/join, members, copy
  invite, leave, rename, delete server data), popup footer link, "Delete everything" also
  deletes server data (with offline handling).
- Stage 5: E2E with a local web API (two profiles), smoke:edge, docs (PRIVACY.md groups section
  active, AMO/Edge listing notes, Edge privacy answers), all checks, CI, health check, PLAN.md.

Changed files: `web/vercel.json`, `docs/backend.md`, `packages/shared/src/{api,index,groups,
groups.test}.ts`, `web/lib/db/{types,index,sql-db,sql-db.test,memory,contract}.ts`,
`docs/LOG.md`.

Tests: web + shared unit tests 101 pass (12 files); lint, typecheck, format check clean.

Disk space: C: 3.42 GB free, M: 13.82 GB free.

Next piece: P16 stage 2 (server routes).

## Handoff — 2026-11-23 (P16 done)

Done:

- CI was green on `3e77d53` before starting.
- Stage 2 (`e600a8c`): server routes `POST /api/groups`, `POST /api/groups/join`,
  `GET /api/groups`, `DELETE /api/groups/:id/membership`, `PATCH` + `DELETE /api/devices/me`.
  zod validation (strict), consistent JSON errors, `withErrorLogging` via `apiRoute`, CORS. Rate
  limits per device (database) and per client address (memory only, HMAC with a per-instance key,
  pruned within ~70 min; IPs never persisted). Registration: 30/hour per address + global backstop
  1000/hour (fixes the "global registration limit" open question). Join attempts: 20/hour per
  device + 60/hour per address, counted before the code is looked at.
- Stage 3 (`73c1ceb`, `501b228`): extension "Study groups" tab (consent screen → "Join or create a
  group" → browser permission → create/join; members; copy invite; leave; change name; delete
  server data + give the permission back). `optional_host_permissions` for the production server
  (E2E build: local server at install, since Playwright can't click the prompt). Firefox:
  `data_collection_permissions` optional `personallyIdentifyingInfo`, `none` still required,
  requested in the same prompt. API base is a build-time constant (`extension/server-urls.ts`).
  Every request checks the permission first; timeouts; clear offline/error states. "Delete
  everything" deletes the server copy first; if unreachable, local data is deleted anyway, the
  user is told, and only the token is kept for an automatic retry (background, every ~30 min).
  Token masked on My Data and in the JSON export. Popup footer link. Version 0.5.0-dev.
- Stage 4 (`f1cba6e`, `26e1627`): extension unit tests (API client, service, permission request,
  invite, export masking); E2E against the real web API started by Playwright (`next dev` on
  127.0.0.1:3101, `web/.next-e2e/`, fresh DB in `web/.data/e2e/`): normal build has no host
  permission and solo use sends nothing; solo use in the E2E build sends nothing; two-profile flow
  (create → join by code → both see each other → leave → delete server data → Delete everything
  deletes the server copy, token rejected); server down (errors + Retry, solo features work,
  Delete everything still deletes locally). The E2E found a real bug (the list loaded before the
  first group existed), fixed. `openExecutor` now creates the folder of a local DB file.
  `web/AGENTS.md` (written by `next dev` when it detects an AI agent) is gitignored.
- Docs: PRIVACY.md groups section active (by version: 0.5.0+); `docs/store/amo-listing.md` and
  `edge-listing.md` have a "0.5.0" section (reviewer notes, permissions, test steps); new
  `docs/store/edge-privacy-answers.md`; `docs/backend.md` (endpoints, group rules, rate limits,
  E2E server); CLAUDE.md, README.md; PLAN.md P16 checked off. `smoke:edge` updated for 0.5.0 and
  study groups.
- Production: Vercel redeployed from main; `GET /api/health` → `{"ok":true,"db":"up"}`;
  `GET /api/groups` without a token → 401 JSON (new routes are live). No test data was created
  in production.

Changed files: `web/app/api/{groups/route,groups/join/route,groups/[id]/membership/route,devices/me/route,devices/route}.ts`
(+ tests), `web/lib/api/{client-limit,group-errors,join-code,rate-limit,validation,test-helpers}.ts`,
`web/lib/db/{executor,sql-db.test}.ts`, `web/next.config.ts`, `web/tsconfig.json`,
`extension/server-urls.ts`, `extension/src/groups/*`, `extension/entrypoints/options/{App,StudyGroups,MyData}.tsx`,
`extension/entrypoints/popup/PopupFooter.tsx`, `extension/entrypoints/background.ts`,
`extension/src/storage/keys{,.test}.ts`, `extension/src/my-data/export{,.test}.ts`,
`extension/src/ui/styles.css`, `extension/src/interventions/assignment.test.ts`,
`extension/{wxt.config,vitest.config,playwright.config}.ts`, `extension/build-flags.d.ts`,
`extension/e2e/{fixtures,groups.e2e,web-server,global-setup}.ts`,
`extension/scripts/{check-builds,smoke-edge}.mjs`, `extension/package.json`, `package-lock.json`,
`.gitignore`, `.prettierignore`, `eslint.config.js`, PRIVACY.md, README.md, CLAUDE.md,
`docs/{PLAN,LOG,backend}.md`, `docs/store/{amo-listing,edge-listing,edge-privacy-answers}.md`.

Tests: unit 839/839 (50 files). Lint, format, typecheck, web build, Firefox + Edge + E2E builds,
`check:builds` clean. `smoke:edge`: 11 passed, 0 failed, 1 skipped (zip not built; not
releasing). E2E: `groups.e2e.ts` 12/12 locally (4 tests × 3 repeats). The full local E2E run was
stopped by Claude Code at test 38/44 because the PC ran low on memory (37 passed before that, no
real failure); CI ran the whole suite: check ✓, e2e ✓ on `26e1627`.

Problems / open questions:

- **Real Firefox not tested** (not installed here; CLAUDE.md says not to install browsers).
  Unverified: that Firefox accepts `origins` + `data_collection` in one `permissions.request()`
  and shows one prompt. hs's manual steps are in the session handoff. addons-linter was not run
  (the permission system blocked downloading it via npx); optional for hs.
- One unit test ("300 real session starts") hit the 5 s default timeout under full parallel load
  (2.9 s alone): CPU-bound, given an explicit 30 s timeout, not a retry.
- If someone's create/join fails right after registering, a different display name typed for the
  retry is ignored (the first registration's name is kept; "Change name" fixes it). Minor.
- The flaky E2E from 2026-11-22 is still unidentified (not seen again).

Disk space: C: 3.44 GB free, M: 13.94 GB free.

Next piece (from PLAN.md): P18 — Study groups (passive): daily focus totals + who's in a session.
