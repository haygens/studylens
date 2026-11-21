# StudyLens Privacy Policy

_Effective: November 21, 2026 · Applies to StudyLens version 0.3.0 for Firefox and Microsoft Edge (and
earlier)_

StudyLens is a browser extension that helps you see how you study. It is built so that your
browsing stays yours: **everything it records stays on your device, and this version never sends
anything anywhere. StudyLens never stores what you type** — on websites, or in its own "What did
you come here for?" box. The only text it keeps is what you enter as a session goal or a site
label.

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
  current random order, your "Research interventions" on/off setting, and whether you have answered
  the one-time notice about it. For sessions with the friction or intention helper: how many times
  its page was shown, how many times you pressed "Continue", and how many times "Back to studying"
  (just these numbers), plus which sites (domain names only) are in their 5-minute "not again"
  period. See "Research interventions" below.
- **From version 0.3.0:** your chosen theme (Sunrise, Ocean or Pastel), whether you have finished
  the welcome page, and whether the "New: themes!" hint was dismissed. These are settings only.
- **Weekly totals** of activity older than 30 days (time per week, site, and label), and the time
  the daily cleanup last ran. See "Retention" below.

The **Insights** tab (charts of your focus time, best time of day, and the research conditions
compared) is calculated in your browser from the records above each time you open it. It stores
nothing extra and sends nothing anywhere.

## What StudyLens never records

- Full web addresses (paths or query strings), search terms, page titles, or page content
- Keystrokes, form entries, passwords, or screenshots
- **What you type in the "What did you come here for?" box.** It is never stored, logged, or sent
  anywhere (see below)
- Anything in private/incognito windows (the extension does not run there)

## Research interventions (version 0.2.0 and later)

StudyLens is testing which focus helpers actually help. When this feature is on, each focus
session is given one of three conditions at random: **control** (nothing changes), **friction** (a
short countdown before a site you labeled Distraction loads), or **intention** (a "What did you come
here for?" prompt before a site you labeled Distraction; StudyLens never stores your answer). You
are not told the condition when you start a session; the My Data page shows it for each session.

- The condition is stored with the session, **only on your device**. Nothing is sent anywhere.
- You can turn research interventions off at any time on the My Data page (or the Settings tab).
  Sessions after that are marked `opted-out` and get no helper.
- The feature is **on by default from version 0.2.0**. Before your first focus session you choose
  "Keep on" or "Turn off": on the welcome page that opens after installing (from version 0.3.0),
  or in a short notice in the popup. The popup notice keeps showing until you press one of them,
  and no focus session can start until you do.
- **When the helpers appear:** when you open a site you labeled Distraction during a friction or
  intention session (or switch to a tab that is already on one), StudyLens sends that tab to its
  own page first, which shows the site's domain and your session goal. "Back to studying" works
  right away. After "Continue", that site gets no helper page again for 5 minutes in that session.
  It never happens in private windows, on browser or extension pages, or while tracking is paused.
  It also does not happen when you come back to the browser from another app.
- **Friction:** the page shows a 10-second countdown, then "Continue to <site>".
- **Intention:** the page asks "What did you come here for?" "Continue to <site>" becomes available
  once you type at least 3 characters. **StudyLens never stores what you type:** your answer exists
  only on that page while it is open. It is not saved, logged, or sent anywhere, the browser's
  form autofill is turned off for that box, and the box is emptied before the page closes. Only
  the counts above (shown / "Continue" / "Back to studying") are kept.
- **The full web address stays out of storage.** To let "Continue" take you back to the exact page
  you opened, the helper page receives that page's address in its own address. StudyLens never
  saves it, logs it, or sends it anywhere; only the domain and the counts above are stored.
- No new browser permissions are needed: the helper pages use the `tabs` permission StudyLens
  already has to open its own page in the tab.
- The feature was **switched off in version 0.1.0**.

## Where your data lives

All of the above is stored **only on your device**, in the extension's local storage
(`browser.storage.local`). StudyLens version 0.3.0 has no server, no account, and makes no network
requests: nothing is uploaded, synced, or shared, and the developer cannot see your data. The
themes use only fonts already on your computer; no web fonts or other files are downloaded.

## Feedback link

From version 0.3.0, the popup and the Settings tab may show a **"Send feedback"** link (it only
appears once the feedback form exists). It opens a Microsoft Forms page in a new tab. StudyLens
sends nothing to it and fills nothing in for you: the form only receives what you choose to type
there, under Microsoft's privacy statement. Using it is entirely optional.

## Retention

- **Automatic cleanup (on from version 0.2.0):** once a day, detailed activity records (domain,
  start and end time) older than 30 days are combined into **weekly totals**: the time per site
  (domain) and label for each week, Monday to Sunday. The detailed records for those days are then
  deleted. The weekly totals show on the My Data page and are included in the export.
- **Focus sessions** are kept, because the Insights tab and the research results need them. After
  30 days, only the session's goal text is deleted. What stays is numbers only: start and end
  time, planned length, minutes per category, number of distraction visits, condition, check-in
  answers, and the friction/intention counts (how often each helper page was shown, and how often
  you continued or went back to studying). None of these contain site names or text you typed.
- Everything else (weekly totals, sessions, labels, settings) stays on your device until you
  delete it on the My Data page, or uninstall the extension (which removes its storage).

## Your controls

- **Pause tracking** at any time, from the popup or the My Data page. While paused, no site
  activity is recorded; a running focus session keeps its timer.
- The **My Data** page (linked from the popup) shows exactly what is stored, in plain tables.
- **Export** everything as one JSON file.
- **Delete everything** (you type DELETE to confirm). This also stops a running session without a
  check-in. If tracking was paused, it stays paused; if research interventions were turned off,
  they stay off. The theme goes back to the default (Sunrise).
- **Turn research interventions off** (version 0.2.0 and later), on the My Data page or the
  Settings tab.

## No third parties

StudyLens contains no ads, analytics, or third-party trackers, and never sells or shares your data.

## Future optional features

Later versions may add **optional, off-by-default** features: study groups (members would see only
daily focus totals such as "focused 2h 15m", never sites) and research participation (anonymous
session summaries, never domains). None of these exist in version 0.3.0. Before any of them ships,
this policy will be updated, and the extension will ask for your explicit consent and show a
preview before anything leaves your device.

## Changes to this policy

Changes are published in this file, and its full history is visible in the public repository.

## Open source

The full source code is public at <https://github.com/haygens/studylens>, so anyone can check that
StudyLens does what this policy says.

## Contact

Questions or concerns: open an issue at <https://github.com/haygens/studylens/issues>.
