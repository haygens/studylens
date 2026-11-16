# addons.mozilla.org listing — StudyLens 0.1.0

Copy each field into the AMO Developer Hub when submitting. Distribution: **On this site (listed)**.
Platform: **Firefox for desktop only** (leave Android unchecked; the `idle` API and toolbar popup are
desktop features).

## Files to upload

- Add-on: `extension/.output/studylens-0.1.0-firefox.zip`
- Source code (AMO asks "Do you need to submit source code?" → **Yes**, because the code is bundled
  by Vite): `extension/.output/studylens-0.1.0-sources.zip`
- Screenshots: `docs/store/screenshots/1-focus-session.png`, `2-check-in.png`,
  `3-site-categories.png`, `4-my-data.png` (1280×800)
- Icon: AMO uses the 128px icon from the add-on itself (`extension/public/icon/128.png`).

## Name

StudyLens

## Add-on URL (slug)

studylens

## Summary (max 250 characters)

Focus sessions for students: set a goal, see time on study vs. distraction sites, and rate your focus afterwards. Privacy-first: records domain names only, stores everything on your device, sends nothing anywhere.

<!-- 213 characters -->

## Description

StudyLens helps you see how you actually study, without giving up your privacy.

**Focus sessions.** Write down what you'll work on, pick 25 or 50 minutes (or your own length), and
start. The popup shows a countdown. When the session ends, a quick check-in asks: did you finish
your goal (yes / partly / no), and how focused were you (1–5)?

**Your own site categories.** Label sites as study, neutral, or distraction. Nothing is labeled
until you say so; a short list of common suggestions is there to accept with one click. StudyLens
then shows how much of today went to each site and category, and how many times you opened a
distraction site during a session.

**Private by design.**
• Records only the domain of the active tab (like youtube.com), never full addresses, search terms,
page titles, page content, or keystrokes.
• Everything is stored only in your browser. This version has no server and makes no network
requests.
• Does not run in private windows.
• Stops counting when the browser isn't focused or you've been away from the keyboard for a minute.
• Pause tracking at any time.
• The My Data page shows every stored record in plain tables, with one-click JSON export and a
delete-everything button.
• No ads, analytics, or trackers. Open source.

StudyLens is a student project that will later explore which focus techniques actually help
students. Any research or sharing features will be optional, off by default, and will ask for your
consent first.

## Categories

Firefox desktop (pick up to two from the dropdown): **Tabs** and **Other**. (AMO has no
"Productivity" category; if one appears, prefer it.)

## Tags (optional)

productivity, focus, study, pomodoro, privacy

## Support email

Leave blank (use the support site).

## Support site

https://github.com/haygens/studylens/issues

## Homepage

https://github.com/haygens/studylens

## Privacy policy

AMO lets you paste the policy text or link to it. Paste the full text of `PRIVACY.md`, and/or use:
https://github.com/haygens/studylens/blob/main/PRIVACY.md

## License

Pick the license that matches the repository (no LICENSE file yet; see open questions in docs/LOG.md).

## This add-on is experimental

No.

## Requires payment / non-free services

No.

---

## Notes to reviewer

> Paste everything in this section into "Notes to Reviewer".

StudyLens is a local-only focus tracker. Version 0.1.0 has no server, no account, no remote code,
and makes no network requests. It does not collect or transmit any data
(`data_collection_permissions: { required: ["none"] }`).

**Source code / build.** The add-on is bundled with WXT (Vite), so the source zip is attached.
Build instructions are in README.md at the root of the source zip:

1. Node.js 24.22.0, npm 11.19.1 (tested on Windows 11; also builds on Ubuntu in CI).
2. In the unzipped folder: `npm ci`
3. `npm run build:firefox -w extension`
4. Output: `extension/.output/firefox-mv3/`. It matches the uploaded zip (verified by unzipping
   the sources into a clean folder, building, and comparing every file's SHA-256).

The repo is an npm workspace monorepo: the extension is in `extension/`, shared types in
`packages/shared/`. `web/package.json` is included only so `npm ci` matches the lock file; the web
app is not part of the add-on. Public repository: https://github.com/haygens/studylens

**Permissions — why each is needed.** No host permissions, no content scripts.

- `tabs`: read the hostname of the active tab (`tabs.query`, `tabs.onActivated`, `tabs.onUpdated`)
  to know which site is being used. The URL is immediately reduced to its hostname; full URLs,
  paths, query strings and titles are never stored.
- `idle`: stop counting time when the user has had no input for 60 seconds or the screen is locked
  (`idle.setDetectionInterval`, `idle.onStateChanged`, `idle.queryState`).
- `alarms`: end a focus session at its planned time and a once-a-minute heartbeat that keeps the
  time accounting accurate while the background script is suspended.
- `storage`: keep everything locally in `storage.local` (activity by domain, sessions, check-in
  answers, site categories, pause setting).

`incognito: "not_allowed"`: the extension never runs in private windows.

**Domains-only design.** Tracking stores `{ hostname, start, end }` segments only. Goal text and
check-in answers typed by the user stay in `storage.local`. Users can view all stored data on the
My Data page (options page → "My Data" tab), export it as JSON, or delete it all.

**No remote code.** All JavaScript is bundled in the package. No `eval`, no `new Function`, no
remote scripts. The only `fetch` in the bundle is Vite's module-preload helper, which loads the
add-on's own chunk files. The two `innerHTML` warnings from the linter are inside React DOM's
library code (`dangerouslySetInnerHTML` support); StudyLens never uses `innerHTML` or
`dangerouslySetInnerHTML`.

**How to test (about 6 minutes).**

1. Install the add-on and click the StudyLens toolbar button. The popup shows a Start form and a
   "Today" section.
2. Click "Edit site categories…". Under "Your labels", type `wikipedia.org`, choose **Study**, click
   Add. Add `youtube.com` as **Distraction** (or click Accept next to the suggestions).
3. Open the popup, type a goal (e.g. "Read chapter 4"), choose **Custom → 5** minutes, click
   "Start focus session". A countdown appears.
4. Visit wikipedia.org for a minute, then youtube.com briefly, then back. Keep using the mouse or
   keyboard now and then (time stops counting after 60 s without input).
5. Reopen the popup: "Today" lists wikipedia.org (Study) and youtube.com (Distraction) with minutes.
6. When the 5 minutes end, the toolbar badge shows "?" if the popup is closed. Open the popup to
   answer the check-in (finished? / focus 1–5) and click Save. "Last session" then shows the
   minutes per category and distraction visits. ("End early" shows the check-in right away.)
7. Click "My Data" in the popup to see every stored record, export JSON, pause tracking, or delete
   everything (type DELETE).
