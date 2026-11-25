# StudyLens research CSV — codebook

File: `studylens-research-YYYY-MM-DD.csv`, made by **My Data → Export for research (CSV)**
(StudyLens v0.4.0 and later). The file is only downloaded to the user's computer. StudyLens never
sends it anywhere.

> **No research data from other people is collected until IRB approval** (with Dr. Su). Until then
> this export is used only for hs's own N=1 pilot.

- One row per **finished** focus session, sorted by `session_number`. A session that is still
  running is not included.
- Header row first. Comma separated, UTF-8, lines end with CRLF.
- **Empty cell = missing / not applicable** (explained per column below).
- **Never in the file:** goal text, site names / domains, web addresses, page titles, what was
  typed on the intention page, exact times (the start is only the local date + hour), browser or
  device details.
- The source code that writes the file: `extension/src/my-data/research-csv.ts`
  (`RESEARCH_COLUMNS`). A unit test checks that this codebook lists exactly those columns, in order.

## Columns

| #   | Column                | Type    | Values                                                           | Meaning                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------- | ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `participant_id`      | text    | `p-` + 12 hex characters, e.g. `p-3fa29c01b7d4`                  | Random ID made on this device on first run (key `research:participant-id`). Not linked to any account, name, email or device detail. Same for every row of one device. "Delete everything" removes it; a new one is made afterwards (so the device then looks like a new participant).                                   |
| 2   | `session_number`      | integer | 1, 2, 3, …                                                       | Session order on this device (key `sessions:counter`, given when the session starts). Use as the **session order** predictor. Sessions from before v0.4.0 have no stored number; they get their position in the history, which is the same order (numbering after the update continues from there).                      |
| 3   | `mode`                | text    | `solo`, `group`                                                  | How the session was run. `group` = a live group focus session (from v0.6.0, P18b: started or joined with a study group, shared timer). **Group sessions are excluded from the main analysis.** Everything else is `solo`.                                                                                                |
| 4   | `condition`           | text    | `control`, `friction`, `intention`, `opted-out`, `group`, `none` | Research condition, randomized per session in shuffled blocks of three. `opted-out` = research interventions were turned off (excluded from analysis). `group` = a live group session (`mode = group`, never randomized, excluded). `none` = feature switched off or a v0.1 session (excluded).                          |
| 5   | `start_date`          | date    | `YYYY-MM-DD`                                                     | Local date the session started.                                                                                                                                                                                                                                                                                          |
| 6   | `start_hour`          | integer | 0–23                                                             | Local hour the session started (minutes and seconds are left out on purpose).                                                                                                                                                                                                                                            |
| 7   | `planned_minutes`     | number  | 5–180 (0.1 steps)                                                | Length the user chose. Group sessions: the time from joining to the group's shared end (shorter than the group's length when joining late).                                                                                                                                                                              |
| 8   | `actual_minutes`      | number  | ≥ 0 (0.1 steps)                                                  | Start to actual end. Smaller than planned when ended early.                                                                                                                                                                                                                                                              |
| 9   | `study_minutes`       | number  | ≥ 0 (0.1 steps)                                                  | Active-tab time on sites labeled Study during the session.                                                                                                                                                                                                                                                               |
| 10  | `neutral_minutes`     | number  | ≥ 0 (0.1 steps)                                                  | Active-tab time on Neutral or unlabeled sites.                                                                                                                                                                                                                                                                           |
| 11  | `distraction_minutes` | number  | ≥ 0 (0.1 steps)                                                  | Active-tab time on sites labeled Distraction. Time on the helper page itself is not counted (it is an extension page).                                                                                                                                                                                                   |
| 12  | `distraction_visits`  | integer | ≥ 0                                                              | Old measure (definition v2, see README "How measures are defined"): times the active site changed into a Distraction site from a different site. Interventions can lower it by sending the tab away, so it is **secondary**.                                                                                             |
| 13  | `attempts`            | integer | ≥ 0; empty before v0.4.0                                         | **Primary measure.** Distraction attempts: times the user entered a Distraction site at the trigger point where a helper page appears, logged the same way in **every** condition (control included). After an attempt that loaded the site (control, or Continue) that site has a 5-minute grace period in the session. |
| 14  | `continued`           | integer | ≥ 0; empty for control/opted-out/none                            | Friction/intention: times "Continue to <site>" was pressed.                                                                                                                                                                                                                                                              |
| 15  | `turned_back`         | integer | ≥ 0; empty for control/opted-out/none                            | Friction/intention: times "Back to studying" was pressed. `attempts − continued − turned_back` = pages closed without a choice.                                                                                                                                                                                          |
| 16  | `mean_dwell_seconds`  | number  | ≥ 0 (0.1 s); empty if no choice / control                        | Friction/intention: mean seconds the helper page was open before Continue or Back (from opening the page to the choice). Both helpers make Continue wait at least 10 s; Back works right away.                                                                                                                           |
| 17  | `focus_rating`        | integer | 1–5; empty if skipped / pending                                  | "How focused were you?" 1 = very distracted … 5 = fully focused.                                                                                                                                                                                                                                                         |
| 18  | `goal_completed`      | text    | `yes`, `partly`, `no`; empty if skipped / pending                | "Did you finish your goal?"                                                                                                                                                                                                                                                                                              |
| 19  | `checkin_status`      | text    | `answered`, `skipped`, `pending`                                 | Whether the end-of-session check-in was answered, skipped (Skip, 12 h timeout, or a new session started first), or not yet answered.                                                                                                                                                                                     |
| 20  | `ended_early`         | 0/1     | 0, 1                                                             | 1 = the user pressed "End early".                                                                                                                                                                                                                                                                                        |
| 21  | `label_set_version`   | integer | ≥ 1; empty before v0.4.0                                         | Version of the user's site labels when the session started (key `categories:version`, +1 on every label change). Sessions compared in one analysis should share a version.                                                                                                                                               |
| 22  | `labels_locked`       | 0/1     | 0, 1                                                             | 1 = study mode ("Lock my site labels") was on when the session started.                                                                                                                                                                                                                                                  |

## Analysis notes (see docs/PLAN.md "Research question details")

- Include: `mode = solo`, `condition` in control / friction / intention, and participants with at
  least **5 solo sessions per condition**.
- Mixed-effects models with participant as a random effect, condition as a fixed effect, and
  `session_number` as a predictor.
- Same trigger point: `attempts` is comparable across all three conditions; `continued`,
  `turned_back` and `mean_dwell_seconds` exist only for the two helper conditions.
- Equal time cost: friction and intention both need ≥ 10 s before Continue works (intention also
  needs 3+ typed characters, which are never stored).
- Sessions from before v0.4.0 have no `attempts` and no `label_set_version`; leave them out of the
  primary analysis.
- **Passive study groups (v0.5.0, P18) are not group sessions.** Being in a group where members
  see each other's daily focus minutes and "focusing now" does not change a session's `mode`: it
  stays `solo` and stays in the main analysis. Only live group sessions (P18b) are `group`.
- **Live group sessions (v0.6.0, P18b): `mode = group`, `condition = group`.** Started or joined
  together with a study group (shared timer, participants list). They are **excluded from the main
  intervention analysis** (filter `mode = solo`); the `mode` column stays in the CSV so they can be
  studied separately later (see PLAN.md "Solo vs group sessions").
  - **They do not use a block-randomization slot.** The shuffled block of three is only advanced
    by solo sessions, so the solo conditions stay balanced: after every 3 solo sessions that took
    part, each condition was used once, no matter how many group sessions happened in between.
  - No helper page (friction / intention) appears in them, and no distraction attempts are logged
    (`attempts` = 0, `continued` / `turned_back` / `mean_dwell_seconds` empty).
  - They still get the next `session_number` (it is the order of sessions on the device), so solo
    session numbers can have gaps where group sessions were.
  - The end-of-session check-in is asked the same way and stays local (never shared with the
    group).
- **Possible covariate, recorded but not exported yet:** from v0.5.0 every session stores a
  local-only flag `inGroup` (true/false: was this browser in at least one study group when the
  session started; missing before v0.5.0). It is **not a CSV column** yet. Seeing friends' focus
  totals could plausibly change behavior, so a later version may add it as a column (and the
  preregistration should say whether it is a covariate or an exclusion) — only after IRB approval
  and with the codebook updated first.
