#!/usr/bin/env Rscript
# StudyLens analysis (P19b) — simulated research data with the exact research CSV columns.
# DRAFT – not registered; pending advisor and IRB review. See docs/research/preregistration.md.
#
# Run from the repo root:   Rscript analysis/simulate.R [output.csv] [participants] [sessions_per_condition]
# Default output:           analysis/output/simulated-research.csv (12 participants, 8 per condition)
#
# The numbers below are ASSUMPTIONS for testing the pipeline and for the power simulation, not
# findings. They are deliberately modest effects (see `sim_assumptions`). Base R only.

# common.R sits next to this file (works with Rscript, and when power.R sources this file).
local({
  f <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  dir <- if (length(f) > 0) dirname(normalizePath(sub("^--file=", "", f[1]))) else "analysis"
  source(file.path(dir, "common.R"), local = globalenv())
})

sim_assumptions <- list(
  # H1a: distraction attempts per hour in control sessions, and the true rate ratios.
  base_attempts_per_hour = 4,
  sd_participant_log_rate = 0.5, # between-person spread of the attempt rate (log scale)
  rr_friction = 0.78,            # friction: 22% fewer attempts per hour than control
  rr_intention = 0.74,           # intention: 26% fewer
  sd_condition_slope = 0.15,     # people differ a little in how much the helpers work (log scale)
  order_per_10_sessions = -0.05, # slight practice effect on the log rate per 10 sessions
  nb_size = 3,                   # negative binomial size (overdispersion)
  # H3: turn-back probability at the helper page (participant spread on the logit scale).
  p_turn_back_friction = 0.30,
  p_turn_back_intention = 0.40,
  sd_turn_back_logit = 0.5,
  p_closed_without_choice = 0.05,
  # H1b: minutes per site visit that loaded (log-normal, median and log-SD).
  visit_minutes_median = 2,
  visit_minutes_logsd = 0.8,
  # H2: shift of the latent focus rating (logit scale) and the effect of attempts on it.
  focus_shift_friction = 0.10,
  focus_shift_intention = 0.35,
  focus_per_attempt_per_hour = -0.10,
  sd_participant_focus = 0.7,
  # Behaviour around the edges (exercises the exclusions).
  p_ended_early = 0.15,
  p_checkin_answered = 0.85,
  p_labels_unlocked = 0.03,
  p_extra_group_session = 0.05,
  p_extra_opted_out = 0.03
)

random_participant_id <- function() {
  paste0("p-", paste(sample(c(0:9, letters[1:6]), 12, replace = TRUE), collapse = ""))
}

# One participant's sessions: `k` shuffled blocks of the 3 conditions (block randomization), with
# a few group / opted-out sessions mixed in (they never use a block slot).
simulate_participant <- function(k, a = sim_assumptions) {
  solo <- unlist(lapply(seq_len(k), function(i) sample(CONDITIONS)))
  n_group <- stats::rbinom(1, length(solo), a$p_extra_group_session)
  n_opt <- stats::rbinom(1, length(solo), a$p_extra_opted_out)
  total <- length(solo) + n_group + n_opt
  type <- character(total)
  solo_slots <- sort(sample.int(total, length(solo)))
  type[solo_slots] <- solo
  if (total > length(solo)) {
    type[-solo_slots] <- sample(c(rep("group", n_group), rep("opted-out", n_opt)))
  }

  # Participant-level random effects.
  u_rate <- stats::rnorm(1, 0, a$sd_participant_log_rate)
  u_fric <- stats::rnorm(1, 0, a$sd_condition_slope)
  u_int <- stats::rnorm(1, 0, a$sd_condition_slope)
  u_turn <- stats::rnorm(1, 0, a$sd_turn_back_logit)
  u_focus <- stats::rnorm(1, 0, a$sd_participant_focus)

  session_number <- seq_len(total)
  planned <- sample(c(25, 50, 30, 45), total, replace = TRUE, prob = c(0.45, 0.35, 0.1, 0.1))
  ended_early <- stats::rbinom(total, 1, a$p_ended_early)
  actual <- ifelse(ended_early == 1, round(planned * stats::runif(total, 0.1, 0.95), 1), planned)
  hours <- actual / 60

  is_fric <- type == "friction"
  is_int <- type == "intention"
  helper <- is_fric | is_int
  logged <- type %in% CONDITIONS # attempts are logged in control/friction/intention only

  log_rr <- ifelse(is_fric, log(a$rr_friction) + u_fric,
                   ifelse(is_int, log(a$rr_intention) + u_int, 0))
  order_c <- (session_number - mean(session_number)) / 10
  mu <- a$base_attempts_per_hour * hours * exp(u_rate + log_rr + a$order_per_10_sessions * order_c)
  attempts_all <- stats::rnbinom(total, size = a$nb_size, mu = mu)

  p_turn <- stats::plogis(stats::qlogis(ifelse(is_int, a$p_turn_back_intention,
                                               a$p_turn_back_friction)) + u_turn)
  turned_all <- stats::rbinom(total, attempts_all, p_turn)
  closed_all <- stats::rbinom(total, attempts_all - turned_all, a$p_closed_without_choice)
  continued_all <- attempts_all - turned_all - closed_all

  # Sites that actually loaded: every attempt in control, "Continue" with a helper; in group and
  # opted-out sessions distraction still happens but no attempt is logged.
  loaded <- ifelse(helper, continued_all,
                   ifelse(logged, attempts_all,
                          stats::rpois(total, a$base_attempts_per_hour * hours * exp(u_rate))))
  dist_min <- vapply(loaded, function(v) {
    sum(stats::rlnorm(v, log(a$visit_minutes_median), a$visit_minutes_logsd))
  }, numeric(1))
  dist_min <- round(pmin(dist_min, 0.8 * actual), 1)
  rest <- actual - dist_min
  study_min <- round(rest * stats::runif(total, 0.5, 0.9), 1)
  neutral_min <- round(pmax(0, rest - study_min), 1)

  # Check-in: latent focus (logit scale) → 1-5; goal completion correlated with it.
  aph <- ifelse(hours > 0, attempts_all / hours, 0)
  shift <- ifelse(is_fric, a$focus_shift_friction, ifelse(is_int, a$focus_shift_intention, 0))
  latent <- u_focus + shift + a$focus_per_attempt_per_hour * (aph - a$base_attempts_per_hour) +
    stats::rlogis(total)
  focus <- findInterval(latent, c(-2.5, -1, 0.5, 2)) + 1
  goal <- c("no", "partly", "yes")[findInterval(0.6 * latent + stats::rlogis(total), c(-0.8, 0.8)) + 1]
  answered <- stats::runif(total) < a$p_checkin_answered
  status <- ifelse(answered, "answered", "skipped")
  if (stats::runif(1) < 0.3) status[total] <- "pending" # the latest check-in still open
  answered <- status == "answered"

  data.frame(
    participant_id = random_participant_id(),
    session_number = session_number,
    mode = ifelse(type == "group", "group", "solo"),
    condition = type,
    start_date = format(as.Date("2027-01-11") + cumsum(sample(0:2, total, replace = TRUE))),
    start_hour = sample(8:23, total, replace = TRUE),
    planned_minutes = planned,
    actual_minutes = actual,
    study_minutes = study_min,
    neutral_minutes = neutral_min,
    distraction_minutes = dist_min,
    distraction_visits = loaded,
    attempts = ifelse(logged, attempts_all, 0L),
    continued = ifelse(helper, continued_all, NA),
    turned_back = ifelse(helper, turned_all, NA),
    mean_dwell_seconds = ifelse(helper & (turned_all + continued_all) > 0,
                                round(stats::runif(total, 4, 25), 1), NA),
    focus_rating = ifelse(answered, focus, NA),
    goal_completed = ifelse(answered, goal, NA),
    checkin_status = status,
    ended_early = ended_early,
    label_set_version = 3L,
    labels_locked = 1L - stats::rbinom(total, 1, a$p_labels_unlocked),
    stringsAsFactors = FALSE
  )[, RESEARCH_COLUMNS]
}

# A whole simulated study: `n_participants`, each with `sessions_per_condition` solo sessions per
# condition (before exclusions).
simulate_study <- function(n_participants = 12, sessions_per_condition = 8,
                           a = sim_assumptions, seed = NULL) {
  if (!is.null(seed)) set.seed(seed)
  do.call(rbind, lapply(seq_len(n_participants), function(i) {
    simulate_participant(sessions_per_condition, a)
  }))
}

if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  out <- if (length(args) >= 1) args[1] else file.path("analysis", "output", "simulated-research.csv")
  n <- if (length(args) >= 2) as.integer(args[2]) else 12L
  k <- if (length(args) >= 3) as.integer(args[3]) else 8L
  dir.create(dirname(out), recursive = TRUE, showWarnings = FALSE)
  df <- simulate_study(n, k, seed = 2026)
  write_research_csv(df, out)
  cat(sprintf("Wrote %d simulated sessions (%d participants, %d per condition) to %s\n",
              nrow(df), n, k, out))
}
