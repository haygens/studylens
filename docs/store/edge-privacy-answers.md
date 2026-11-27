# Microsoft Edge Add-ons — privacy answers (0.5.0)

Answers for the Privacy tab in Partner Center (Edge program → the product → Privacy) for version
0.5.0 (study groups P16 + passive groups P18). Partner Center's exact wording changes over time;
match each question to the closest answer below. **Submitted 2026-11-23** with the 0.5.0 update
(status: In review). This file now records what was actually submitted.

**Data usage boxes ticked in Partner Center (as submitted for 0.5.0):**

- **Personally identifiable information** — the optional display name for study groups.
- **Web history** — ticked as the **cautious disclosure**. StudyLens reads the active tab's domain
  and keeps it **only on the device**; no web history is ever transmitted. Partner Center's boxes
  ask what the extension collects or uses, not only what it sends, so ticking it is the safer
  reading and avoids a rejection for under-disclosure.
- **User activity** — focus minutes and "focusing now" (sent only after opt-in, per-group switches)
  and the on-device idle check. Ticked for the same cautious reason, even though no clicks,
  keystrokes or mouse data are recorded.

The single-purpose description mentions study groups, and the certification notes describe the
optional host permission (requested at runtime, never at install).

**0.6.0 (live group sessions P18b + room links P18c): no change to the Privacy tab.** It adds no
new kind of data: the same display name and focus activity (whether I'm focusing in a live
session, my minutes in it), plus an optional session goal the group sees (deleted from the server
24 h after the session). The room link shows only names and statuses to people the user gives it
to. Same three boxes, same single purpose, same privacy policy URL, same optional permissions.
Only the certification notes change (see `release-notes-0.6.0.md`).

**Privacy policy URL:** https://github.com/haygens/studylens/blob/main/PRIVACY.md

**Does the extension access, collect or transmit personal information?** **Yes, only if the user
opts in to study groups.** Without study groups (the default), nothing leaves the device.

| Question / data type                             | Answer                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information              | **Yes, optional:** the display name the user types when creating or joining a study group (may be a real name). Sent to the StudyLens server only after opt-in.                                                                                                                                                                                                                                                                   |
| Authentication information                       | A random device token the server issues (not a password; no account). Stored locally; the server keeps only its SHA-256 hash.                                                                                                                                                                                                                                                                                                     |
| Web history / browsing activity                  | **Ticked (cautious disclosure). Accessed locally, never transmitted.** Domain names of the active tab are stored only on the device.                                                                                                                                                                                                                                                                                              |
| User activity (clicks, keystrokes, mouse)        | **Ticked (cautious disclosure).** No clicks, keystrokes or mouse data. Only whether the user is idle (`idle` API), on the device, and the opt-in focus minutes below (time in StudyLens's own timer).                                                                                                                                                                                                                             |
| Website content                                  | **No.**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Location, health, financial, communications      | **No.**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Study group data (P18, opt-in, per-group switch) | **Yes, optional:** focus minutes per day (one number, last 7 days visible to the group; deleted from the server after 14 days) and whether a focus session is running now ("focusing now", expires 3 min after the last heartbeat), shared only with members of the user's groups. Switches are on by default after an in-app explanation with a live preview; turning one off deletes that data on the server. Never site names. |
| Sold or shared with third parties?               | **No.** Hosting: Vercel (server) and Turso (database), as processors. No ads, analytics or trackers.                                                                                                                                                                                                                                                                                                                              |
| Used for purposes unrelated to the core feature? | **No.**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Used for creditworthiness / lending?             | **No.**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| User controls                                    | Two switches per group ("Share my focus minutes", "Show when I'm focusing"); leave a group; "Delete my group data from the server"; "Delete everything" on My Data (also deletes the server copy). Revoking the permission stops all server contact.                                                                                                                                                                              |
