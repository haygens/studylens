# StudyLens Privacy Policy

_Effective: November 21, 2026 · Applies to StudyLens version 0.4.0 for Firefox and Microsoft Edge (and
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
- **From version 0.4.0 (research measurements):** for each focus session, its number on this
  device (1, 2, 3, … — the order of your sessions), its mode (`solo`; `group` is for a possible
  later version), the version number of your site labels when it started and whether they were
  locked, and its **distraction attempts**: each time you open a site you labeled Distraction
  during a session (in every condition, including control), the site's domain name, the time,
  the condition, what happened next (the site loaded / "Continue" / "Back to studying"), and for
  the helper pages how many seconds the page was open. Also: your **study mode** setting ("Lock my
  site labels") with the times you turned it on or off, a counter that goes up each time your
  site labels change, and a **random participant ID** made on this device (see "Research CSV
  export" below). No new browser permissions.
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
  once you type at least 3 characters **and** 10 seconds have passed (from version 0.4.0, the same
  wait as friction, so both helpers take the same time). **StudyLens never stores what you type:** your answer exists
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
(`browser.storage.local`). StudyLens version 0.4.0 has no server, no account, and makes no network
requests: nothing is uploaded, synced, or shared, and the developer cannot see your data. The
themes use only fonts already on your computer; no web fonts or other files are downloaded.

## Research CSV export (version 0.4.0 and later)

The My Data page has an **"Export for research (CSV)"** button. It downloads a spreadsheet file to
your computer with one row per finished focus session: a random participant ID, the session
number, mode and condition, the start **date and hour only**, planned and actual minutes, minutes
per category, distraction visits and attempts, how often you pressed "Continue" or "Back to
studying", the average seconds on the helper page, your check-in answers, and the label version.
**It contains no goal text, no site names, and no web addresses.** StudyLens only saves the file
on your computer; it never sends it anywhere. Every column is explained in
[docs/research/codebook.md](docs/research/codebook.md).

The participant ID is random (for example `p-3fa29c01b7d4`), made on your device the first time
StudyLens runs, and not linked to your name, email, account, or device. "Delete everything" removes
it, and a new one is made afterwards.

**No research data from other people is collected.** Until the study has ethics (IRB) approval,
StudyLens has no way to upload research data, and nobody is asked to send their CSV.

## Feedback link

From version 0.3.0, the popup footer and the Settings tab show a **"Send feedback"** link. It
opens an **anonymous Microsoft Form** in a new tab. StudyLens itself sends nothing: it doesn't
pass your data, settings, or any web address to the form, and fills nothing in for you. The form
is a separate Microsoft service with its own privacy terms (Microsoft's privacy statement). It
doesn't ask for your name or email, and it only receives what you choose to type there. Using it
is entirely optional.

## Retention

- **Automatic cleanup (on from version 0.2.0):** once a day, detailed activity records (domain,
  start and end time) older than 30 days are combined into **weekly totals**: the time per site
  (domain) and label for each week, Monday to Sunday. The detailed records for those days are then
  deleted. The weekly totals show on the My Data page and are included in the export.
- **Focus sessions** are kept, because the Insights tab and the research results need them. After
  30 days, only the session's goal text is deleted. What stays is numbers only: start and end
  time, planned length, minutes per category, number of distraction visits, condition, check-in
  answers, and the friction/intention counts (how often each helper page was shown, and how often
  you continued or went back to studying), the session number, mode and label version, and the
  distraction attempts **without their site names** (from version 0.4.0, the domain name in each
  attempt is removed after 30 days). None of these contain site names or text you typed.
- Everything else (weekly totals, sessions, labels, settings) stays on your device until you
  delete it on the My Data page, or uninstall the extension (which removes its storage).

## Your controls

- **Pause tracking** at any time, from the popup or the My Data page. While paused, no site
  activity is recorded; a running focus session keeps its timer.
- The **My Data** page (linked from the popup) shows exactly what is stored, in plain tables.
- **Export** everything as one JSON file.
- **Delete everything** (you type DELETE to confirm). This also stops a running session without a
  check-in. If tracking was paused, it stays paused; if research interventions were turned off,
  they stay off. The theme goes back to the default (Sunrise). Study mode is turned off, session
  numbering starts again at 1, and the participant ID is replaced by a new random one.
- **Turn research interventions off** (version 0.2.0 and later), on the My Data page or the
  Settings tab.
- **Export for research (CSV)** (version 0.4.0 and later): numbers only, downloaded to your
  computer (see above).
- **Lock my site labels (study mode)** (version 0.4.0 and later), on the Settings tab: while it is
  on, site labels can't be changed. You can turn it off at any time.

## No third parties

StudyLens contains no ads, analytics, or third-party trackers, and never sells or shares your data.

## Future optional features

Later versions may add **optional, off-by-default study groups**: you would join with a group code
and a display name you choose (no email or account), and members would see only daily focus totals
such as "focused 2h 15m" and who is in a session right now, never sites. StudyLens would ask the
browser for permission to contact its server only when you first join or create a group. Research
uploads would come only after ethics (IRB) approval. None of these exist in version 0.4.0. Before
any of them ships, this policy will be updated, and the extension will ask for your explicit
consent and show a preview before anything leaves your device.

## Changes to this policy

Changes are published in this file, and its full history is visible in the public repository.

## Open source

The full source code is public at <https://github.com/haygens/studylens>, so anyone can check that
StudyLens does what this policy says.

## Contact

Questions or concerns: open an issue at <https://github.com/haygens/studylens/issues>.
