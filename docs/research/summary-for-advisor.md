# StudyLens study — one-page summary for Dr. Su

> **DRAFT – not registered; pending advisor and IRB review.** Haygen Siou, TCSS 490, 2026-11-25.
> Full plan: [preregistration.md](preregistration.md) · code: `analysis/` · CSV columns:
> [codebook.md](codebook.md) · power: [power-results.md](power-results.md).

**Question.** Do brief "friction" interventions reduce distraction while students study? StudyLens
is a privacy-first browser extension (Firefox, Edge; published) that records only the active
**domain** during focus sessions a student starts. Each student labels sites as study, neutral or
distraction. When a student opens a distraction site during a session, the extension can show
(a) a **10-second countdown** (_friction_) or (b) a **"What did you come here for?"** prompt with
the same minimum wait (_intention_; the typed answer is never stored). We compare both with doing
nothing (_control_).

**Hypotheses.**

- **H1:** friction and intention each reduce distraction attempts per hour and distraction minutes
  per hour, compared with control.
- **H2:** intention gives higher self-rated focus than friction.
- **H3:** students turn back more often at the intention page than at the friction page.

The rationale is hyperbolic delay discounting: a short delay before an immediate reward reduces
its pull disproportionately. We note that habit interruption explains H1 equally well and that
this design cannot separate the two.

**Two stages.**

- **(a) Pilot / feasibility, about 10–12 participants:** usability, adherence, data quality, and
  effect-size estimates with 95% CIs. No confirmatory claims.
- **(b) Confirmatory, 30 or more participants, target 8 solo sessions per condition:** its N comes
  from the power simulation below and may be raised by the pilot's estimates before it is
  registered.

**Design.** Within-subject field experiment. Each solo focus session is randomly assigned a
condition with **block randomization** per participant (each block of three holds each condition
once). Everything is controlled by design:

- Attempts are logged at the same trigger point in all conditions, including control.
- Both interventions cost the same minimum time.
- Site labels are frozen ("study mode").
- Live group sessions are excluded and never use a randomization slot.
- Participants are not told the hypotheses.

**Measures** (all from an anonymous, numbers-only CSV the participant exports):

- **Primary:** distraction attempts.
- **Also:** distraction minutes, turn-back count, self-rated focus (1–5) and goal completion
  (no/partly/yes) from an end-of-session check-in.
- **Covariates:** session order, time of day.

**Analysis** (preregistered; R code tested on simulated data):

- H1: negative binomial GLMM on attempts and Tweedie GLMM on distraction minutes, both with a
  log(session hours) offset, Holm-corrected across the four H1 tests.
- H2: cumulative link mixed model on focus.
- H3: binomial GLMM on turn-backs out of attempts.
- All models: participant random intercepts (condition slopes tried first for H1), plus session
  order and time of day.
- Session target: 8 solo sessions per condition. Inclusion minimum: 5 per condition (unchanged).
- The pipeline was run end to end on one **simulated** dataset. That output only shows the code
  works; it is **not a result**.

**Power** (simulated; 100 runs per cell; assumed rate ratios 0.78 friction, 0.74 intention;
α = .05/4 per contrast):

- **8–12 participants:** about **20–40%** power for each H1 attempt contrast, even with 8 sessions
  per condition. Hence the pilot framing.
- **30 participants × 8 sessions per condition:** **0.69 (friction), 0.88 (intention), 0.66
  (both)**. Below 80% for friction, so 30 is a minimum, and more than 30 has not been simulated
  yet.
- **5 vs 8 sessions per condition:** at 5, one excluded session drops a participant, and only about
  half of the enrolled survive (16.6 of 30). At N = 30 power for both contrasts falls to 0.16. At 8
  per condition nobody was lost, so the session target is 8.

**Ethics plan.**

- No data from anyone but me before IRB approval. To date there is only my own N = 1 self-test (not part of either stage).
- After approval: an in-app consent screen, then participants use the extension for up to
  4 weeks.
- At the end they export the CSV and review it before sending it through an approved channel.
- The CSV holds numbers only: no sites, no goal text, only the start date and hour, and a random
  ID not linked to identity.
- The extension never uploads research data. Participants can delete everything at any time.

**Questions for you.**

1. **IRB route:** is this exempt (minimal risk, anonymous numeric data) or expedited review, and
   should it go through UW Tacoma's IRB with you as the faculty sponsor?
2. **Kirby MCQ:** should we add a short delay-discounting questionnaire (27-item Kirby Monetary
   Choice Questionnaire) as an exploratory moderator, or keep the study minimal?
3. **Pilot vs confirmatory:** do you agree with running a pilot (about 10–12 participants,
   estimates only) first, and registering the confirmatory study (30+ participants, 8 sessions per
   condition) only after it? Is 30 an acceptable minimum given about 69% power for friction, or
   should we plan for more?
4. **Recruitment for 30+:** a friend sample can't reach 30. Is there a participant pool (e.g. a
   psychology subject pool or course credit) or another route you would recommend?
5. **Does the pilot itself need IRB review?** The plan assumes yes, since it collects
   participants' CSVs. Could it go in the same application as the confirmatory study?
6. **Measures:** should anything change? For example, a single-item focus rating vs. a short
   validated scale, the 5-minute minimum session length, or treating goal completion as
   confirmatory.
