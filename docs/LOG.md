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
