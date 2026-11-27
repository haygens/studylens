# StudyLens 0.6.0 — release notes

For the AMO update (0.5.0 → 0.6.0) and the Microsoft Edge Add-ons update. Not uploaded yet (hs
uploads by hand). Three texts below: AMO release notes (users), AMO notes to reviewer, Edge notes
for certification.

**Edge Privacy tab: no change needed for 0.6.0.** Live sessions and room links add no new kind of
data (the same display name and focus activity, plus an optional session goal the group sees), so
the same three boxes (Personally identifiable information, Web history, User activity), the same
single purpose and the same privacy policy URL still apply. Only the certification notes change.
Details: `edge-privacy-answers.md`.

**Store "website" fields (by hand, once):** AMO "Homepage" and Edge "Website URL" →
https://studylens-flame.vercel.app/ (matches the manifest's new `homepage_url`).

---

## 1. AMO release notes (users)

> Paste into "Release notes" for version 0.6.0.

New in 0.6.0:

- Live group focus sessions (optional, for study groups): start a shared session for one of your
  groups, or join one a friend started. Everyone gets the same timer, sees who is focusing, and
  gets a group "Session complete!" summary at the end (minutes only for members who share them).
- Room links: copy a link to a running group session and open it on any phone or screen, no
  extension needed. It shows the timer, the goal and who is focusing, never minutes or sites, and
  stops working 1 hour after the session ends.
- The new StudyLens website: https://studylens-flame.vercel.app (no cookies, no analytics).
- Clearer status: someone whose browser hasn't checked in for a couple of minutes now shows as
  "Away (last seen N min ago)" instead of "Focusing".

As always: your browsing stays on your device. Solo use still sends nothing anywhere.

---

## 2. AMO notes to reviewer

> Paste into "Notes to Reviewer" for version 0.6.0 (replaces the 0.5.0 notes).

StudyLens is a local-first focus tracker. Everything it records stays in `storage.local`. Version
0.5.0 added optional study groups; **0.6.0 adds live group focus sessions and room links on top of
them. No new permissions.**

**What changed since 0.5.0**

- Live group sessions (inside study groups only): a member starts a session for a group (optional
  goal the group sees, 5–180 minutes); other members join. Shared end time from the server clock,
  participants list (Focusing / Away / Finished / Left early), and a shared "Session complete!"
  summary. These sessions are marked `mode: group` locally and get no friction/intention helper.
- Room links: each live session has a 16-character random room code. "Copy room link" copies
  `https://studylens-flame.vercel.app/s/<code>` (clipboard write from a click; no clipboard
  permission). "Open room page" opens it in a normal tab. The extension itself does not load the
  room page or call the room endpoint.
- `homepage_url` now points to the landing page https://studylens-flame.vercel.app/.
- Status wording: "Away (last seen N min ago)" after 2 minutes without a heartbeat.

**Permissions: unchanged.** Same `permissions: storage, tabs, idle, alarms`, same optional host
permission `https://studylens-flame.vercel.app/*`, same optional data collection
`personallyIdentifyingInfo` + `technicalAndInteraction` (`required: ["none"]`), requested the same
way: one `permissions.request()` from the click on "Join or create a group" on the Study groups
tab, never at install. Starting or joining a live session additionally checks (with
`permissions.getAll()`) that both data categories are granted; without them nothing is sent and
the tab explains why.

**New endpoints the extension calls (only after opt-in, each request checks permissions first):**

- `POST /api/groups/:id/sessions` (start: goal, minutes)
- `GET /api/group-sessions` (running sessions in my groups)
- `GET /api/group-sessions/:id` (state, polled every 15 s only while the popup or the Study groups
  tab is open and visible)
- `POST /api/group-sessions/:id/join`, `/leave`, `/heartbeat` (heartbeat once a minute while in a
  session)

Server only, not called by the extension: `GET /api/rooms/:code` (public read-only room page data:
group name, goal, timer, display names and statuses).

**What is sent:** the optional goal text (≤120 characters, no email or web address; deleted from
the server 24 h after the session), the length, join/leave/heartbeat, and the device token.
**Never sent:** websites, domains, URLs, page titles, site labels, research conditions, check-in
answers. Session minutes are computed on the server from join/leave times and shown only to group
members, only if the member shares focus minutes in that group.

**Source code / build.** Bundled with WXT (Vite); the sources zip is attached.

1. Node.js 24, npm 11 (tested on Windows 11; also builds on Ubuntu in CI).
2. In the unzipped folder: `npm ci`
3. `npm run build:firefox -w extension`
4. Output: `extension/.output/firefox-mv3/`, identical to the uploaded zip (verified by
   unzipping the sources into a clean folder, building, and comparing every file's SHA-256).

Server source: `web/` in https://github.com/haygens/studylens; API in `docs/backend.md`.

**How to test a group session (about 3 minutes, one browser is enough):**

1. Options page → **Study groups** → **Join or create a group** → allow the prompt (server access
   - "personally identifying information" + "technical and interaction data").
2. Type a display name and a group name → **Create group**.
3. In **Live group sessions** → **Start a group session**: optional goal, 25 min → **Start group
   session**. The card shows the timer and you as "Focusing"; the toolbar popup shows the same
   session and time left.
4. **Copy room link** and paste it into a new tab (or open it on a phone): the room page shows the
   group, goal, timer and "Focusing", no minutes or sites.
5. **Leave session**: you show as "Left early"; as the only participant, the session ends and the
   "Session complete!" card appears. (A second Firefox profile can join the same session from its
   own Study groups tab after joining the group with the code.)
6. Clean up: **Leave group** → **Delete my group data from the server**.

---

## 3. Edge notes for certification

> Paste into "Notes for certification" (1,555 characters, under the 2,000 limit).

<!-- edge-notes:start -->

No credentials or accounts are needed. StudyLens is a local-first focus tracker; everything it
records stays in chrome.storage.local. 0.6.0 adds live group focus sessions and room links to the
optional study groups from 0.5.0. Permissions are unchanged: storage, tabs, idle, alarms, and the
optional host permission https://studylens-flame.vercel.app/* requested only when the user clicks
"Join or create a group" (never at install); every request checks it first.

New: a group member can start a shared session (optional goal, 5-180 min); others join; everyone
sees the same timer and who is focusing; a shared summary at the end. "Copy room link" copies a
read-only page https://studylens-flame.vercel.app/s/<code> (group, goal, timer, names, statuses).
New endpoints: POST /api/groups/:id/sessions, GET /api/group-sessions(/:id), POST
/api/group-sessions/:id/join|leave|heartbeat. Sent: goal (deleted after 24 h), length, join/leave,
a heartbeat once a minute. Never sent: websites, URLs, titles, labels, check-in answers.
homepage_url now points to https://studylens-flame.vercel.app/.

To test (3 min): Options > Study groups > Join or create a group > Allow. Enter a display name and
a group name > Create group. Under Live group sessions > Start group session (25 min): the card and
the popup show the timer and you as Focusing. Copy room link, open it in a new tab: the room page
shows the session. Leave session > Session complete! card. Then Leave group > Delete my group data
from the server. Source (MIT): https://github.com/haygens/studylens

<!-- edge-notes:end -->
