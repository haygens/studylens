# StudyLens — Plan

Goal: a privacy-respecting focus extension (Firefox + Edge) that helps students study and tests which
focus interventions actually work. Final show and tell: **Mon Dec 7, 2026**. Solo, ~10+ hrs/week.

Priority if time runs short: **Core tracker → Research interventions → Sync & study groups.**
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
- [ ] **P7. Privacy policy + store listing** — finalize PRIVACY.md, icons, screenshots. Submit v0.1 to
      Firefox Add-ons (AMO) early so review never blocks the deadline.

## Week 2 (Nov 22–28): Research layer + dashboard + Edge

- [ ] **P8. Intervention engine** — each session randomly assigned `control` / `friction` / `intention`.
      Log the condition on the session record. Tests for randomization balance.
- [ ] **P9. Friction intervention** — when a distraction site is opened during a session, show a short
      countdown page before continuing. Request the needed permission at runtime, only when enabled.
- [ ] **P10. Intention intervention** — "What did you come here for?" prompt before a distraction site;
      answer stays local.
- [ ] **P11. Local dashboard** — focus trends, best time of day, per-condition comparison (distraction
      visits, focus rating, goal completion).
- [ ] **P12. Retention job** — `alarms` daily: roll raw records >30 days into weekly totals, delete raw.
- [ ] **P13. Edge build + submit** — verify on Edge, submit to Edge Add-ons (free, GitHub sign-in).
- [ ] **P14. Recruit friends** — share install links, collect feedback. Consent screen ready before any
      data is shared (see P17).

## Week 3 (Nov 29–Dec 6): Backend, sync, study groups, results

- [ ] **P15. Data layer + Turso** — `web/lib/db/` interface with stub implementation first, then Turso.
      Create the Turso DB (web dashboard), set env vars in Vercel.
- [ ] **P16. Accounts** — simple auth (Auth.js or Better Auth). Extension links to an account only if the
      user opts in.
- [ ] **P17. Research consent + upload** — consent screen; opt-in upload of _anonymous session summaries_
      (condition, durations, rating, goal y/n — no domains). Preview before upload.
- [ ] **P18. Study groups** — create/join a group with a code; members see each other's daily focus totals
      only. Live "who's focusing" via polling (WebSockets optional, Vercel's are in beta).
- [ ] **P19. Reliability** — `withErrorLogging` wrapper → `error_logs` table, Vercel Cron cleanup
      (14 days, `CRON_SECRET`), optional Discord webhook alerts, tests in CI.
- [ ] **P20. Results + show and tell** — analyze collected summaries, make 2–3 charts of intervention
      results, demo script, portfolio card (title, link, reflection).

## Stretch / future work

- Chrome Web Store ($5), Safari ($99/yr + Mac)
- Optional AI coach reading weekly _summaries_ only
- Per-site daily limits, weekly email report

## Research question details

- **Question:** Do friction delays or intention prompts reduce distraction and improve self-rated focus
  compared with no intervention?
- **Design:** within-subject; condition randomized per session.
- **Measures:** distraction visits/session, distraction minutes/session, focus rating (1–5), goal
  completed (y/n).
- **Ethics:** informal friend group; explicit in-app consent; anonymous summaries only; confirm with
  instructor that this is sufficient for a class presentation.
