# StudyLens 0.5.0 — release notes

For the AMO update (0.4.0 → 0.5.0) and the Edge Add-ons listing. Not uploaded yet.

## Short version (store "What's new" field)

Optional study groups: create a group or join a friend's with a code, and (if you leave the
switches on) see each other's focus minutes today, a 7-day strip, and who is focusing right now.
Never your sites. Off until you turn it on; solo use still sends nothing anywhere.

## Details

- **Study groups (optional):** Options → Study groups. A plain-language screen says what is
  shared and what never is; only "Join or create a group" asks the browser for permission to
  contact the StudyLens server. A display name and an 8-character join code — no email, no
  password, no account. Leave a group or delete all your group data from the server at any time.
- **Passive groups:** per group, "Share my focus minutes" (today's total and the last 7 days) and
  "Show when I'm focusing" (a badge while a session runs). Both on after the explanation, with a
  live preview of exactly what others see; a change takes effect at once, and turning one off
  deletes that data from the server. The popup can say "2 friends focusing now".
- **What is sent:** display name, group membership, one number per day (focus minutes inside your
  StudyLens sessions) and "focusing now" — only while you are in a group with a switch on.
  Never websites, labels, goals, check-in answers or research data. Focus minutes are deleted from
  the server after 14 days.
- **Research:** your sessions stay `solo`; group membership is only noted on your device.
- **Permissions:** one optional host permission (`studylens-flame.vercel.app`), asked at the
  click, never at install. Firefox: optional data collection `personallyIdentifyingInfo` (display
  name) and `technicalAndInteraction` (focus minutes, "focusing now"), asked in the same prompt.
  PRIVACY.md updated.
