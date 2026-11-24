# StudyLens — Plan

Goal: a privacy-respecting focus extension (Firefox + Edge) that helps students study and tests which
focus interventions actually work. Final show and tell: **Mon Dec 7, 2026**. Solo, ~10+ hrs/week.

Priority if time runs short: **Core tracker → Research instrumentation + preregistration → Backend & study
groups.** Pieces marked _(stretch)_ may not be done by Dec 7; that's allowed for a moonshot.
Each piece should fit in one or two Claude Code sessions. Check boxes as pieces finish.

---

## Week 1 (Nov 15–21): Foundation + core tracker — ship v0.1 to Firefox

- [x] **P1. Repo scaffold** — npm workspaces (`extension/`, `web/`, `packages/shared/`), WXT + React +
      TypeScript extension, Next.js app, Vitest, ESLint/Prettier, `.gitignore`, GitHub Actions CI
      (install, lint, test). Push to a public GitHub repo.
- [x] **P2. Activity tracking (background)** — track active tab's _hostname_ + time, using `tabs` and
      `idle`. Ignore private windows. Store raw records locally. Unit tests for the time-accounting logic.
- [x] **P3. Site categories** — options page where the user labels domains study / neutral / distraction.
      Sensible empty default (nothing pre-labeled except a few suggestions the user can accept).
- [x] **P4. Focus sessions** — popup: set a goal + duration (Pomodoro-style), start/stop, timer.
      Session record = start, end, goal, per-category time, distraction visit count.
- [x] **P5. End-of-session check-in** — "Did you finish your goal?" (yes/partly/no) + "How focused
      were you?" (1–5). Badge "?" when the popup was closed; auto-skip after 12 h or a new session.
- [x] **P5b. E2E tests** — Playwright loads the E2E build of the extension (Edge locally, Chromium
      in CI) with stub sites; covers labels, session → badge "?" → check-in, Skip, End early, and
      popup loading/error states. Test-only seconds + ignored OS idle exist only in the E2E build
      (`check:builds` proves it). Separate CI job.
- [x] **P6. My Data page** — raw records table, export JSON, delete everything, pause tracking.
- [x] **P7. Privacy policy + store listing** — finalize PRIVACY.md, icons, screenshots. Submit v0.1 to
      Firefox Add-ons (AMO) early so review never blocks the deadline.

## Week 2 (Nov 22–28): Research layer + dashboard + Edge + instrumentation

- [x] **P8. Intervention engine** — each session randomly assigned `control` / `friction` / `intention`.
      Log the condition on the session record. Tests for randomization balance.
- [x] **P9. Friction intervention** — when a distraction site is opened during a session, show a short
      countdown page before continuing. (No permission needed after all: `tabs.update` to the
      extension's own page.)
- [x] **P10. Intention intervention** — "What did you come here for?" prompt before a distraction site;
      the typed answer is never stored. Shares one interstitial page/controller with friction.
      Interventions on by default from v0.2.0 (behind the one-time notice).
- [x] **P11. Local dashboard** — focus trends, best time of day, per-condition comparison (distraction
      visits, focus rating, goal completion).
- [x] **P12. Retention job** — `alarms` daily: roll raw records >30 days into weekly totals, delete raw.
- [x] **P13. Edge build + submit** — verify on Edge, submit to Edge Add-ons (free, GitHub sign-in).
      Verify = `npm run smoke:edge` (production build in installed Edge, headless) — passing.
      Status 2026-11-20: v0.2.0 is approved and live on AMO. Edge Partner Center: registered as an
      individual developer; account verification pending (verification email not received yet).
      Submit `studylens-0.2.0-edge.zip` once Microsoft verifies the account.
      Done 2026-11-22: v0.4.0 approved and live on Microsoft Edge Add-ons
      (https://microsoftedge.microsoft.com/addons/detail/studylens/phepgpemnllainhhjemgknaeedjjekad).
- [x] **P13b. UI polish + onboarding (v0.3.0)** — all three directions shipped as user-selectable
      themes (Sunrise default, Ocean, Pastel; WCAG AA checked in unit tests, icons + labels for
      categories), welcome page on install (look, sites, helpers), "New: themes!" hint for upgrades,
      clearer popup (one primary action, tracking pill, ring timer, reasons next to disabled
      buttons, session-complete moment, 13 px+ text), readable My Data table, friendly empty states,
      visible focus, feedback link behind `FEEDBACK_URL` (hidden until the Microsoft Form exists).
      Screenshots: `docs/ux-review/after/<theme>/`. 0.3.0 zips built, not uploaded.
- [x] **P13c. Research instrumentation (v0.4.0)** — log distraction _attempts_ in every condition
      (incl. control) at the same trigger point, with outcome (control `visited`; friction/intention
      `continued` / `turned_back`) and dwell seconds on the helper page; equal time cost (intention
      Continue needs 3+ characters **and** 10 s, same constant as friction); per-device session
      sequence number; session `mode` field (`solo` for now); study mode ("Lock my site labels")
      with lock on/off times + label-set version on each session; "Export for research (CSV)" on My
      Data with a random local participant ID, documented in `docs/research/codebook.md`. No new
      permissions. Done 2026-11-21: 0.4.0 zips built, not uploaded.
- [ ] **P14. Recruit friends (usability only)** — share install links, collect **usability feedback**
      through the anonymous form. **No research data from other people is collected until IRB
      approval** (with Dr. Su). Friends' sessions stay on their own devices.

## Week 3 (Nov 29–Dec 6): Backend, study groups, results

Not everything has to ship by Dec 7 (a moonshot may fall short). Pieces marked _(stretch)_ stay in
the plan as the full vision; the show and tell presents whatever is done plus the design.

- [x] **P15. Backend + Turso (code)** — `web/lib/db/` `Db` interface with libSQL (Turso / local
      file) and in-memory implementations; schema + migrations for devices, groups, memberships,
      group sessions, participants, presence, daily totals, error logs, rate limits (no browsing
      data, URLs, IPs or emails). API: `GET /api/health`, `POST /api/devices` (token once, hash
      stored), `POST /api/errors` (bearer token, scrubbed), `GET /api/cleanup` (Vercel Cron,
      `CRON_SECRET`); zod validation, JSON errors, per-device rate limits, `withErrorLogging`,
      CORS for the extension origins. Tests on temp libSQL files, in CI. Done 2026-11-22; see
      `docs/backend.md`. The extension still never calls the server (P16).
- [x] **P15d. Backend deployment** — hs creates the Turso database + token, imports the repo into
      Vercel (root `web/`), sets `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CRON_SECRET`; then check
      `https://<project>.vercel.app/api/health` shows `"db":"up"` and the cron appears in Vercel.
      Done 2026-11-23: https://studylens-flame.vercel.app (function region `pdx1`, Turso
      `aws-us-west-2`).
- [ ] **P16. Group join (no accounts)** — no email accounts. A random device ID generated locally + a
      chosen display name + a group code. The extension asks for permission to contact the StudyLens
      server **only when the user first joins or creates a group** (optional host permission requested
      at runtime, never at install). When this ships: update the AMO `data_collection_permissions`,
      PRIVACY.md, and the store listings.
- [ ] **P18. Study groups (passive)** — members see each other's **daily focus totals** and who is in a
      session right now. Never site names. Polling (WebSockets optional; Vercel's are in beta).
- [ ] **P18b. Live group focus sessions** _(stretch)_ — someone starts a group session (goal + length)
      and shares a code; others join; everyone gets the same shared timer; live presence list
      (focusing / finished / left); a group "Session complete!" summary showing each member's focus
      minutes only if they choose to share. Handle joining late, leaving early, reconnecting, and the
      host leaving. Group sessions get `mode: "group"`.
- [ ] **P19. Reliability** _(partly stretch)_ — `withErrorLogging` wrapper → `error_logs` table,
      Vercel Cron cleanup (14 days, `CRON_SECRET`), optional Discord webhook alerts _(stretch)_, tests
      in CI. _(Wrapper, `error_logs`, cleanup cron and their CI tests were built in P15; left:
      Discord alerts.)_
- [ ] **P19b. Preregistration draft + analysis script** — OSF-style preregistration draft
      (hypotheses, design, measures, exclusions, analysis plan below) and an analysis script that
      reads the research CSV (P13c) and fits the planned models. Run it on hs's own N=1 pilot data.
- [ ] **P20. Results + show and tell** — present the study **design + preregistration draft + hs's
      own N=1 pilot** (2–3 charts from the pilot), the usability feedback from friends, demo script,
      portfolio card (title, link, reflection).

Removed: ~~P17. Research consent + upload~~ — no research upload before IRB approval. A future
upload would need IRB approval, a consent screen, and a preview first.

## Stretch / future work

- Chrome Web Store ($5), Safari ($99/yr + Mac)
- Optional AI coach reading weekly _summaries_ only
- Per-site daily limits, weekly email report
- **Solo vs group sessions** as a research question (group sessions are excluded from the main
  analysis for now)
- Research data from other participants — only after IRB approval, with consent screen + preview

## Research question details

- **Question:** Do friction delays or intention prompts reduce distraction and improve self-rated focus
  compared with no intervention?
- **Design:** within-subject; condition (`control` / `friction` / `intention`) randomized per solo
  session (balanced shuffled blocks).
- **Primary measures:** distraction **attempts** per session (logged at the same trigger point in every
  condition, including control), share of attempts where the user turned back (interventions),
  distraction minutes/session, focus rating (1–5), goal completed (yes / partly / no). Secondary:
  distraction visits (old measure, kept), helper-page dwell time.
- **Design fixes (P13c):**
  - _Same trigger point in all conditions_ — control sessions log an attempt (outcome `visited`)
    exactly where an intervention would have appeared, so attempts are comparable across conditions.
  - _Equal time cost_ — friction and intention both cost at least 10 s (same constant); intention also
    needs 3+ typed characters.
  - _Session order_ — every session stores a per-device sequence number (practice/novelty effects).
  - _Labels frozen during the study_ — "study mode" locks site labels; each session stores its label
    snapshot and a label-set version number.
  - _Mode field_ — every session is `solo` or `group`.
- **Analysis plan (preregistered on OSF before any non-pilot data):**
  - Mixed-effects models with **participant as a random effect** (random intercept), condition as a
    fixed effect, **session order** (sequence number) as a predictor. Count outcomes (attempts) with a
    Poisson / negative-binomial mixed model; focus rating as ordinal or linear mixed model; goal
    completion as a logistic mixed model.
  - Inclusion: **at least 5 solo sessions per condition per person**.
  - **Group sessions are excluded** from the main intervention analysis (still shown in the user's own
    Insights). Opted-out sessions are excluded.
  - Labels frozen (study mode on) during the study; **hypotheses are not shared with participants**.
- **Ethics:** **no research data from other people until IRB approval** (with Dr. Su). Before Dec 7:
  friends give usability feedback only; the study is presented as design + preregistration draft +
  hs's own N=1 pilot. Any future data collection: IRB approval, explicit in-app consent screen, preview
  before sharing, anonymous summaries only (no domains, no goal text).
