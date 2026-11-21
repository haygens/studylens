# StudyLens 0.4.0 — release notes

For the AMO update (0.3.0 → 0.4.0) and the Edge Add-ons listing. Not uploaded yet.

## Short version (store "What's new" field)

Better research measurements, all stored only on your device: StudyLens now notes each time you
open a Distraction site during a session (in every condition), both helper pages take the same
10 seconds, sessions are numbered, and a new "study mode" can lock your site labels. My Data can
export a numbers-only CSV (no goal text, no sites). Nothing is sent anywhere.

## Details

- **Distraction attempts:** logged at the same moment in every condition (control too), with what
  happened next (site loaded / Continue / Back to studying) and how long the helper page was open.
  Domain names only, removed after 30 days; the old "distraction visits" count is kept.
- **Equal time cost:** the intention question's Continue button now needs 3+ characters **and**
  10 seconds (the same as the friction countdown). A small hint shows the seconds left.
- **Session numbers and mode:** every session gets its number on this device and the mode `solo`.
- **Study mode:** Settings → "Lock my site labels (study mode)". While on, labels can't be edited;
  on/off times and a label version number are kept with the sessions.
- **Export for research (CSV):** on My Data. One row per session, numbers only, with a random
  participant ID made on your device. Documented in `docs/research/codebook.md`. Download only.
- **Privacy:** no new permissions, no network requests, `data_collection_permissions` unchanged
  (`none`). PRIVACY.md updated.
