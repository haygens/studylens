/**
 * Onboarding state (P13b), on this device only.
 *
 * Keys (from ./keys.ts):
 * - `onboarding:welcome`     — `pending` after a new install until the welcome page is finished,
 *                              then `done`.
 * - `onboarding:themes-hint` — `true` after updating from a version without themes, until the
 *                              popup's "New: themes!" hint is clicked or dismissed.
 * "Delete everything" removes both (nothing reopens; the hint just doesn't show).
 */
import type { InstallPlan, WelcomeStatus } from '../onboarding/onboarding';
import type { KeyValueStore } from './activity-store';
import { STORAGE_KEYS } from './keys';

export const WELCOME_KEY = STORAGE_KEYS.welcome;
export const THEMES_HINT_KEY = STORAGE_KEYS.themesHint;

export interface OnboardingState {
  welcome: WelcomeStatus | null;
  themesHint: boolean;
}

export async function loadOnboarding(store: KeyValueStore): Promise<OnboardingState> {
  const stored = await store.get([WELCOME_KEY, THEMES_HINT_KEY]);
  const welcome = stored[WELCOME_KEY];
  return {
    welcome: welcome === 'pending' || welcome === 'done' ? welcome : null,
    themesHint: stored[THEMES_HINT_KEY] === true,
  };
}

/** Saves what `installPlan` decided. Writes nothing when there's nothing to remember. */
export async function applyInstallPlan(store: KeyValueStore, plan: InstallPlan): Promise<void> {
  const items: Record<string, unknown> = {};
  if (plan.welcome) items[WELCOME_KEY] = plan.welcome;
  if (plan.themesHint) items[THEMES_HINT_KEY] = true;
  if (Object.keys(items).length > 0) await store.set(items);
}

export async function finishWelcome(store: KeyValueStore): Promise<void> {
  await store.set({ [WELCOME_KEY]: 'done' });
}

export async function dismissThemesHint(store: KeyValueStore): Promise<void> {
  await store.set({ [THEMES_HINT_KEY]: false });
}
