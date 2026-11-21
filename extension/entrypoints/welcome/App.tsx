/**
 * Welcome page (P13b). Opens once in a tab after a new install (see background.ts). Three short
 * steps with a progress indicator: pick a theme, label a few sites, and answer the research
 * helpers question (Keep on / Turn off). It replaces the popup's research notice for new users,
 * and the same rule applies: no session can start until that question is answered.
 * Closing the page early is fine: the theme stays Sunrise, and the popup offers to finish setup.
 */
import { useEffect, useRef, useState } from 'react';
import { SITE_CATEGORIES, type SiteCategory } from '@studylens/shared';
import { localStore } from '@/src/background/browser-adapter';
import { CATEGORY_LABELS } from '@/src/categories/display';
import { removeRule, upsertRule, type CategoryRule } from '@/src/categories/rules';
import { SUGGESTED_RULES } from '@/src/categories/suggestions';
import {
  PROGRESS_STEPS,
  helpersStepDone,
  nextStep,
  previousStep,
  stepNumber,
  type WelcomeStep,
} from '@/src/onboarding/onboarding';
import { loadRules, saveRules } from '@/src/storage/categories-store';
import { finishWelcome } from '@/src/storage/onboarding-store';
import { CATEGORY_ICONS } from '@/src/ui/CategoryChip';
import { CheckIcon, InfoIcon, ShieldIcon, SparkleIcon } from '@/src/ui/icons';
import ThemePicker from '@/src/ui/ThemePicker';
import { useInterventions } from '@/src/ui/use-interventions';
import { FRICTION_COUNTDOWN_SECONDS } from '@/src/interventions/interstitial';

function Progress({ step }: { step: WelcomeStep }) {
  const current = stepNumber(step);
  return (
    <nav aria-label="Setup progress" className="sl-progress">
      <p className="sl-muted sl-small" style={{ margin: '0 0 6px' }}>
        {step === 'done' ? 'All 3 steps done' : `Step ${current} of ${PROGRESS_STEPS.length}`}
      </p>
      <ol>
        {PROGRESS_STEPS.map((s, i) => {
          const n = i + 1;
          const done = step === 'done' || n < current;
          const here = step !== 'done' && n === current;
          return (
            <li
              key={s.step}
              aria-current={here ? 'step' : undefined}
              data-state={done ? 'done' : here ? 'current' : 'todo'}
            >
              <span className="sl-progress-dot" aria-hidden="true">
                {done ? <CheckIcon /> : n}
              </span>
              <span>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SitesStep() {
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  useEffect(() => {
    void loadRules(localStore).then(setRules, () => setRules([]));
  }, []);
  if (!rules) return <p className="sl-muted">Loading…</p>;

  const labelOf = (domain: string) => rules.find((r) => r.domain === domain)?.category ?? null;
  const pick = (domain: string, category: SiteCategory) => {
    const next =
      labelOf(domain) === category
        ? removeRule(rules, domain)
        : upsertRule(rules, { domain, category });
    setRules(next);
    void saveRules(localStore, next);
  };

  return (
    <ul className="sl-quick-list">
      {SUGGESTED_RULES.map(({ domain }) => {
        const current = labelOf(domain);
        return (
          <li key={domain}>
            <span className="sl-site-name">{domain}</span>
            <span className="sl-row" role="group" aria-label={`Label for ${domain}`}>
              {SITE_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICONS[c];
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={current === c}
                    className={`sl-pick sl-quick sl-quick-${c}`}
                    onClick={() => pick(domain, c)}
                  >
                    <Icon />
                    {CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function HelpersStep() {
  const { state, answerNotice, setParticipating, saveError } = useInterventions();
  if (state.status === 'loading') return <p className="sl-muted">Loading…</p>;
  if (state.status === 'error') return <p className="sl-error">{state.message}</p>;
  const s = state.data;
  const answered = s.seen || s.optedOut;
  const on = answered && !s.optedOut;

  return (
    <div className="sl-stack">
      <p style={{ margin: 0 }}>
        StudyLens is a small research project on what helps students focus. When it’s on, each
        session may get one helper at random before sites you labeled Distraction: a{' '}
        {FRICTION_COUNTDOWN_SECONDS}-second pause, or the question “What did you come here for?”.
        StudyLens never saves what you type, and nothing leaves this device.
      </p>
      {!s.enabled ? (
        <p className="sl-hint">
          <InfoIcon />
          Research helpers are switched off in this browser, so there’s nothing to choose.
        </p>
      ) : (
        <div className="sl-row" role="group" aria-label="Research helpers">
          <button
            type="button"
            className="sl-pick"
            aria-pressed={on}
            onClick={() => (answered ? setParticipating(true) : answerNotice(true))}
          >
            Keep on
          </button>
          <button
            type="button"
            className="sl-pick"
            aria-pressed={answered && !on}
            onClick={() => (answered ? setParticipating(false) : answerNotice(false))}
          >
            Turn off
          </button>
        </div>
      )}
      {answered && s.enabled && (
        <p className="sl-hint" role="status">
          <CheckIcon />
          {on
            ? 'Helpers are on. You can change this anytime on the Settings tab.'
            : 'Helpers are off. You can turn them on anytime on the Settings tab.'}
        </p>
      )}
      {saveError && <p className="sl-error">{saveError}</p>}
    </div>
  );
}

/** A drawing of the browser toolbar with the StudyLens button highlighted. */
function ToolbarPicture() {
  return (
    <figure className="sl-toolbar-pic">
      <div className="sl-toolbar" aria-hidden="true">
        <span className="sl-toolbar-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="sl-toolbar-url">your-class-site.edu</span>
        <span className="sl-toolbar-icon sl-toolbar-puzzle">🧩</span>
        <span className="sl-toolbar-icon sl-toolbar-ours">
          <img src="/icon/32.png" alt="" width={20} height={20} />
        </span>
      </div>
      <div className="sl-toolbar-arrow" aria-hidden="true">
        ▲ Click the StudyLens button
      </div>
      <figcaption className="sl-muted sl-small">
        The StudyLens button is at the top right of your browser, next to the address bar. Don’t see
        it? Click the Extensions button (the puzzle piece) and pin StudyLens.
      </figcaption>
    </figure>
  );
}

const TITLES: Record<WelcomeStep, string> = {
  look: 'Pick your look',
  sites: 'Label a few sites',
  helpers: 'How StudyLens helps',
  done: 'You’re all set!',
};

export default function App() {
  const [step, setStep] = useState<WelcomeStep>('look');
  const heading = useRef<HTMLHeadingElement>(null);
  const { state: helpers } = useInterventions();
  const helpersDone = helpers.status === 'ready' && helpersStepDone(helpers.data);

  useEffect(() => {
    document.title = `Welcome to StudyLens — ${TITLES[step]}`;
  }, [step]);

  const go = (next: WelcomeStep) => {
    setStep(next);
    if (next === 'done') void finishWelcome(localStore);
    // Move focus to the new step's heading, so keyboard and screen reader users follow along.
    requestAnimationFrame(() => heading.current?.focus());
  };

  const blocked = step === 'helpers' && !helpersDone;

  return (
    <div className="sl-welcome">
      <header className="sl-welcome-head">
        <img src="/icon/48.png" alt="" width={44} height={44} className="sl-logo" />
        <div>
          <p className="sl-muted" style={{ margin: 0, fontWeight: 600 }}>
            Welcome to
          </p>
          <p className="sl-welcome-brand">StudyLens</p>
        </div>
      </header>
      <p className="sl-welcome-lead">
        Focus sessions for students, plus a picture of where your study time goes.{' '}
        <span className="sl-row" style={{ display: 'inline-flex', gap: 4 }}>
          <ShieldIcon /> Your data stays on this device.
        </span>
      </p>

      <Progress step={step} />

      <main className="sl-card sl-welcome-card sl-pop-in" key={step}>
        <h1 ref={heading} tabIndex={-1} className="sl-welcome-title">
          {step === 'done' && <SparkleIcon />} {TITLES[step]}
        </h1>

        {step === 'look' && (
          <>
            <p className="sl-muted">Choose a theme. You can change it anytime on Settings.</p>
            <ThemePicker />
          </>
        )}
        {step === 'sites' && (
          <>
            <p className="sl-muted">
              Tap a label for the sites you use. Helpers only show up on Distraction sites. You can
              change labels anytime, or skip this for now.
            </p>
            <SitesStep />
          </>
        )}
        {step === 'helpers' && <HelpersStep />}
        {step === 'done' && (
          <>
            <p>Start your first focus session from the StudyLens button in your toolbar.</p>
            <ToolbarPicture />
          </>
        )}

        {step !== 'done' && (
          <div className="sl-welcome-nav">
            {step !== 'look' && (
              <button type="button" className="sl-btn-quiet" onClick={() => go(previousStep(step))}>
                Back
              </button>
            )}
            <span style={{ flex: 1 }} />
            {step === 'sites' && (
              <button type="button" className="sl-btn-quiet" onClick={() => go('helpers')}>
                Skip
              </button>
            )}
            <button
              type="button"
              className="sl-btn-primary"
              disabled={blocked}
              aria-describedby={blocked ? 'sl-welcome-why' : undefined}
              onClick={() => go(nextStep(step))}
            >
              {step === 'helpers' ? 'Finish' : 'Next'}
            </button>
          </div>
        )}
        {blocked && (
          <p id="sl-welcome-why" role="note" className="sl-hint" style={{ justifyContent: 'end' }}>
            <InfoIcon />
            Choose “Keep on” or “Turn off” to finish.
          </p>
        )}
      </main>
    </div>
  );
}
