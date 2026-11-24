# Microsoft Edge Add-ons listing — StudyLens 0.2.0

Copy each field into Microsoft Partner Center (Edge program) when submitting (P13). Sign in with a
Microsoft account (or GitHub); the Edge developer account is free. Field limits change sometimes;
Partner Center shows the current ones next to each field.

## Store ID (for future updates)

- Edge store ID: **`phepgpemnllainhhjemgknaeedjjekad`**
- Public listing: https://microsoftedge.microsoft.com/addons/detail/studylens/phepgpemnllainhhjemgknaeedjjekad
- Live since 2026-11-22 (v0.4.0). To update, open this product in Partner Center → Packages →
  upload the new `studylens-<version>-edge.zip`. Do not create a new product.

## Files to upload

- Package: `extension/.output/studylens-0.2.0-edge.zip` (`npm run zip:edge -w extension`). Edge
  does not ask for source code.
- Extension Store logo (300×300): `docs/store/edge/store-logo-300x300.png`
- Small promotional tile (440×280): `docs/store/edge/small-promo-tile-440x280.png`
- Screenshots (1280×800, in this order):
  1. `docs/store/screenshots/1-focus-session.png`
  2. `docs/store/screenshots/2-friction-countdown.png`
  3. `docs/store/screenshots/3-intention-question.png`
  4. `docs/store/screenshots/4-insights.png` (made with sample sessions, not real results)
  5. `docs/store/screenshots/5-my-data.png`
  6. `docs/store/screenshots/6-check-in.png`
  7. `docs/store/screenshots/7-site-categories.png`
- Large promotional tile (1400×560) and YouTube video: optional, none.

All images are made by `npm run screenshots -w extension`.

## Availability

- Visibility: **Public**
- Markets: all markets

## Properties

- Category: **Productivity**
- Privacy policy required? **Yes** (the extension handles browsing activity, even though it never
  leaves the device). Privacy policy URL:
  https://github.com/haygens/studylens/blob/main/PRIVACY.md
- Website URL: https://github.com/haygens/studylens
- Support contact: https://github.com/haygens/studylens/issues
- Mature content: **No**

## Store listing (English)

### Display name

StudyLens

(Comes from the manifest.)

### Short description

Focus sessions for students. Records domain names only and keeps everything on your device.

<!-- 91 characters -->

### Description

StudyLens helps you see how you actually study, without giving up your privacy.

**Focus sessions.** Write down what you'll work on, pick 25 or 50 minutes (or your own length), and
start. The toolbar button shows the minutes left. When the session ends, a quick check-in asks: did
you finish your goal (yes / partly / no), and how focused were you (1–5)?

**Your own site categories.** Label sites as study, neutral, or distraction. Nothing is labeled
until you say so; a short list of common suggestions is there to accept with one click. StudyLens
then shows how much of today went to each site and category, and how many times you opened a
distraction site during a session.

**Insights.** A dashboard on the options page, calculated on your device: focus minutes per day
for the last 14 days, study vs. distraction time, the time of day you rate your focus highest,
and how your sessions went with each focus helper (below). It shows plain averages and says
clearly when there isn't enough data yet.

**Focus helpers (research).** StudyLens is a student project testing which focus techniques
actually help. Each focus session gets one of three conditions at random: nothing changes, a
10-second countdown before sites you labeled Distraction, or a "What did you come here for?"
question before them. What you type is never stored. A notice explains this before your first
session, with "Keep on" and "Turn off" buttons, and you can turn it off anytime.

**Private by design.**
• Records only the domain of the active tab (like youtube.com), never full addresses, search
terms, page titles, page content, or keystrokes.
• Everything is stored only in your browser. There is no server and no account, and StudyLens
makes no network requests.
• Does not run in InPrivate windows.
• Stops counting when the browser isn't focused or you've been away from the keyboard for a
minute.
• Pause tracking at any time.
• Detailed records are combined into weekly totals after 30 days, automatically.
• The My Data page shows every stored record in plain tables, with one-click JSON export and a
delete-everything button.
• No ads, analytics, or trackers. Open source (MIT).

Any future sharing features will be optional, off by default, and will ask for your consent
first.

### Search terms

focus, study, pomodoro, productivity, privacy, students, timer

---

## Notes for certification

> Paste everything in this section into "Notes for certification".

StudyLens is a local-only focus tracker for students. Version 0.2.0 has no server, no account, no
remote code, and makes **no network requests**. It does **not collect or transmit any data**:
everything stays in `chrome.storage.local` on the user's device. Source code (MIT):
https://github.com/haygens/studylens — the package is built from it with
`npm ci && npm run build:edge -w extension` (WXT + Vite; Node 24).

**Permissions — why each is needed.** No host permissions, no content scripts, no optional
permissions.

- `tabs`: read the hostname of the active tab (`tabs.query`, `tabs.onActivated`,
  `tabs.onUpdated`) to know which site is in use. The URL is immediately reduced to its hostname;
  full URLs, paths, query strings and titles are never stored. During a research session,
  `tabs.update` sends a tab that is opening a site the user labeled Distraction to the
  extension's own `interstitial.html` (a 10-second countdown, or a "What did you come here for?"
  question). The target address travels only in that page's own URL so "Continue" can go there;
  it is never stored. The typed answer is never stored or sent.
- `idle`: stop counting time when the user has had no input for 60 seconds or the screen is
  locked (`idle.setDetectionInterval`, `idle.onStateChanged`, `idle.queryState`).
- `alarms`: end a focus session at its planned time, update the badge every minute, and a
  once-a-minute heartbeat that keeps time accounting accurate while the service worker is
  suspended. The heartbeat also runs the once-a-day cleanup that turns activity records older
  than 30 days into weekly totals.
- `storage`: keep everything locally in `storage.local` (activity by domain, sessions, check-in
  answers, site labels, settings).

`incognito: "not_allowed"`: the extension never runs in InPrivate windows.

**No remote code.** All JavaScript is bundled in the package. No `eval`, no `new Function`, no
remote scripts, no external resources. The background is a service worker (`background.js`).

**No data collection.** Nothing is sent anywhere: no analytics, no telemetry, no server. Users can
see all stored data on the My Data page, export it as JSON, or delete it all.

**How to test (about 8 minutes).**

1. Install the extension and click the StudyLens toolbar button. The popup shows the one-time
   "Research interventions" notice, a Start form (disabled until the notice is answered) and a
   "Today" section. Click **Keep on**.
2. Click "Edit site categories…". Under "Your labels", type `wikipedia.org`, choose **Study**,
   click Add. Add `youtube.com` as **Distraction** (or click Accept next to the suggestions).
3. Open the popup, type a goal (e.g. "Read chapter 4"), choose **Custom → 5** minutes, and click
   "Start focus session". A countdown appears.
4. Visit wikipedia.org for a minute, then youtube.com briefly, then back. Move the mouse now and
   then (time stops counting after 60 s without input). If the session drew the friction or
   intention condition, youtube.com first shows a StudyLens page (countdown or question);
   "Continue" opens the site.
5. Reopen the popup: "Today" lists wikipedia.org (Study) and youtube.com (Distraction).
6. When the 5 minutes end, the toolbar badge shows "?" if the popup is closed. Open the popup,
   answer the check-in, and click Save. ("End early" shows the check-in right away.)
7. Right-click the toolbar button → Extension options → **Insights** tab: charts for the last 14
   days and the per-condition table ("Not enough data yet" until a condition has 3 sessions).
8. **My Data** tab: every stored record, Export (JSON), Pause tracking, and Delete everything
   (type DELETE).
9. To see a helper page without waiting for a random draw: open `edge://extensions` → StudyLens →
   "Inspect views: service worker" → Console, run
   `chrome.storage.local.set({ 'interventions:block': ['intention'] })` (or `['friction']`), then
   start a new session and open youtube.com.

---

## Version 0.5.0 (study groups, P16 + P18) — changes for the next upload

Not uploaded yet (P16 + P18 done 2026-11-23; zips built). Everything above still applies, with these changes. Privacy questions in Partner Center: see
`edge-privacy-answers.md`.

**Notes for certification — replace the first paragraph with:**

StudyLens is a local-first focus tracker for students. Everything it records stays in
`chrome.storage.local`. Version 0.5.0 adds **optional study groups**: only if the user opens the
"Study groups" tab and clicks "Join or create a group" does StudyLens request the optional host
permission `https://studylens-flame.vercel.app/*` (never at install). After that it sends the
StudyLens server only a display name the user chooses, a group name or join code, and a random
device token the server issued — and, while the user leaves the per-group switches on (on by
default after an explanation with a live preview), one number per day (focus minutes inside
StudyLens focus sessions) and whether a focus session is running now, for members of their groups.
It never sends browsing data (no domains, URLs, titles, site
labels, goals, check-in answers or research data). Users who never use groups make no network
requests at all. Source code (MIT): https://github.com/haygens/studylens (server in `web/`, API in
`docs/backend.md`).

**Permissions — replace "No host permissions, no content scripts, no optional permissions." with:**

No host permissions at install, no content scripts. One optional host permission:

- `optional_host_permissions: ["https://studylens-flame.vercel.app/*"]`: the StudyLens server, for
  study groups only. Requested with `chrome.permissions.request()` from the click on "Join or
  create a group". Every request first checks `chrome.permissions.contains()`. "Delete my group
  data from the server" deletes the server copy and removes the permission again.

**How to test study groups (add after step 9):**

10. Options page → **Study groups** tab. It explains what is shared and what never is.
11. Click **Join or create a group** → Edge asks to allow access to studylens-flame.vercel.app →
    Allow.
12. Type a display name and a group name (the two sharing switches above the forms are on, with a
    preview of what others see) → **Create group**. The card shows the join code and you as the
    only member.
13. Start a focus session from the toolbar popup. On the group card your row shows "Focusing now"
    (Refresh, or wait up to 60 s). Turn "Show when I'm focusing" off: the badge disappears.
14. **Leave group**, then **Delete my group data from the server**.
