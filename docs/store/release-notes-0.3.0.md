# StudyLens 0.3.0 — release notes

For the AMO update (0.2.0 → 0.3.0) and the Edge Add-ons listing. Not uploaded yet.

## Short version (store "What's new" field)

A friendlier, more colorful StudyLens: pick one of three themes (Sunrise, Ocean, Pastel), get a
short welcome after installing, and see a clearer popup with a progress-ring timer, a "session
complete" moment, and hints that explain why a button can't be pressed yet. Nothing new is
collected and nothing is sent anywhere.

## Details

- **Themes:** Sunrise (default), Ocean and Pastel, chosen on the welcome page or the Settings tab.
  Every theme passes WCAG AA contrast; Study / Neutral / Distraction always have an icon and a
  label, and Distraction bars stay striped.
- **Welcome page** after a new install: pick a look, label a few common sites, and choose whether
  to keep the research helpers on. People updating from 0.2.0 just see a small "New: themes!" hint.
- **Popup:** one main button, a tracking status pill, a progress-ring timer, a short last-session
  line, and a Today bar with category icons and whole minutes.
- **Clearer buttons:** Start, Save and Continue always say why they're waiting.
- **Helper pages:** a countdown ring and a calmer layout.
- **My Data:** the focus sessions table is readable again (no headers split mid-word).
- **Accessibility:** visible keyboard focus everywhere, larger popup text, reduced motion respected.
- **Privacy:** unchanged. Themes use fonts already on your computer; nothing is downloaded or sent.
  The theme and welcome-page state are stored locally and removed by "Delete everything".
