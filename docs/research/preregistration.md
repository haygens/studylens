# Preregistration — Do brief friction delays or intention prompts reduce distraction while studying?

> **DRAFT – not registered; pending advisor and IRB review.**
> Written 2026-11-25 for review by Dr. Amy Su (UW Tacoma). It will be posted on OSF only after the
> advisor has reviewed it and the IRB has approved the study. **No data from other people has been
> collected, and none will be until IRB approval.** So far the only data is the author's own N = 1
> self-test, which is not part of either stage.
>
> **Two stages (updated 2026-11-25 after the power simulation):** (a) a **pilot / feasibility
> study** with about 10–12 participants (no confirmatory claims), then (b) a **confirmatory
> study** with 30 or more participants and a target of 8 solo sessions per condition. This
> document preregisters stage (b). Stage (a) uses the same procedure and analysis code but only
> estimates effects (Section 2.4). The pilot's estimates may update the confirmatory N **before**
> stage (b) is registered.

Structure: the OSF Preregistration template (study information, design, sampling plan, variables,
analysis plan, other). Analysis code: [`analysis/`](../../analysis/). CSV columns:
[codebook.md](codebook.md). Power: [power-results.md](power-results.md).

---

## 1. Study information

### 1.1 Title

Do brief friction delays or intention prompts reduce distraction while studying? A within-subject,
session-randomized field study with a browser extension (StudyLens).

### 1.2 Authors

Haygen Siou (UW Tacoma, TCSS 490). Advisor: Dr. Amy Su.

### 1.3 Description

Students study on the same computer they use to procrastinate. StudyLens is a privacy-first
browser extension (Firefox, Microsoft Edge). It records which **domains** are active during focus
sessions that the student starts. Each student labels sites as study, neutral or distraction.
Every solo focus session is randomly given one of three conditions:

- **control**: nothing changes;
- **friction**: when the student opens a site they labeled Distraction, a 10-second countdown
  appears before it loads;
- **intention**: the same moment brings up a "What did you come here for?" box. The student must
  type at least 3 characters and wait 10 seconds before "Continue". The answer is never stored.

The study tests whether these brief interventions change distraction behaviour and self-rated
focus compared with control, and whether the two interventions differ from each other.

### 1.4 Research questions

- **RQ1.** Do friction delays and intention prompts reduce distraction during study sessions
  compared with no intervention?
- **RQ2.** Does an intention prompt improve self-rated focus more than a friction delay of equal
  length?
- **RQ3.** When an intervention page appears, is a student more likely to turn back after an
  intention prompt than after a friction delay?

### 1.5 Hypotheses (directional)

- **H1.** Friction and intention sessions each have (a) **fewer distraction attempts per hour** and
  (b) **fewer distraction minutes per hour** than control sessions. That is 4 confirmatory tests:
  friction vs. control and intention vs. control, on each of (a) and (b).
- **H2.** Intention sessions have **higher self-rated focus** (1–5) than friction sessions.
- **H3.** The **turn-back rate**, the share of distraction attempts where the student pressed
  "Back to studying", is **higher at the intention page than at the friction page**.

### 1.6 Theory and alternative explanation

**Delay discounting.** People discount delayed rewards steeply, and approximately hyperbolically:
the subjective value of a reward falls fastest over the first moments of delay (Ainslie, 1975;
Mazur, 1987). A distraction site is an immediate, small reward, and studying a delayed, larger
one. Hyperbolic discounting predicts that even a short delay before the immediate reward lowers
its pull more than the delay's length suggests. During the delay, studying can win the
comparison. This predicts H1 for **friction**.

The **intention** prompt adds the same 10-second delay and a reflective step. Stating a reason
makes the choice deliberate rather than automatic (implementation intentions: Gollwitzer, 1999).
This predicts H1 for intention, and an advantage over friction in turning back (H3) and in
perceived self-control (H2).

**Alternative explanation this design cannot separate: habit interruption.** Both interventions
also simply interrupt a habitual, cue-driven action (Wood & Neal, 2007). Any break in an automatic
"open the site" routine might reduce distraction, whatever its effect on reward value. Friction
and intention cost the same time, so H3 and H2 speak to the _added reflective step_. But the
friction-vs-control contrast cannot tell discounting apart from interruption. We will describe
results as "consistent with" either account, not as evidence for discounting specifically. An
exploratory delay-discounting measure (Section 6) could inform this only if the advisor approves
adding it.

---

## 2. Design plan

### 2.1 Study type

Field experiment, within-subject, with randomization at the session level. Participants use
StudyLens during their own normal studying. No laboratory component.

### 2.2 Blinding

Participants know that some sessions show a helper page; the interventions are visible by nature,
so participants are not blind to condition **while a page is shown**. They are **not told the
hypotheses**. They are not shown the condition when starting a session, though they can look it up
afterwards in the extension's My Data page. Analysis is not blinded. To limit researcher degrees
of freedom, the analysis code ([`analysis/analyze.R`](../../analysis/analyze.R)) is written and
tested on simulated data before any participant data exists, and is registered together with this
document. **The model output from that test run is from SIMULATED data and only shows that the
pipeline works. It is not a result.**

### 2.3 Study design

- **Factor:** condition (control / friction / intention), within participants, randomized per
  **solo** focus session.
- **Randomization:** block randomization per participant. A shuffled block holds each condition
  exactly once. Each new solo session takes the next condition from the block, and a new block is
  shuffled when it runs out. The random source is `crypto.getRandomValues`, with rejection
  sampling for uniform draws.
- **Equal time cost:** friction and intention both make "Continue" wait at least 10 s; "Back to
  studying" works at once.
- **Same trigger point:** in **every** condition, including control, an attempt is logged at the
  moment a helper page would appear (entering a site labeled Distraction during a session). So
  attempts are comparable across conditions.
- **Labels frozen:** participants set their site labels first, then turn on **study mode** ("Lock
  my site labels"). Each session stores whether labels were locked and the label-set version.
- **Group sessions excluded:** live group focus sessions (`mode = group`, condition `group`) never
  take a randomization slot. So the solo conditions stay balanced, and group sessions are excluded
  from all confirmatory analyses.
- **Session length:** chosen by the participant (25, 50, or 5–180 minutes). Exposure differences
  are handled with an offset (Section 5).

### 2.4 Two stages: pilot, then confirmatory

The power simulation ([power-results.md](power-results.md)) shows that the effects we consider
realistic need far more participants than a friend sample can give. With rate ratios 0.78
(friction) and 0.74 (intention), 8–12 participants give only about 20–40% power for the H1
attempt contrasts. 30 participants with 8 sessions per condition give about 66–88%. The study is
therefore split into two stages:

- **(a) Pilot / feasibility study, about 10–12 participants.** It tests usability, adherence (do
  people reach 8 solo sessions per condition in 4 weeks?), data quality (exclusion rates,
  answered check-ins, sessions under 5 minutes) and gives **effect-size estimates with 95%
  confidence intervals**. Same procedure, exclusions and models as below, but **no hypothesis is
  confirmed or rejected**: no Holm correction, no "supported" labels. Results are described as
  estimates for planning. Pilot participants are not reused in stage (b).
- **(b) Confirmatory study, 30 or more participants, target 8 solo sessions per condition.** This
  is the study preregistered here (Sections 3–5). Its N is justified by the power simulation. If
  the pilot's estimates (or their confidence intervals) suggest a smaller effect than assumed, the
  target N is raised, and the grid is re-run with the new assumptions, **before** stage (b) is
  registered and before any stage (b) data exists.

---

## 3. Sampling plan

### 3.1 Existing data

None from participants. The author's own N = 1 self-test (sessions from v0.4.0 onward) was used only to
test the pipeline and will not be included in either stage. Stage (a) data (Section 2.4) will
exist before stage (b) is registered, but it is used only to plan stage (b) (N, feasibility). Its
participants and sessions are never part of the confirmatory analysis.

### 3.2 Data collection procedures

- **Population:** university students (18+) who study on a laptop or desktop with Firefox or
  Edge.
- **Recruitment** (after IRB approval): course announcements and word of mouth at UW Tacoma. No
  compensation is planned (to be confirmed with the advisor and IRB).
- **Procedure:**
  1. Install StudyLens.
  2. Read and accept an in-app consent screen. _This screen does not exist yet; it will be built
     after IRB approval._
  3. Label sites and turn on study mode.
  4. Use focus sessions for normal studying for up to **4 weeks**.
  5. At the end, the participant downloads the research CSV from My Data. They review it (numbers
     only: no sites, no goal text, no exact times) and send it through the channel the IRB
     approves. The extension itself never uploads research data.
- **Participant ID:** random, made on the device (`p-` + 12 hex characters). It is not linked to
  name, email or device.

### 3.3 Sample size

- **Session target: 8 solo sessions per condition** (24 solo sessions) per participant.
  Participants are asked to reach this within their 4 weeks.
- **Inclusion threshold (unchanged): at least 5 solo sessions per condition** after the session
  exclusions (Section 5.4). Participants with 5–7 per condition are still included.
- **Why the target is 8, not 5:** with exactly 5 per condition, a single excluded session (for
  example, one ended under 5 minutes) drops the whole participant. In the simulation
  (`mean_included` in [power-results.md](power-results.md)), only about half of the enrolled
  participants survived at 5 per condition: 4.7 of 8, 6.4 of 12, 11.2 of 20, 16.6 of 30. At 8 per
  condition, all of them did (8.0, 12, 20, 30). Aiming for 8 leaves room for exclusions and gives
  each participant more sessions, which raises power: at N = 30, power for both contrasts goes
  from 0.16 (5 per condition) to 0.66 (8 per condition).
- **Stage (a), pilot:** about **10–12 participants**, chosen for feasibility, not power.
- **Stage (b), confirmatory — target N = 30 included participants (minimum), more if
  recruitment allows.** Simulated power at N = 30 with 8 sessions per condition: **0.69
  (friction vs control), 0.88 (intention vs control), 0.66 (both)**, for attempts per hour at
  α = .05/4. This is **below the usual 80% for the friction contrast**, and we say so honestly.
  Reaching 80% for friction would need more than 30 participants. N above 30 was not simulated;
  the grid will be extended (e.g. 40, 50) and updated with the pilot's estimates before stage (b)
  is registered. A friend sample cannot reach 30. Stage (b) needs a broader recruitment route
  (e.g. a participant pool), to be decided with the advisor.

### 3.4 Stopping rule

**Stage (b), confirmatory.** Recruitment stops at the **earlier** of:

1. the target N of participants meeting the inclusion threshold, or
2. **10 weeks** after the first participant enrolls (one academic quarter).

If the end date comes first, the analysis runs on the participants included by then, and the
achieved power is reported. **Stage (a), pilot:** recruitment stops at 12 enrolled participants or
after 4 weeks of recruitment, whichever comes first.

Participants still enrolled at the stop date finish their current 4-week window. Data are
analysed once, after the stop. There are no interim analyses.

---

## 4. Variables

### 4.1 Manipulated variable

`condition` ∈ {control, friction, intention} (CSV column 4), randomized as in 2.3.

### 4.2 Measured variables

Every analysed quantity comes from the research CSV
([codebook.md](codebook.md), file `studylens-research-YYYY-MM-DD.csv`, 22 columns).

| Measure (role)                                   | Definition                                                                     | CSV columns                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Distraction attempts per hour** (H1a, primary) | attempts ÷ session hours; modelled as a count with log(hours) offset           | `attempts`, `actual_minutes`                                                             |
| **Distraction minutes per hour** (H1b)           | active-tab minutes on Distraction-labeled sites ÷ session hours                | `distraction_minutes`, `actual_minutes`                                                  |
| **Self-rated focus** (H2)                        | "How focused were you?" 1 (very distracted) – 5 (fully focused)                | `focus_rating` (only if `checkin_status = answered`)                                     |
| **Turn-back rate** (H3; friction/intention only) | `turned_back` ÷ `attempts` per session                                         | `turned_back`, `attempts`                                                                |
| **Goal completion** (secondary)                  | "Did you finish your goal?" no < partly < yes                                  | `goal_completed` (only if answered)                                                      |
| Session order (covariate)                        | per-device session number, centered                                            | `session_number`                                                                         |
| Time of day (covariate)                          | local start hour in bands: morning < 12, afternoon 12–16, evening ≥ 17         | `start_hour`                                                                             |
| Participant (grouping)                           | random ID                                                                      | `participant_id`                                                                         |
| Exclusion fields                                 | see 5.4                                                                        | `mode`, `condition`, `actual_minutes`, `attempts`, `labels_locked`, `checkin_status`     |
| Secondary / descriptive                          | distraction visits (old measure), helper dwell seconds, continued, ended early | `distraction_visits`, `mean_dwell_seconds`, `continued`, `ended_early`                   |
| Not analysed (context)                           | planned length, study/neutral minutes, date, label version                     | `planned_minutes`, `study_minutes`, `neutral_minutes`, `start_date`, `label_set_version` |

### 4.3 Indices

No composite scores. The rates above are modelled through offsets and binomial denominators, not
as ratio variables.

---

## 5. Analysis plan

All models are fitted in R with `glmmTMB`, `lme4` and `ordinal`, by
[`analysis/analyze.R`](../../analysis/analyze.R). Condition is a factor with **control** as the
reference level. For H2 and H3 the model is refitted with **friction** as the reference, to get the
intention-vs-friction contrast directly.

**Common fixed effects:** condition + session order (session number, centered at the participant's
mean and divided by 10) + time of day (3-level factor, reference: afternoon).

**Random effects:** a random intercept per participant. **Random slopes for condition** are tried
first for H1. If that model fails to converge, has a non-positive-definite Hessian, or is singular,
we fall back to random intercepts only and report which structure was used.

### 5.1 Confirmatory models

| Hypothesis | Outcome                     | Model                                                                                             | Contrast(s)                             |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| H1a        | attempts                    | negative binomial GLMM (NB2, log link), offset log(actual hours); Poisson if NB fails to converge | friction − control, intention − control |
| H1b        | distraction minutes         | Tweedie GLMM (log link), offset log(actual hours)                                                 | friction − control, intention − control |
| H2         | focus rating                | cumulative link mixed model (logit), random intercept                                             | intention − friction                    |
| H3         | turned_back out of attempts | binomial GLMM (logit), random intercept; friction and intention sessions with ≥ 1 attempt         | intention − friction                    |

### 5.2 Secondary and robustness models (reported, not used to decide hypotheses)

- Goal completion (no < partly < yes): cumulative link mixed model, all three conditions.
- H2 robustness: linear mixed model on focus rating (1–5).
- H1b robustness: linear mixed model on log(1 + distraction minutes per hour).
- H3 robustness: denominator = turned_back + continued (pages closed without a choice left out).
- H1a robustness: Poisson GLMM; random-intercept-only model if the random-slope model was used.

### 5.3 Inference criteria

- Effects are reported as **rate ratios** (H1a, H1b), **odds ratios** (H2, H3, goal completion), or
  mean differences (LMMs), with 95% Wald confidence intervals and two-sided Wald z-test p-values.
- **H1:** the 4 tests are corrected with **Holm's method** (family-wise α = .05). A contrast
  supports H1 if its Holm-adjusted p < .05 **and** its rate ratio is below 1. The friction and
  intention parts of H1 are judged separately.
- **H2, H3:** a single test each at α = .05; supported if p < .05 **and** the odds ratio is above
  1 (intention higher).
- A non-significant result is reported as "no evidence of a difference", with its CI, never as
  evidence of no effect.
- **Stage (a), pilot:** the same models are fitted, but only estimates and 95% CIs are reported.
  There are no Holm-adjusted decisions and no "supported" labels. The pilot is not a test of
  H1–H3.

### 5.4 Data exclusion

Applied in this order. Counts at each step are reported:

1. `mode` ≠ `solo` (live group sessions).
2. `condition` not in {control, friction, intention}: `opted-out`, `group`, `none`/empty.
3. Missing `attempts` (sessions from before v0.4.0).
4. `labels_locked` = 0 (study mode was off, so labels could change mid-study).
5. Very short sessions: `actual_minutes` < 5.
6. **Participant level:** participants with fewer than 5 remaining sessions in any one condition
   are excluded entirely.
7. **Per outcome:** focus rating and goal completion use only sessions with
   `checkin_status = answered`. H3 uses only friction and intention sessions with `attempts` ≥ 1.

No outlier removal beyond these rules. Implausible values cannot occur by construction; the CSV is
produced by the extension.

### 5.5 Missing data

No imputation. Check-ins that are skipped or pending are missing for H2 and goal completion only.
We will report the share of answered check-ins per condition. If it differs between conditions by
more than 10 percentage points, we will add a sensitivity analysis: a logistic GLMM of "answered"
on condition. Results will be interpreted with that caveat.

### 5.6 Deviations

Any deviation from this plan, including a model fallback, will be listed in a "Deviations" table
in the final report with the reason, together with results of the planned analysis wherever it
could be run.

---

## 6. Exploratory analyses (not confirmatory)

- **Session order and novelty:** condition × session-order interaction; whether intervention
  effects fade with use.
- **Passive study-group membership:** the extension stores a local flag `inGroup` (was the
  browser in a study group when the session started). It is **not** in the CSV yet. If it is
  added (codebook updated first), we will explore it as a covariate.
- **Delay discounting as a moderator:** a short delay-discounting questionnaire, such as the
  27-item Kirby Monetary Choice Questionnaire (Kirby, Petry & Bickel, 1999), as a moderator of the
  friction effect. **Only if the advisor approves adding it**; it is not part of the confirmatory
  plan and would need its own IRB approval and consent.
- Secondary measures: distraction visits, helper-page dwell time, ended-early rate.

---

## 7. Other

### 7.1 Limitations

- **No blinding:** participants see the interventions, and demand effects are possible (especially
  for self-rated focus).
- **Self-chosen labels:** what counts as "distraction" differs between participants. Study mode
  freezes labels during the study, but the definition stays personal.
- **Self-report:** focus rating and goal completion are single-item self-reports.
- **Small convenience sample** of students. Generalization is limited.
- **Power:** even the confirmatory target (N = 30, 8 sessions per condition) has only about 69%
  simulated power for the friction contrast under the assumed effect. The assumed effects are
  themselves guesses until the pilot gives estimates.
- **Domain-level tracking only:** time on a site labeled Distraction may sometimes be legitimate.
- **Field setting:** idle detection (60 s without input) and multi-device studying make the minute
  measures noisy.

### 7.2 Ethics

- **IRB approval pending.** No data from other people is collected before approval.
- **Consent:** an explicit in-app consent screen, built and reviewed after approval, before any
  research participation.
- **Privacy by design:** all tracking stays on the participant's device. The research CSV contains
  numbers only (no sites, no goal text, no typed answers, start date and hour only) and a random
  participant ID. The participant reviews the file before sending it. Participants can delete
  everything locally at any time and withdraw.
- The intention prompt's typed answer is never stored, logged or sent.

### 7.3 References

- Ainslie, G. (1975). Specious reward: A behavioral theory of impulsiveness and impulse control.
  _Psychological Bulletin, 82_(4), 463–496.
- Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. _American
  Psychologist, 54_(7), 493–503.
- Kirby, K. N., Petry, N. M., & Bickel, W. K. (1999). Heroin addicts have higher discount rates for
  delayed rewards than non-drug-using controls. _Journal of Experimental Psychology: General,
  128_(1), 78–87.
- Mazur, J. E. (1987). An adjusting procedure for studying delayed reinforcement. In M. L. Commons
  et al. (Eds.), _Quantitative analyses of behavior: Vol. 5_ (pp. 55–73). Erlbaum.
- Wood, W., & Neal, D. T. (2007). A new look at habits and the habit–goal interface. _Psychological
  Review, 114_(4), 843–863.
