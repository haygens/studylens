# Power simulation for H1 (attempts per hour)

> **DRAFT – not registered; pending advisor and IRB review.**
>
> **Status (2026-11-25): results pending.** R isn't installed on the development PC, and per the
> project rule nothing was installed. The simulation runs in GitHub Actions instead (workflow
> **Analysis (R)**, `.github/workflows/analysis.yml`), which started with the push of commit
> `f536327`. When it finishes, copy the table from the run's **Summary** (or the
> `analysis-output` artifact, `power-results.md`) into the table below and fill in the paragraph.
> The numbers must not be guessed.

## Method

`analysis/power.R` simulates whole studies with `analysis/simulate.R` for every cell of the grid,
applies the preregistered exclusions (`analysis/common.R`), fits the H1a model and counts how
often each contrast is significant in the predicted direction:

- **Grid:** N = 8, 12, 20, 30 participants enrolled × 5 or 8 solo sessions per condition; 100
  simulated studies per cell (more by hand: Actions → Analysis (R) → Run workflow → `nsim`).
- **Model:** negative binomial GLMM, attempts ~ condition + session order + time of day +
  offset(log hours) + (1 | participant).
- **Criterion:** rate ratio < 1 with p < .05/4 = .0125 per contrast (Bonferroni over the 4 H1
  tests; the preregistered Holm correction is never less powerful, so this is a lower bound).
- **Assumptions** (not findings; `sim_assumptions` in `simulate.R`): 4 attempts/hour in control;
  true rate ratios **0.78 (friction)** and **0.74 (intention)**; between-person SD 0.5 on the log
  rate; small per-person differences in the helpers' effect (SD 0.15, not modelled in the power
  fit, so slightly optimistic); NB size 3; session lengths 25–50 min, 15% ended early (those under
  5 minutes are excluded); a few group/opted-out sessions mixed in.
- **Exclusions matter at 5 sessions per condition:** a participant with exactly 5 per condition
  drops out entirely if any one session is excluded (for example, ended under 5 minutes), so
  `mean_included` can be well below N. That is why the preregistration encourages about 8 per
  condition.

## Results

| participants | sessions_per_condition | mean_included | power_friction | power_intention | power_both | failed_fits | simulations |
| ------------ | ---------------------- | ------------- | -------------- | --------------- | ---------- | ----------- | ----------- |
| 8            | 5                      | _pending_     | _pending_      | _pending_       | _pending_  | _pending_   | 100         |
| 8            | 8                      | _pending_     | _pending_      | _pending_       | _pending_  | _pending_   | 100         |
| 12           | 5                      | _pending_     | _pending_      | _pending_       | _pending_  | _pending_   | 100         |
| 12           | 8                      | _pending_     | _pending_      | _pending_       | _pending_  | _pending_   | 100         |
| 20           | 5                      | _pending_     | _pending_      | _pending_       | _pending_  | _pending_   | 100         |
| 20           | 8                      | _pending_     | _pending_      | _pending_       | _pending_  | _pending_   | 100         |
| 30           | 5                      | _pending_     | _pending_      | _pending_       | _pending_  | _pending_   | 100         |
| 30           | 8                      | _pending_     | _pending_      | _pending_       | _pending_  | _pending_   | 100         |

## In plain words

_To be written from the table above: the smallest number of participants (and sessions per
condition) at which both friction and intention show the assumed reduction in distraction attempts
at least 80% of the time. This becomes the target N in preregistration section 3.3 (placeholder:
20). Also note how much sensitivity depends on the assumed effect size: a smaller true effect needs
more participants._
