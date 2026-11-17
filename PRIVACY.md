# StudyLens Privacy Policy

_Effective: November 16, 2026 · Applies to StudyLens version 0.1.0 for Firefox_

StudyLens is a browser extension that helps you see how you study. It is built so that your
browsing stays yours: **everything it records stays on your device, and this version never sends
anything anywhere.**

## What StudyLens records

- The **website domain** of your active tab (for example, `youtube.com`) and how long it was active,
  only while tracking is on. Time stops counting when the browser window is not focused, and when
  your computer has had no keyboard or mouse input for 60 seconds (or is locked).
- Focus sessions you start: your goal text, planned length, start and end times, minutes per
  category, the number of distraction-site visits during the session, and your end-of-session
  check-in answers (goal finished: yes / partly / no, focus rating 1–5, or that you skipped it).
  The check-in is shown in the extension's own popup; StudyLens does not use browser notifications.
- The site categories you choose (study / neutral / distraction).
- Your "pause tracking" setting.
- **From version 0.2.0 (research interventions):** which research condition each focus session was
  given (`control`, `friction`, `intention`, or `opted-out`), the list of conditions left in the
  current random order, your "Research interventions" on/off setting, and whether you have seen the
  one-time notice about it. See "Research interventions" below.

## What StudyLens never records

- Full web addresses (paths or query strings), search terms, page titles, or page content
- Keystrokes, form entries, passwords, or screenshots
- Anything in private/incognito windows (the extension does not run there)

## Research interventions (version 0.2.0 and later)

StudyLens is testing which focus helpers actually help. When this feature is on, each focus
session is given one of three conditions at random: **control** (nothing changes), **friction** (a
short countdown before a site you labeled Distraction loads), or **intention** (a "What did you come
here for?" prompt before a site you labeled Distraction; your answer stays on your device). You are
not told the condition when you start a session; the My Data page shows it for each session.

- The condition is stored with the session, **only on your device**. Nothing is sent anywhere.
- You can turn research interventions off at any time on the My Data page (or the Settings tab).
  Sessions after that are marked `opted-out` and get no helper.
- The first time the popup opens after this feature is switched on, it shows a one-time notice
  with "Keep on" and "Turn off" buttons.
- No new browser permissions are needed for assigning conditions.
- The feature is **switched off in version 0.1.0**, and stays off until the friction and intention
  helpers are finished.

## Where your data lives

All of the above is stored **only on your device**, in the extension's local storage
(`browser.storage.local`). StudyLens version 0.1.0 has no server, no account, and makes no network
requests: nothing is uploaded, synced, or shared, and the developer cannot see your data.

## Retention

- Your data stays on your device until you delete it on the My Data page, or uninstall the
  extension (which removes its storage).
- **Planned for a later version:** detailed activity records older than 30 days will be combined
  into weekly totals and the details deleted automatically. This automatic cleanup is **not**
  in version 0.1.0.

## Your controls

- **Pause tracking** at any time, from the popup or the My Data page. While paused, no site
  activity is recorded; a running focus session keeps its timer.
- The **My Data** page (linked from the popup) shows exactly what is stored, in plain tables.
- **Export** everything as one JSON file.
- **Delete everything** (you type DELETE to confirm). This also stops a running session without a
  check-in. If tracking was paused, it stays paused; if research interventions were turned off,
  they stay off.
- **Turn research interventions off** (version 0.2.0 and later), on the My Data page or the
  Settings tab.

## No third parties

StudyLens contains no ads, analytics, or third-party trackers, and never sells or shares your data.

## Future optional features

Later versions may add **optional, off-by-default** features: study groups (members would see only
daily focus totals such as "focused 2h 15m", never sites) and research participation (anonymous
session summaries, never domains). None of these exist in version 0.1.0. Before any of them ships,
this policy will be updated, and the extension will ask for your explicit consent and show a
preview before anything leaves your device.

## Changes to this policy

Changes are published in this file, and its full history is visible in the public repository.

## Open source

The full source code is public at <https://github.com/haygens/studylens>, so anyone can check that
StudyLens does what this policy says.

## Contact

Questions or concerns: open an issue at <https://github.com/haygens/studylens/issues>.
