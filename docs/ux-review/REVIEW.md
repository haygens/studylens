# StudyLens UX review (v0.2.0) — 2026-11-20

The question for this review: what does a **first-time user** (a friend who just installed StudyLens)
find confusing, hard to read or unfriendly? This is a review only. No extension code changed. The
fixes are planned as **P13b: UI polish + onboarding (v0.3.0)** in `docs/PLAN.md`.

**How the screens were captured:** `extension/scripts/ux-review-shots.mjs`. It uses the E2E build in
installed Edge (headless), a throwaway profile in `M:\temp`, and local stub pages only. The popup is
shown at its real size (1x). The test-only "Test length in seconds" field is hidden in every
picture. To capture them again:

```powershell
npm run build:e2e -w extension
node extension/scripts/ux-review-shots.mjs
```

Severity: **high** = a first-time user gets stuck, misreads something important, or a WCAG AA
problem. **medium** = slows them down or looks unfinished. **low** = polish.

---

## Things that already work well

- Privacy is clear everywhere: "Your answers stay on this device" and "Nothing is sent anywhere".
  The "What StudyLens never collects" box on My Data is excellent.
- Text contrast passes AA. Muted grey `#57606a` is 6.4:1 on white, Study green 5.1:1, Distraction
  red 5.4:1, links 5.2:1. The tightest is Neutral grey `#6e7781` at 4.55:1, which only just passes.
- Category labels are always written out, so meaning never depends on color alone. Insights
  uses a striped Distraction bar.
- The check-in buttons use `aria-pressed`, the friction countdown has `role="timer"`, and the
  options tabs use `aria-current`.
- The friction and intention pages are simple and calm, and "Back to studying" is the main button.

## Problems that show up on many screens

| #   | Problem                                                                                                                                                                                                                                            | Severity | Fix                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **No welcome or first-run flow.** After install nothing opens. The popup shows a long research notice before the user knows what StudyLens does, and nobody explains that you have to label sites before Distraction or the helpers mean anything. | high     | Add a welcome page that opens once on install (`runtime.onInstalled`, reason `install`), with 3 short steps: (1) what StudyLens does + privacy, (2) pick a few Study/Distraction sites (suggestions as one-tap chips), (3) research helpers: Keep on / Turn off. Then the popup is ready. |
| G2  | **Unstyled default browser controls.** Grey system buttons, radio buttons and selects make it look like a prototype, and every button has the same weight.                                                                                         | medium   | Build a small set of shared styles (primary / secondary / quiet buttons, pills, chips, cards) used by the popup, options and helper pages. Pick one visual direction (see below).                                                                                                         |
| G3  | **Small text.** The popup uses 11–12 px for a lot of real content: the last-session summary, the check-in scale ends, the Today table, privacy notes.                                                                                              | medium   | Minimum 12 px for small print and 13–14 px for content. Popup body 14 px.                                                                                                                                                                                                                 |
| G4  | **Study is two different colors.** Study is green (`#1a7f37`) in the popup, Site categories and My Data, but blue (`#0969da`) in the Insights charts.                                                                                              | medium   | One set of category tokens used everywhere (color + icon + label). Add the icon to the chart legend.                                                                                                                                                                                      |
| G5  | **Weak focus outlines.** Keyboard focus uses the browser's default outline, which is thin and hard to see on the grey buttons. Custom buttons (check-in choices) need a clear focus style too.                                                     | medium   | A global `:focus-visible` style: 3 px outline in the primary color, 2 px offset.                                                                                                                                                                                                          |
| G6  | **No feedback link.** Friends testing it have no obvious way to report a problem or say what they think.                                                                                                                                           | medium   | A "Send feedback" link in the popup footer and on the options page. It should open a GitHub issue form or a mailto link; it must not send anything automatically.                                                                                                                         |
| G7  | **Plain wording varies.** The same feature is called "research interventions", "focus helpers", "helpers", "Control / Friction / Intention", and "comparison group".                                                                               | low      | Use one name in the UI: "focus helpers" (Quick pause, Question, No helper). Keep "condition" only on Insights and My Data, with the friendly name next to it.                                                                                                                             |

## Popup

### Fresh install (`screens/popup-01-fresh-install.png`) and research notice (`popup-02-research-notice.png`)

| Problem                                                                                                                                       | Severity | Fix                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The research notice is about 150 words of 12 px text, the first thing a new user sees. It reads like a consent form.                          | high     | Move the full explanation to the welcome page (G1). If the notice still has to appear in the popup, cut it to 2 lines + "Keep on / Turn off / Learn more".            |
| The Start button is grey and disabled. The reason is in small grey text under it ("First choose 'Keep on'…"), which is easy to miss.          | high     | With the welcome page the notice is answered before the popup opens. Otherwise: put the notice directly above Start, and give the hint an icon and normal text color. |
| "Pause tracking" is the first, most visible button, though it's the action a new user needs least. It looks like it might be needed to start. | medium   | Make tracking a small status pill in the header ("● Tracking on"), which opens Pause/Resume. "Start focusing" becomes the only primary button.                        |
| The empty Today section says "Now: (not tracking)" and "Nothing tracked today." The user can't tell whether something is wrong.               | medium   | Use a friendly empty state: "Browse as usual. Today's sites will show up here." plus a "Label your sites" button if nothing is labeled yet.                           |
| There's no logo or color, so the popup doesn't look like the StudyLens icon the user just clicked.                                            | low      | Add the magnifier logo to the header and use the brand blue for the main action.                                                                                      |

### Idle (`popup-03-idle.png`)

| Problem                                                                                                                                                                                                                         | Severity | Fix                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Start is disabled until a goal is typed, with no hint why.                                                                                                                                                                      | high     | Keep Start enabled. If the goal is empty, show "Write what you'll work on" next to the field and focus it.                      |
| "Last session" is one 12 px run-on line: "50 of 50 min · study 45 · neutral 3 · distraction 2 min · 1 distraction visit · Finished: yes · Focus 3/5".                                                                           | medium   | Show a small summary card: "✓ Last session: 50 min · goal done · focus 3/5". Full details are on My Data.                       |
| Minutes in Today are decimals (`0.2`, `0.1`) with no unit in the cells.                                                                                                                                                         | medium   | Whole minutes with a unit ("12 min"); under 1 minute show "<1 min". Add a stacked Study/Neutral/Distraction bar above the list. |
| Unlabeled sites show as "Neutral" (e.g. `google.com`). New users think they labeled it, or that StudyLens decided for them.                                                                                                     | medium   | Show unlabeled sites as "Unlabeled" (Neutral style, dashed chip) with a one-tap "Label" action.                                 |
| The duration radio buttons are small and close together.                                                                                                                                                                        | low      | Use segmented pills (25 min / 50 min / Custom), at least 32 px tall.                                                            |
| E2E build only: the last-session line showed "0 of 0.3333333333333333 min" for a 20-second test session. Real sessions always have whole planned minutes, but a real session ended in its first minute does show "0 of 25 min". | low      | Round the planned minutes in the display, and show "<1 min" for very short sessions.                                            |

### Running session (`popup-04-running.png`)

| Problem                                                                                                        | Severity | Fix                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| The big countdown is good, but there is no sense of progress, and nothing encourages the user.                 | medium   | Put the time inside a progress ring ("18:02 of 25 min") with a short friendly line ("Ends at 3:40 PM · keep going!"). |
| "End early" is a full-width button with the same weight as Start. It's the most visible thing after the timer. | medium   | Make it a quiet secondary button. Maybe ask "End now? Your progress is saved" to avoid ending by mistake.             |
| "Now: khanacademy.org (Study)" is a small grey line that's easy to miss, though it's useful feedback.          | low      | A "Now" row with the category chip (icon + label).                                                                    |
| The header doesn't change during a session.                                                                    | low      | Change the header status pill to "● In session" (blue).                                                               |

### Check-in (`popup-05-check-in.png`, `popup-05b-check-in-answered.png`)

| Problem                                                                                                               | Severity | Fix                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finishing a session gets no reward: "Session over. Your goal was …" in grey text.                                     | medium   | A celebration card: "Session complete! 🎉 You focused for 25 minutes", with short confetti (none when `prefers-reduced-motion` is set). Use real minutes. |
| Save is disabled until both questions are answered, again with no hint.                                               | medium   | Keep Save enabled, and point to the missing answer when pressed.                                                                                          |
| Selected choices are only light blue with a blue border, which is subtle in the screenshot. The 1–5 labels are 11 px. | medium   | Selected = solid fill + white text (+ a check icon for Yes/Partly/No). Scale-end labels at 12 px.                                                         |
| The Today table below the check-in pulls attention away from it.                                                      | low      | Collapse Today while a check-in is waiting.                                                                                                               |

### Paused (`popup-06-paused.png`)

| Problem                                                                                                                       | Severity | Fix                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| The yellow banner is clear. But during a running session it's confusing that the timer keeps going while nothing is recorded. | medium   | Add a small "Not recording" note to the timer card while paused. The status pill turns amber "❚❚ Paused". |
| Today still lists today's sites under "Tracking paused", so it looks like it's still tracking.                                | low      | Say "Paused. Showing what was recorded earlier today."                                                    |

### Keyboard (`popup-07-keyboard-focus.png`)

| Problem                                                                                                           | Severity | Fix                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| The goal field has autofocus (good), but focus after Tab is hard to see on radios and grey buttons (see G5).      | medium   | Global `:focus-visible` ring; check the tab order: goal → duration → Start. |
| "My Data" is a button styled like a link, so it looks like a link but doesn't act like one (it closes the popup). | low      | Fine to keep as a button. Give it an icon and a focus style.                |

## Helper pages (interstitial)

### Friction (`interstitial-01-friction-countdown.png`, `interstitial-02-friction-done.png`)

| Problem                                                                                                                  | Severity | Fix                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A big blue "7" with no context. The site name isn't highlighted. The page looks like an error page.                      | medium   | A countdown ring with the number inside, the site name in the Distraction color, a short calm line ("Take a breath. Still need this site?"). |
| Before the countdown ends, the Continue button doesn't exist; there's only grey text. When it appears, the layout jumps. | low      | Always show the button, disabled with "Continue to youtube.com in 7 s", so the layout stays still.                                           |
| The page uses Back = green, but green means "Study" elsewhere.                                                           | low      | Use the primary blue for "Back to studying"; keep green only for Study.                                                                      |

### Intention (`interstitial-03-intention-empty.png`, `interstitial-04-intention-typed.png`)

| Problem                                                                                            | Severity | Fix                                                                                  |
| -------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| "Continue" is disabled until 3 characters are typed, and nothing says so.                          | medium   | Add a hint under the field: "Type a few words to continue". When it's ready, say so. |
| The heading ("Before you open reddit.com") and the question are both bold and about the same size. | low      | Make the question the biggest text on the page; it's the whole point.                |
| Good: the privacy note right under the field ("never saves or sends it"). Keep it.                 | —        | —                                                                                    |

### Back to studying (`interstitial-05-back-to-studying.png`)

| Problem                                                                                          | Severity | Fix                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| Only appears when there's no earlier page to go back to. "You can close this tab" is a dead end. | low      | Add a small positive message ("Nice save! 👏") and a button to close the tab (`window.close()`). |

## Options page

### Site categories (`options-01-site-categories-empty.png`, `options-02-site-categories.png`)

| Problem                                                                                                                                                           | Severity | Fix                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The intro is a dense 3-line paragraph (subdomains, specificity rules, unlabeled = neutral).                                                                       | medium   | One line ("Tell StudyLens which sites help you study and which distract you"). Move the rules to a "How labels work" details box. |
| On a fresh install, "Sites you visited recently" says "Nothing unlabeled. 🎉", which celebrates nothing.                                                          | medium   | When there is no activity yet: "Browse for a bit and the sites you visit will show up here to label."                             |
| Suggestions (the fastest way to get started) are at the bottom, below the fold.                                                                                   | medium   | When nothing is labeled, show Suggestions first, as chips grouped "Usually distracting" / "Usually study", with "Add all".        |
| Each label row has a category dropdown **and** Edit **and** Remove. Edit (rename the domain) is rarely needed, and it looks like the dropdown needs Edit to work. | low      | Keep the dropdown (or 3 colored segment buttons) and a trash icon. Put "Edit domain" in a small menu.                             |
| The "Add" category select defaults to Distraction with no visual cue.                                                                                             | low      | Use three segment buttons next to the field (Study / Neutral / Distraction), each with its icon.                                  |
| "google.com · 0 min" shows zero minutes for a site that was visited.                                                                                              | low      | Show "<1 min".                                                                                                                    |

### Insights (`options-03-insights-empty.png`, `options-04-insights-sample.png`)

Note: the sample history in the capture has sessions but not matching activity, which is why the
study/distraction chart is empty except for today. That's the test data, not a bug.

| Problem                                                                                                                   | Severity | Fix                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| The empty state is three cards of grey "No … yet" text and a table of "Not enough data yet". It feels like a broken page. | medium   | One friendly empty card: "Your insights appear after your first few sessions" with progress ("1 of 3 sessions") and a "Start a session" hint.     |
| The 14-day charts are tall (two 14-row lists); the most interesting part (Focus helpers compared) is far down.            | medium   | A short summary row at the top ("This week: 4 h focused · best time: morning · 3/4 goals done"), then the charts, maybe as compact vertical bars. |
| Study is blue here, green everywhere else (G4).                                                                           | medium   | Shared category colors.                                                                                                                           |
| The helpers table wraps in narrow columns ("Control (no helper)", "Yes 25% · Partly 50% · No 25%").                       | low      | Give each condition a colored, icon-labeled card instead of a table, or widen the page to 880 px for Insights.                                    |

### Settings (`options-05-settings.png`)

| Problem                                                                                                           | Severity | Fix                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plain checkboxes for the two most important settings. The research text is long and repeats the popup notice.     | medium   | Toggle switches with a one-line description each. The helper explanation goes in a collapsible "How the helpers work" with a small card per helper. |
| Missing settings a new user might look for: default session length, feedback link, "show the welcome tour again". | low      | Add these in P13b (only the feedback link and welcome-again are needed for friends).                                                                |

### My Data (`options-06-my-data.png`)

| Problem                                                                                                                                                                                                        | Severity | Fix                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The Focus sessions table is broken at 720 px:** 10 columns, headers split mid-word ("Pla / nn / ed", "Distra / ction"), "50 mi / n". It's the main proof of "you can see everything", and it's hard to read. | high     | Let the table scroll sideways inside its card (`overflow-x: auto`) with `white-space: nowrap` headers, or show each session as a compact row card. Shorter cells: "45 / 3 / 2 min", "Friction", "✓ · 4/5". |
| The page is very long; Tracking and Research cards repeat the Settings tab.                                                                                                                                    | medium   | Keep My Data about data: summary counts at the top ("8 activity records · 12 sessions · 4 labels") with Export and Delete; link to Settings instead of repeating the cards.                                |
| Small grey text (13 px) for long explanations.                                                                                                                                                                 | low      | 14 px body text, short paragraphs.                                                                                                                                                                         |
| Good: the red "Delete everything" card with "Type DELETE" is clear and safe. Keep it.                                                                                                                          | —        | —                                                                                                                                                                                                          |

---

## Visual directions

All three are built around the icon blue (`#2f5bd3`) and pass WCAG AA: every text color was checked
at 4.5:1 or better against each background it sits on (category and helper chips included). Meaning
never depends on color alone: Study has a book icon, Neutral a dot, Distraction a lightning bolt, and
the Distraction bar segment stays striped like the P11 charts. The three helpers get their own colors
for Insights and My Data: Control = slate, Quick pause (friction) = amber, Question (intention) =
violet. Session states: tracking = green pill, in session = blue, paused = amber, session complete =
a warm celebration card. **No web fonts are loaded** (that would contact a font server), only system
fonts.

### 1. Sunrise — `mockup-sunrise.html`

- **Mood:** upbeat and optimistic, a fresh start to a study day.
- **Palette:** primary `#2f5bd3` (icon blue) · coral accent `#e0582e` (decoration only; coral text
  `#c2410c`) · sunshine `#ffc145` · ink `#1e1b3a` · muted `#5b5675` · tints `#fff7ed` (peach),
  `#fdf2f8` (pink), `#eef2ff` (blue) · Study `#0e7a55` on `#e3f7ee` · Neutral `#5f6378` on
  `#eef0f5` · Distraction `#c0264b` on `#fde8ee` · Friction `#a14a06` · Intention `#6d3fd1`.
- **Type scale:** system UI. 12 / 14 / 16 / 20 / 26 px, timer 40 px. Weights 400 / 600 / 750.
- **Shape:** cards 16 px radius, controls 12 px, pills fully round. 4-pt spacing (4, 8, 12, 16, 24).
  Soft warm shadows.
- **Popup:** peach glow at the top fading to white, a blue gradient "Start focusing" button,
  colored chips in Today.
- **Friction/intention:** the whole page is a sunrise gradient (peach → pink) with a soft sun at the
  bottom. Amber countdown ring.

### 2. Ocean — `mockup-ocean.html`

- **Mood:** calm and steady, for long deep-focus sessions. The most "grown-up" of the three.
- **Palette:** primary `#2f5bd3` · teal `#0f766e` · seafoam `#7dd3c8` · sand `#f4b860` · ink (navy)
  `#0f1b3d` · muted `#4a5878` · tints `#f0f7ff`, `#e8faf7` · Study `#0f766e` on `#dcf7f2` · Neutral
  `#5a6478` on `#eef2f7` · Distraction `#b9461a` (burnt orange) on `#fdeee5` · Friction `#9a5b00` ·
  Intention `#5b3fc4`.
- **Type scale:** Segoe UI Variable (on Windows), else system UI. 12 / 14 / 15 / 18 / 24 px, timer
  38 px.
- **Shape:** cards 12 px radius, controls 8 px. 8-pt spacing (8, 16, 24). Thin borders, almost no
  shadow.
- **Popup:** navy header band with a white logo tile and a status pill; flat white cards; teal timer
  ring.
- **Friction/intention:** pale blue → seafoam page with a gentle wave at the bottom. Sand countdown
  ring ("wait", not "alarm").
- Teal Study vs orange Distraction is the safest pair for red-green colorblindness of the three.

### 3. Playful pastel — `mockup-pastel.html`

- **Mood:** playful and cozy, like a sticker-covered notebook. The most "fun for students".
- **Palette:** primary `#3557d6` · bubblegum `#d6336c` (text `#b8246b`) · tints lilac `#f6f3ff`,
  butter `#fffbea`, mint `#effcf6` · ink (plum) `#2a2140` · muted `#5f5878` · Study `#237a3b` on
  `#e4f8e9` · Neutral `#5e6472` on `#f0f1f5` · Distraction `#c0262e` on `#ffe8ea` · Friction
  `#8f5a00` · Intention `#6741d9`.
- **Type scale:** a rounded system font when there is one (`ui-rounded`; Nunito if installed), else
  Segoe UI. 12 / 15 / 17 / 20 / 28 px, timer 42 px.
- **Shape:** cards 22 px radius, controls 14 px. 2 px plum outlines and hard offset "sticker"
  shadows. Logo tile slightly tilted.
- **Popup:** butter-yellow background, outlined white cards, outlined chips (they read even in
  grayscale).
- **Friction/intention:** lilac page with pastel blobs in the corners and a slightly tilted card.
  Lemon countdown ring.
- **Risk:** strong outlines get busy on dense pages (My Data tables); use 1 px outlines there.

**Recommendation:** **Sunrise**, with Ocean's Distraction orange if colorblind testing shows that
red and green are hard to tell apart. It is the most inviting while still clean, the warm accents
make "session complete" feel like a reward, and it works on the dense options pages without
changing much. Pastel is the most fun but the hardest to keep tidy on Insights and My Data.

---

## Prioritized list

### Must fix before friends use it (P13b core)

1. **Welcome page on first install** (G1): what it does, privacy in one line, pick a few sites,
   answer the helpers question. Replaces the long popup notice.
2. **Pick a visual direction and apply shared styles** (G2): primary/secondary buttons, chips with
   icons, cards, one set of category colors (fixes Study blue vs green, G4).
3. **Never-silent disabled buttons:** Start, Save (check-in) and Continue (intention) explain what's
   missing.
4. **Popup hierarchy:** "Start focusing" is the only primary button; Pause becomes a status pill;
   Last session becomes a short summary; Today shows whole minutes + a stacked bar.
5. **My Data sessions table readable** (no mid-word header breaks; scroll sideways or row cards).
6. **Friendly empty states:** popup Today, Site categories "recent", Insights.
7. **Visible keyboard focus** (G5) and a 12 px minimum text size (G3).
8. **Feedback link** in the popup and options (G6), opening a page; nothing sent automatically.

### Nice to have

- Session-complete celebration (confetti, respects reduced motion) and a progress ring timer.
- Friction countdown ring; Continue button always shown (disabled with the seconds left).
- "Unlabeled" instead of silent "Neutral" in Today, with one-tap labeling.
- Suggestions first on an empty Site categories page, as chips.
- Insights summary row and helper cards instead of a wide table.
- Settings toggles instead of checkboxes; shorter research text with "How the helpers work".
- My Data: summary counts at the top, stop repeating the Settings cards.
- One name for the helpers in the UI (G7).
- "Nice save!" on the Back-to-studying page with a close-tab button.
- Dark mode (all three palettes need a dark variant; not designed yet).
