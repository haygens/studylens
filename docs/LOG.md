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
