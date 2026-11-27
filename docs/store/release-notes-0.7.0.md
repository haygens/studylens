# StudyLens 0.7.0 — release notes

For the AMO update (0.6.0 → 0.7.0) and the Microsoft Edge Add-ons update. Not uploaded yet (hs
uploads by hand). Three texts below: AMO release notes (users), AMO notes to reviewer, Edge notes
for certification.

**Edge Privacy tab: no change needed for 0.7.0.** 0.7.0 is visual only: no new data, no new
requests, no new permissions. The room look is chosen on the device and never sent anywhere.

---

## 1. AMO release notes (users)

> Paste into "Release notes" for version 0.7.0.

New in 0.7.0:

- Cozy live rooms: group sessions now have a look that matches your theme. Sunrise sits by the
  fire (Hearth), Ocean watches the rain (Rainy Window) and Pastel meets at the Corner Café.
- "Open room page" opens the room in your look. On the room page, a "Room look" switcher lets you
  pick another one (saved in that browser only).
- Gentle motion: soft fades, a calm "Live" pulse and a smoother timer. Turn on "reduce motion"
  in your system settings and everything stays still.

As always: your browsing stays on your device. Solo use still sends nothing anywhere.

---

## 2. AMO notes to reviewer

> Paste into "Notes to Reviewer" for version 0.7.0 (replaces the 0.6.0 notes).

StudyLens is a local-first focus tracker. Everything it records stays in `storage.local`.
**0.7.0 is a visual update. No new permissions, no new network requests, no new data.**

**What changed since 0.6.0**

- Live group session cards (popup and the Study groups tab) are drawn in one of three "room
  looks" chosen from the user's existing colour theme (Sunrise → Hearth, Ocean → Rainy Window,
  Pastel → Corner Café): colour tokens, a small decorative inline SVG scene, and status dots next
  to the existing status words.
- "Open room page" now adds a URL fragment `#look=hearth|cafe|rainy` to the room link it opens.
  A fragment is never sent to the server. "Copy room link" is unchanged.
- CSS-only motion (opacity/transform), all inside `@media (prefers-reduced-motion:
no-preference)`.
- Fonts: system fonts only (no web fonts, nothing loaded from the network).

**Permissions: unchanged** (`storage, tabs, idle, alarms`; optional host permission
`https://studylens-flame.vercel.app/*`; same optional data collection, requested only from the
click on "Join or create a group").

**Source code / build.** Bundled with WXT (Vite); the sources zip is attached.

1. Node.js 24, npm 11 (tested on Windows 11; also builds on Ubuntu in CI).
2. In the unzipped folder: `npm ci`
3. `npm run build:firefox -w extension`
4. Output: `extension/.output/firefox-mv3/`, identical to the uploaded zip (verified by
   unzipping the sources into a clean folder, building, and comparing every file's SHA-256).

**How to see it (about 2 minutes):** Options → Study groups → Join or create a group → allow →
create a group → Start a group session. The live card shows the Hearth look (default Sunrise
theme). Change the theme in Settings to Ocean or Pastel: the card switches to Rainy Window or
Corner Café. Then Leave session → Leave group → Delete my group data from the server.

---

## 3. Edge notes for certification

> Paste into "Notes for certification" (1,200 characters, under the 2,000 limit).

<!-- edge-notes:start -->

No credentials or accounts are needed. StudyLens is a local-first focus tracker; everything it
records stays in chrome.storage.local. 0.7.0 is a visual update: live group session cards get one
of three looks (Hearth, Rainy Window, Corner Cafe) chosen from the user's colour theme, with small
decorative SVG scenes and gentle CSS motion that stays off when the system asks for reduced
motion. No new permissions, no new network requests, no new data. Permissions stay: storage, tabs,
idle, alarms, and the optional host permission https://studylens-flame.vercel.app/* requested only
when the user clicks "Join or create a group".

"Open room page" now adds #look=<look> to the room link it opens; a URL fragment is never sent to
the server. System fonts only; nothing is loaded from the network for the looks.

To test (2 min): Options > Study groups > Join or create a group > Allow. Enter a display name and
a group name > Create group. Under Live group sessions > Start group session: the card shows the
Hearth look. Settings > Theme > Ocean or Pastel: the card changes look. Leave session, then Leave
group > Delete my group data from the server. Source (MIT): https://github.com/haygens/studylens

<!-- edge-notes:end -->
