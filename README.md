# StudyLens

A privacy-respecting focus tracker for students, for **Firefox** (and soon Edge).

Set a goal, start a focus session, and see how your time splits between study, neutral, and
distraction sites. When the session ends, a two-question check-in asks whether you finished and how
focused you felt. You decide which sites count as study or distraction.

StudyLens is also a student research project asking **which focus interventions actually help
students study**. From version 0.2.0, each focus session gets one of three conditions at random:
nothing changes, a 10-second countdown before sites you labeled Distraction, or a "What did you
come here for?" question before them. A one-time notice explains this before your first session,
and you can turn it off anytime. It all stays on your device; nothing is shared.

**Install:** _Firefox Add-ons link coming soon (pending review)._

## Privacy in one minute

- **Local-first:** everything is stored only in your browser. Version 0.2.0 has no server and makes
  no network requests.
- **Domains only:** it records `youtube.com`, never full addresses, search terms, page titles, page
  content, or keystrokes. What you type in the "What did you come here for?" box is never stored.
- **Not in private windows.**
- **You're in control:** pause tracking, see every stored record on the My Data page, export it as
  JSON, or delete everything.
- **No ads, analytics, or trackers.**

Full policy: [PRIVACY.md](PRIVACY.md).

## Known limitations

- The friction countdown and the intention question appear when you **navigate** to a site you
  labeled Distraction, or **switch tabs** to one, during a session. They do **not** appear when you
  come back to the browser from another app while a Distraction tab is already showing, even
  though that return still counts as a distraction visit in the session's numbers.
- Tested automatically in Edge/Chromium; Firefox is tested by hand.

## Build from source (for add-on reviewers)

The Firefox add-on is built from this repository with no manual steps. The build is reproducible:
the same sources give the same files as the uploaded add-on.

**Tested build environment**

- OS: Windows 11 (23H2). The same commands also run on Ubuntu in CI (GitHub Actions); any OS
  that runs Node 24 should work (all files use LF line endings).
- Node.js **24.22.0** (any Node 24.x should work): <https://nodejs.org/>
- npm **11.19.1** (comes with Node 24; check with `npm -v`)

**Steps** (run in the folder that contains this README and `package-lock.json`):

```sh
npm ci
npm run build:firefox -w extension
```

- `npm ci` installs the exact dependency versions from `package-lock.json` (all from the public npm
  registry). It also runs `wxt prepare`, which generates TypeScript config files.
- The built add-on is in **`extension/.output/firefox-mv3/`**. Its files should match the uploaded
  add-on's files.
- To make the uploadable zip instead: `npm run zip:firefox -w extension` →
  `extension/.output/studylens-0.2.0-firefox.zip` (it also writes the sources zip next to it).

**What the build does:** [WXT](https://wxt.dev) (which uses Vite) bundles the TypeScript + React
source in `extension/` and the shared types in `packages/shared/`. No code is downloaded at
runtime, and no build step fetches anything except npm packages.

The repository is an npm workspace. The `web/` folder is a separate web app that is **not** part of
the extension; only its `package.json` is needed so that `npm ci` matches the lock file.

## Repository layout

```
extension/         the browser extension (WXT + React + TypeScript)
  entrypoints/     background script, popup, options page (site categories + My Data)
  src/             logic (tracking, sessions, storage), mostly pure and unit-tested
  public/icon/     icons (made from assets/icon.svg by `npm run icons -w extension`)
packages/shared/   shared TypeScript types
web/               web app (future: dashboard and opt-in sync), not part of the extension
docs/              plan, session log, store listing
```

## Development

```sh
npm install
npm run dev:firefox -w extension   # opens Firefox with the extension loaded
npm test                           # unit tests (Vitest)
npm run test:e2e                   # browser tests (Playwright, uses installed Edge; builds the
                                   # E2E and normal Edge versions first)
npm run lint
npm run typecheck
```

## Support

Questions and bug reports: [GitHub issues](https://github.com/haygens/studylens/issues).

## License

[MIT](LICENSE) © 2026 haygens
