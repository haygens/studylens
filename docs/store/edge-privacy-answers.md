# Microsoft Edge Add-ons — privacy answers (draft for 0.5.0)

Draft answers for the privacy questions in Partner Center (Edge program → the product →
Properties / Privacy). Partner Center's exact wording changes over time; match each question to the
closest answer below. Not submitted yet: 0.5.0 ships with P16 + P18.

**Privacy policy URL:** https://github.com/haygens/studylens/blob/main/PRIVACY.md

**Does the extension access, collect or transmit personal information?** **Yes, only if the user
opts in to study groups.** Without study groups (the default), nothing leaves the device.

| Question / data type                             | Answer                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information              | **Yes, optional:** the display name the user types when creating or joining a study group (may be a real name). Sent to the StudyLens server only after opt-in.         |
| Authentication information                       | A random device token the server issues (not a password; no account). Stored locally; the server keeps only its SHA-256 hash.                                           |
| Web history / browsing activity                  | **Accessed locally, never transmitted.** Domain names of the active tab are stored only on the device.                                                                  |
| User activity (clicks, keystrokes, mouse)        | **No.** Only whether the user is idle (`idle` API), on the device.                                                                                                      |
| Website content                                  | **No.**                                                                                                                                                                 |
| Location, health, financial, communications      | **No.**                                                                                                                                                                 |
| Study group data (from P18, also opt-in)         | Daily focus total (minutes) and whether a focus session is running, shared with members of the user's groups. Never site names.                                         |
| Sold or shared with third parties?               | **No.** Hosting: Vercel (server) and Turso (database), as processors. No ads, analytics or trackers.                                                                    |
| Used for purposes unrelated to the core feature? | **No.**                                                                                                                                                                 |
| Used for creditworthiness / lending?             | **No.**                                                                                                                                                                 |
| User controls                                    | Leave a group; "Delete my group data from the server"; "Delete everything" on My Data (also deletes the server copy). Revoking the permission stops all server contact. |
