# Power simulation for H1 (attempts per hour)

> **DRAFT – not registered; pending advisor and IRB review.**
>
> Source: GitHub Actions workflow **Analysis (R)** (`.github/workflows/analysis.yml`), run on
> 2026-11-25 (23:55 UTC), R 4.6.2, glmmTMB 1.1.15.2, 100 simulations per cell. Everything here comes
> from **simulated data** with assumed effects. It is a planning tool, not a result.

## Method

`analysis/power.R` simulates whole studies with `analysis/simulate.R` for every cell of the grid,
applies the preregistered exclusions (`analysis/common.R`), fits the H1a model and counts how
often each contrast is significant in the predicted direction.

- **Grid:** N = 8, 12, 20, 30 participants enrolled × 5 or 8 solo sessions per condition; 100
  simulated studies per cell.
- **Model:** negative binomial GLMM: attempts ~ condition + session order + time of day +
  offset(log hours) + (1 | participant).
- **Criterion:** rate ratio < 1 with p < .05/4 = .0125 per contrast. This is Bonferroni over the
  4 H1 tests. The preregistered Holm correction is never less powerful, so these numbers are a
  lower bound.
- **Assumptions** (`sim_assumptions` in `simulate.R`; not findings):
  - 4 attempts/hour in control;
  - true rate ratios **0.78 (friction)** and **0.74 (intention)**;
  - between-person SD 0.5 on the log rate;
  - small per-person differences in the helpers' effect (SD 0.15, not modelled in the power fit,
    so slightly optimistic);
  - NB size 3;
  - session lengths 25–50 min, 15% ended early (those under 5 minutes are excluded);
  - a few group / opted-out sessions mixed in.

## Results

| participants (enrolled) | sessions per condition | mean included | power friction | power intention | power both | failed fits | simulations |
| ----------------------- | ---------------------- | ------------- | -------------- | --------------- | ---------- | ----------- | ----------- |
| 8                       | 5                      | 4.67          | 0.071          | 0.112           | 0.010      | 2           | 100         |
| 8                       | 8                      | 7.99          | 0.21           | 0.33            | 0.11       | 0           | 100         |
| 12                      | 5                      | 6.41          | 0.111          | 0.091           | 0.030      | 1           | 100         |
| 12                      | 8                      | 12            | 0.25           | 0.39            | 0.16       | 0           | 100         |
| 20                      | 5                      | 11.2          | 0.16           | 0.22            | 0.09       | 0           | 100         |
| 20                      | 8                      | 20            | 0.40           | 0.59            | 0.34       | 0           | 100         |
| 30                      | 5                      | 16.6          | 0.28           | 0.37            | 0.16       | 0           | 100         |
| 30                      | 8                      | 30            | 0.69           | 0.88            | 0.66       | 0           | 100         |

`mean included` = participants left after the exclusions (≥ 5 sessions in every condition).
`power` is the share of simulated studies with a significant reduction, among the fits that worked
(`failed fits` were left out). With 100 simulations, each power value is uncertain by roughly
±0.05–0.10.

## In plain words

If the interventions work about as well as we assume (about 22–26% fewer distraction attempts per
hour), a study with **8–12 participants has only about a 20–40% chance** of detecting each effect,
even when everyone completes 8 sessions per condition. A friend-sized study would therefore most
likely miss real effects. That is why it is planned as a **pilot**: it checks feasibility and
estimates effect sizes with confidence intervals, but makes no confirmatory claims.

With **30 participants and 8 sessions per condition**, power rises to about **69% (friction)
and 88% (intention)**, or 66% for both together. That is good for intention but still below the
usual 80% target for friction. Reaching 80% for friction would need more than 30 participants
(not yet simulated), so 30 is a **minimum** for the confirmatory stage, not a comfortable number.

The number of sessions per participant matters as much as the number of people. At **5 sessions
per condition**, a single excluded session removes the whole participant, so only about half of
the enrolled participants survive the exclusions (16.6 of 30). Power then collapses (0.16 for
both contrasts at N = 30). At **8 per condition**, nobody was lost. Hence the session target of 8,
with the inclusion minimum kept at 5.

All of this depends on the assumed effects, which are guesses. If the pilot suggests smaller
effects, the confirmatory N must go up. The grid will be re-run with the pilot's estimates (and
larger N, e.g. 40–50) before the confirmatory study is registered.

## About the "Models" table in the same run

The same workflow also ran `analyze.R` on one simulated dataset (12 participants, 8 sessions per
condition, seed 2026). **That table is from SIMULATED data and only shows that the pipeline works
end to end: every model fitted, the exclusions ran in order, and the Holm and "supported" logic
works. It is not a result and must not be cited as one.**

One check to do: in that dataset, the H1a estimates (rate ratios 0.57 and 0.49) are stronger than
the assumed 0.78 and 0.74, and their CIs exclude the assumed values. The power grid (25–39% power
at that design) agrees with the assumed effects, and the standard errors match (about 0.14 on the
log scale), so this is most likely chance for that one seed. It should still be confirmed by
running the models on a few more simulated datasets: in R, `simulate_study(12, 8, seed = s)` for
several seeds `s` (the command-line `simulate.R` always uses seed 2026), then checking that the
estimates average out near the assumptions.
