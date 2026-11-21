import { describe, expect, it } from 'vitest';
import { memoryStore } from '../storage/activity-store';
import { keysToDelete } from '../storage/keys';
import {
  THEMES_HINT_KEY,
  WELCOME_KEY,
  applyInstallPlan,
  dismissThemesHint,
  finishWelcome,
  loadOnboarding,
} from '../storage/onboarding-store';
import {
  PROGRESS_STEPS,
  compareVersions,
  helpersStepDone,
  installPlan,
  nextStep,
  previousStep,
  stepNumber,
} from './onboarding';

describe('compareVersions', () => {
  it('compares number by number', () => {
    expect(compareVersions('0.2.0', '0.3.0')).toBe(-1);
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0);
    expect(compareVersions('0.10.0', '0.3.0')).toBe(1);
    expect(compareVersions('0.3', '0.3.0')).toBe(0);
    expect(compareVersions('1.0.0', '0.99.9')).toBe(1);
  });
});

describe('installPlan', () => {
  it('opens the welcome page on a new install', () => {
    expect(installPlan('install')).toEqual({
      openWelcome: true,
      welcome: 'pending',
      themesHint: false,
    });
  });

  it('shows only the themes hint when updating from before 0.3.0', () => {
    for (const previous of ['0.1.0', '0.2.0', '0.2.9']) {
      expect(installPlan('update', previous)).toEqual({
        openWelcome: false,
        welcome: null,
        themesHint: true,
      });
    }
  });

  it('does nothing for later updates, browser updates or unknown reasons', () => {
    const nothing = { openWelcome: false, welcome: null, themesHint: false };
    expect(installPlan('update', '0.3.0')).toEqual(nothing);
    expect(installPlan('update', '0.3.1')).toEqual(nothing);
    expect(installPlan('update')).toEqual(nothing);
    expect(installPlan('browser_update')).toEqual(nothing);
    expect(installPlan('chrome_update')).toEqual(nothing);
  });
});

describe('welcome steps', () => {
  it('goes look → sites → helpers → done, and back', () => {
    expect(nextStep('look')).toBe('sites');
    expect(nextStep('sites')).toBe('helpers');
    expect(nextStep('helpers')).toBe('done');
    expect(nextStep('done')).toBe('done');
    expect(previousStep('helpers')).toBe('sites');
    expect(previousStep('look')).toBe('look');
  });

  it('numbers the three steps for the progress indicator', () => {
    expect(PROGRESS_STEPS.map((s) => s.label)).toEqual([
      'Pick your look',
      'Label a few sites',
      'How StudyLens helps',
    ]);
    expect(stepNumber('look')).toBe(1);
    expect(stepNumber('helpers')).toBe(3);
    expect(stepNumber('done')).toBe(3);
  });

  it('the helpers step needs an answer, like the popup notice', () => {
    expect(helpersStepDone({ enabled: true, seen: false, optedOut: false })).toBe(false);
    expect(helpersStepDone({ enabled: true, seen: true, optedOut: false })).toBe(true);
    expect(helpersStepDone({ enabled: true, seen: false, optedOut: true })).toBe(true);
    expect(helpersStepDone({ enabled: false, seen: false, optedOut: false })).toBe(true);
  });
});

describe('onboarding store', () => {
  it('starts empty', async () => {
    expect(await loadOnboarding(memoryStore())).toEqual({ welcome: null, themesHint: false });
  });

  it('remembers a new install until the welcome page is finished', async () => {
    const store = memoryStore();
    await applyInstallPlan(store, installPlan('install'));
    expect(store.data).toEqual({ [WELCOME_KEY]: 'pending' });
    expect((await loadOnboarding(store)).welcome).toBe('pending');
    await finishWelcome(store);
    expect((await loadOnboarding(store)).welcome).toBe('done');
  });

  it('shows the themes hint after an update until dismissed', async () => {
    const store = memoryStore({ 'interventions:notice-seen': true });
    await applyInstallPlan(store, installPlan('update', '0.2.0'));
    expect(store.data[THEMES_HINT_KEY]).toBe(true);
    expect(store.data[WELCOME_KEY]).toBeUndefined();
    expect((await loadOnboarding(store)).themesHint).toBe(true);
    await dismissThemesHint(store);
    expect((await loadOnboarding(store)).themesHint).toBe(false);
  });

  it('writes nothing when there is nothing to do', async () => {
    const store = memoryStore();
    await applyInstallPlan(store, installPlan('update', '0.3.0'));
    expect(store.data).toEqual({});
  });

  it('ignores nonsense in storage', async () => {
    const store = memoryStore({ [WELCOME_KEY]: 'maybe', [THEMES_HINT_KEY]: 'yes' });
    expect(await loadOnboarding(store)).toEqual({ welcome: null, themesHint: false });
  });

  it('"Delete everything" removes both keys', () => {
    expect(keysToDelete({ [WELCOME_KEY]: 'done', [THEMES_HINT_KEY]: true }).sort()).toEqual([
      THEMES_HINT_KEY,
      WELCOME_KEY,
    ]);
  });
});
