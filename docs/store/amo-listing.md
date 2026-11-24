# addons.mozilla.org listing — StudyLens 0.2.0

Copy each field into the AMO Developer Hub when submitting. Distribution: **On this site (listed)**.
Platform: **Firefox for desktop only** (leave Android unchecked; the `idle` API and toolbar popup are
desktop features).

## Files to upload

- Add-on: `extension/.output/studylens-0.2.0-firefox.zip`
- Source code (AMO asks "Do you need to submit source code?" → **Yes**, because the code is bundled
  by Vite): `extension/.output/studylens-0.2.0-sources.zip`
- Screenshots (1280×800, made by `npm run screenshots -w extension`), in this order:
  `docs/store/screenshots/1-focus-session.png`, `2-friction-countdown.png`,
  `3-intention-question.png`, `4-insights.png` (sample sessions, not real results),
  `5-my-data.png`, `6-check-in.png`, `7-site-categories.png`
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

**Insights.** A dashboard on the options page, calculated on your device: focus minutes per day
for the last 14 days, study vs. distraction time, the time of day you rate your focus highest,
and how your sessions went with each focus helper (below). It shows plain averages and says
clearly when there isn't enough data yet.

**Private by design.**
• Records only the domain of the active tab (like youtube.com), never full addresses, search terms,
page titles, page content, or keystrokes.
• Everything is stored only in your browser. This version has no server and makes no network
requests.
• Does not run in private windows.
• Stops counting when the browser isn't focused or you've been away from the keyboard for a minute.
• Pause tracking at any time.
• Detailed records are combined into weekly totals after 30 days, automatically.
• The My Data page shows every stored record in plain tables, with one-click JSON export and a
delete-everything button.
• No ads, analytics, or trackers. Open source.

**Research helpers.** StudyLens is a student project testing which focus techniques actually help.
Each focus session gets one of three conditions at random: nothing changes, a 10-second countdown
before sites you labeled Distraction, or a "What did you come here for?" question before them (what
you type is never stored). A notice explains this before your first session, with "Keep on" and
"Turn off" buttons, and you can turn it off anytime on the My Data page. Only the condition and a
few counts are saved, on your device. Any future sharing features will be optional, off by
default, and will ask for your consent first.

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

**MIT License** (see `LICENSE` in the repository root).

## This add-on is experimental

Yes. (Ticked on AMO for the v0.1/v0.2 testing stage; plan to untick it once friends have tested
it.)

## Requires payment / non-free services

No.

---

## Notes to reviewer

> Paste everything in this section into "Notes to Reviewer".

StudyLens is a local-only focus tracker. Version 0.2.0 has no server, no account, no remote code,
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
  paths, query strings and titles are never stored. During a research session, `tabs.update`
  sends a tab opening a user-labeled Distraction site to the add-on's own `interstitial.html`
  (countdown or "What did you come here for?"); the target address travels only in that page's
  own URL so "Continue" can go there, and is never stored. The typed answer is never stored or
  sent.
- `idle`: stop counting time when the user has had no input for 60 seconds or the screen is locked
  (`idle.setDetectionInterval`, `idle.onStateChanged`, `idle.queryState`).
- `alarms`: end a focus session at its planned time and a once-a-minute heartbeat that keeps the
  time accounting accurate while the background script is suspended. The heartbeat also runs the
  once-a-day cleanup that turns activity records older than 30 days into weekly totals.
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

**How to test (about 8 minutes).**

1. Install the add-on and click the StudyLens toolbar button. The popup shows the one-time
   "Research interventions" notice, a Start form (disabled until the notice is answered) and a
   "Today" section. Click **Keep on**.
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
   everything (type DELETE). The Focus sessions table shows each session's condition and its
   friction / intention counts. The **Insights** tab next to it shows charts for the last 14 days
   and the per-condition table ("Not enough data yet" until a condition has 3 sessions).
8. To see a helper page without waiting for a random draw: open `about:debugging` → This Firefox →
   StudyLens → Inspect → Console, run
   `browser.storage.local.set({ 'interventions:block': ['intention'] })` (or `['friction']`), start
   a session, then open youtube.com.

---

## Version 0.5.0 (study groups, P16 + P18) — changes for the next upload

Not uploaded yet: 0.5.0 ships when study groups (P16) and passive groups (P18) are both done.
Everything above still applies, with these changes.

**Data collection (Developer Hub → "Data collection" and the manifest).** The manifest declares
`data_collection_permissions: { required: ["none"], optional: ["personallyIdentifyingInfo"] }`.
Nothing is collected by default. The optional category covers the **display name** a user picks
when they create or join a study group (it may be a real name, so it is declared). It is requested
at runtime, in the same `permissions.request()` as the server origin, only when the user clicks
"Join or create a group" — never at install. (`technicalAndInteraction` is not used.) If AMO's
form asks which data is transmitted: display name and group membership, to the developer's own
server, only after opt-in.

**Notes to reviewer — replace the first paragraph with:**

StudyLens is a local-first focus tracker. Everything it records stays in `storage.local`. Version
0.5.0 adds **optional study groups**: only if the user opens the "Study groups" tab, reads what is
shared, and clicks "Join or create a group", StudyLens asks for the optional host permission
`https://studylens-flame.vercel.app/*` and the optional data collection category
`personallyIdentifyingInfo` (one prompt; if Firefox didn't grant the data category, a second
prompt asks for it alone from its own button). Then, and only then, it sends the server a display name
the user chooses, a group name or join code, and a random device token the server issued. It never
sends browsing data (no domains, URLs, titles, labels, goals, check-in answers or research data).
Users who never open groups make no network requests at all. Server source: `web/` in the same
repository (Next.js on Vercel, Turso database); API documented in `docs/backend.md`.

**Permissions — add:**

- `optional_host_permissions: ["https://studylens-flame.vercel.app/*"]`: the StudyLens server, for
  study groups only. Requested with `permissions.request()` from the click on "Join or create a
  group". Every request first checks `permissions.contains()`, so revoking it in about:addons
  stops all traffic. "Delete my group data from the server" deletes the server copy and calls
  `permissions.remove()`.

**How to test study groups (about 3 minutes, add after step 8):**

9. Options page → **Study groups** tab. It explains what is shared and what never is. Nothing has
   been sent yet.
10. Click **Join or create a group**. Firefox asks to allow access to studylens-flame.vercel.app
    and to share "personally identifying information" (the display name). Allow. (StudyLens reads
    the data category back with `permissions.getAll()` and sends the display name only if it is
    granted; `contains()` is not trusted for it, because it ignores `data_collection` when
    `extensions.dataCollectionPermissions.enabled` is off.)
11. Type a display name (e.g. "Reviewer") and a group name, click **Create group**. The group card
    shows an 8-character join code and you as the only member. "Copy invite message" copies the
    code and install links.
12. **Leave group** → Yes, leave. Then **Delete my group data from the server** → Yes, delete: the
    server copy is deleted and the permission is given back (about:addons → Permissions).
