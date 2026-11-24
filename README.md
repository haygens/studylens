# StudyLens

A privacy-respecting focus tracker for students, for **Firefox** and **Edge**.

Set a goal, start a focus session, and see how your time splits between study, neutral, and
distraction sites. When the session ends, a two-question check-in asks whether you finished and how
focused you felt. You decide which sites count as study or distraction.

StudyLens is also a student research project asking **which focus interventions actually help
students study**. From version 0.2.0, each focus session gets one of three conditions at random:
nothing changes, a 10-second countdown before sites you labeled Distraction, or a "What did you
come here for?" question before them. The welcome page (or a short popup notice) explains this
before your first session, and you can turn it off anytime. It all stays on your device; nothing is
shared.

From version 0.3.0 StudyLens has three themes to choose from (Sunrise, Ocean and Pastel) and a short
welcome page after installing. Every theme passes WCAG AA contrast, and Study / Neutral /
Distraction always have an icon and a label, never just a color.

**Install:** [Install for Firefox](https://addons.mozilla.org/en-US/firefox/addon/studylens/) ·
[Install for Edge](https://microsoftedge.microsoft.com/addons/detail/studylens/phepgpemnllainhhjemgknaeedjjekad)

## Privacy in one minute

- **Local-first:** everything is stored only in your browser. Version 0.4.0 has no server and makes
  no network requests. From version 0.5.0 there are optional **study groups**: only if you turn
  them on does StudyLens contact its server, and then it sends only a display name you choose,
  which groups you're in, and — behind two switches per group — your daily focus minutes and
  whether you're focusing right now. Never your browsing.
- **Domains only:** it records `youtube.com`, never full addresses, search terms, page titles, page
  content, or keystrokes. What you type in the "What did you come here for?" box is never stored.
- **Not in private windows.**
- **Automatic cleanup:** once a day, detailed activity records older than 30 days are combined
  into weekly totals (time per site and label) and deleted. Focus sessions are kept for Insights,
  but their goal text is removed after 30 days.
- **You're in control:** pause tracking, see every stored record on the My Data page, export it as
  JSON, or delete everything.
- **No ads, analytics, or trackers.**

Full policy: [PRIVACY.md](PRIVACY.md).

## Known limitations

- The friction countdown and the intention question appear when you **navigate** to a site you
  labeled Distraction, or **switch tabs** to one, during a session. They do **not** appear when you
  come back to the browser from another app while a Distraction tab is already showing. That
  return is not a new distraction visit either (see "How measures are defined").
- Tested automatically in Edge/Chromium; Firefox is tested by hand.

## How measures are defined

- **Distraction attempts** (from v0.4.0, the primary research measure): each time you **enter** a
  Distraction site during a session at the moment a helper page would appear, logged the same way
  in every condition, including control (where nothing is shown). After an attempt where the site
  loaded (control, or "Continue"), that site gets a 5-minute grace period in the session, so
  attempts count the same way in all conditions. Each attempt also records the outcome and, for
  the helper pages, how long the page was open. Distraction visits (below) are still counted.

Every number is calculated on your device from the stored activity records (domain + start/end
time) and your site labels. A "site" is a registrable domain (`m.youtube.com` and `youtube.com`
are both `youtube.com`), or a subdomain you labeled separately (such as `docs.google.com`).

- **Active time** counts only while the browser window is focused, the computer has had input in
  the last 60 seconds, and tracking is not paused. StudyLens's own pages (popup, options, the
  friction/intention page) are never recorded as a site.
- **Minutes per category** (study / neutral / distraction): the active time inside the session,
  added up by each site's label. Unlabeled sites are neutral.
- **Distraction visits** (definition 2, from 2026-11-18): a visit counts when the active site
  changes **into** a Distraction site **from a different site**, or when a Distraction site is the
  first site you open after the session starts.
  - Returning to the **same** Distraction site never counts again, whatever happened in between:
    another window (such as DevTools) or app, being idle, the friction/intention page, or the
    browser's Back/Forward buttons.
  - Going to a different site (study, neutral, or another distraction site) and then back does
    count again. Moving between two different Distraction sites counts.
  - A Distraction site that was already open when the session started (or less than a minute
    before) is not a visit until you leave it for a different site and come back.
  - To work this out, records for the same site that are less than 60 seconds apart are treated
    as one stretch. This happens only in the calculation; stored records are never changed.
  - Sessions that ended before this definition (v0.2.0 test builds before 2026-11-18) keep the
    numbers they were saved with. Under definition 1, every return to a Distraction site after
    any gap counted as a new visit, so those numbers can be too high.
- **Focus rating** (1–5) and **goal finished** (yes / partly / no) are your own answers to the
  end-of-session check-in. Skipped check-ins have neither.

The **Insights** tab (options page) calculates these in the browser; nothing is stored or sent:

- **Focus trends (last 14 days):** focus-session minutes per day are the time from each finished
  session's start to its end. Study and distraction minutes per day are all tracked time on sites
  labeled Study or Distraction, in or out of a session. Sessions and records that cross local
  midnight are split at midnight, so each part counts on its own day.
- **Best time of day:** the average focus rating of answered check-ins, grouped by the local hour
  the session started: morning (5 am–noon), afternoon (noon–5 pm), evening (5–10 pm), night
  (10 pm–5 am).
- **Focus helpers compared:** for control, friction, and intention sessions: number of sessions,
  average distraction visits, average distraction minutes, average focus rating, and goal
  finished (yes / partly / no, as a percentage of answered check-ins). Opted-out sessions and
  sessions without a condition are left out. A condition with fewer than 3 sessions shows "Not
  enough data yet" instead of averages. These are plain descriptive averages, with no
  significance test.
- **After the 30-day cleanup:** the trend charts only cover the last 14 days, which are always
  kept in full, and the other two use the focus sessions, which are kept (only their goal text is
  removed). So the cleanup never changes what Insights shows. Weekly
  totals of older weeks are shown on the My Data page.

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
  `extension/.output/studylens-0.4.0-firefox.zip` (it also writes the sources zip next to it).

**What the build does:** [WXT](https://wxt.dev) (which uses Vite) bundles the TypeScript + React
source in `extension/` and the shared types in `packages/shared/`. No code is downloaded at
runtime, and no build step fetches anything except npm packages.

The repository is an npm workspace. The `web/` folder is a separate web app that is **not** part of
the extension; only its `package.json` is needed so that `npm ci` matches the lock file. It is
deployed at <https://studylens-flame.vercel.app> (the extension does not contact it yet).

## Repository layout

```
extension/         the browser extension (WXT + React + TypeScript)
  entrypoints/     background script, popup, options page (site categories, Insights,
                   Settings, My Data), friction/intention page
  src/             logic (tracking, sessions, storage), mostly pure and unit-tested
  public/icon/     icons (made from assets/icon.svg by `npm run icons -w extension`)
packages/shared/   shared TypeScript types
web/               web app + API (study groups, from P16), not part of the extension;
                   deployed at https://studylens-flame.vercel.app
docs/              plan, session log, store listing
```

## Development

```sh
npm install
npm run dev:firefox -w extension   # opens Firefox with the extension loaded
npm test                           # unit tests (Vitest)
npm run test:e2e                   # browser tests (Playwright, uses installed Edge; builds the
                                   # E2E and normal Edge versions first)
npm run smoke:edge                 # smoke test of the real production Edge build in installed Edge
npm run lint
npm run typecheck
```

## Feedback and support

- **Feedback:** [anonymous feedback form](https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAANAATtyGOdURDg4VUNBRFRSRjgwMktVWEFEODMxTDk0Qi4u)
  (Microsoft Forms; no name or email asked). It's also the "Send feedback" link in the popup and
  on the Settings tab.
- Questions and bug reports: [GitHub issues](https://github.com/haygens/studylens/issues).

## License

[MIT](LICENSE) © 2026 haygens
