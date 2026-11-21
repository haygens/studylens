/**
 * Onboarding (P13b): what happens on install and on update, and the popup's small hints.
 * Pure rules, no browser APIs (the background and pages call these with stored values).
 *
 * - New install: open the welcome page once (3 steps: look, sites, helpers). Until it is
 *   finished the popup offers "Finish setting up".
 * - Update from a version before 0.3.0: no welcome page, only a small "New: themes!" hint in the
 *   popup that links to Settings. It disappears once clicked or dismissed.
 */

export const WELCOME_STEPS = ['look', 'sites', 'helpers', 'done'] as const;
export type WelcomeStep = (typeof WELCOME_STEPS)[number];

/** The steps shown in the progress indicator (the last screen is the "all set" page). */
export const PROGRESS_STEPS: { step: Exclude<WelcomeStep, 'done'>; label: string }[] = [
  { step: 'look', label: 'Pick your look' },
  { step: 'sites', label: 'Label a few sites' },
  { step: 'helpers', label: 'How StudyLens helps' },
];

export type WelcomeStatus = 'pending' | 'done';

/** The version that introduced themes: users updating from anything older get the hint. */
export const THEMES_VERSION = '0.3.0';

/** -1, 0 or 1, comparing dotted versions like `0.2.0` and `0.10.1` number by number. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface InstallPlan {
  openWelcome: boolean;
  welcome: WelcomeStatus | null;
  themesHint: boolean;
}

const NOTHING: InstallPlan = { openWelcome: false, welcome: null, themesHint: false };

/** What to do for `runtime.onInstalled`. */
export function installPlan(reason: string, previousVersion?: string): InstallPlan {
  if (reason === 'install') return { openWelcome: true, welcome: 'pending', themesHint: false };
  if (
    reason === 'update' &&
    previousVersion !== undefined &&
    compareVersions(previousVersion, THEMES_VERSION) < 0
  ) {
    return { ...NOTHING, themesHint: true };
  }
  return NOTHING;
}

/** The step after `step` (the welcome page's Next button). */
export function nextStep(step: WelcomeStep): WelcomeStep {
  const i = WELCOME_STEPS.indexOf(step);
  return WELCOME_STEPS[Math.min(i + 1, WELCOME_STEPS.length - 1)]!;
}

export function previousStep(step: WelcomeStep): WelcomeStep {
  const i = WELCOME_STEPS.indexOf(step);
  return WELCOME_STEPS[Math.max(i - 1, 0)]!;
}

/** 1-based position for "Step 2 of 3"; the "all set" page counts as finished (3 of 3). */
export function stepNumber(step: WelcomeStep): number {
  return Math.min(WELCOME_STEPS.indexOf(step) + 1, PROGRESS_STEPS.length);
}

/**
 * Whether the helpers step can be left: the research question must be answered first (same rule
 * as the popup notice), unless the feature is switched off in this browser.
 */
export function helpersStepDone(state: {
  enabled: boolean;
  seen: boolean;
  optedOut: boolean;
}): boolean {
  return !state.enabled || state.seen || state.optedOut;
}
