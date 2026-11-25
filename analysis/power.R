#!/usr/bin/env Rscript
# StudyLens analysis (P19b) — simulation-based power for H1 (distraction attempts per hour).
# DRAFT – not registered; pending advisor and IRB review. See docs/research/preregistration.md.
#
# Run from the repo root:   Rscript analysis/power.R [simulations_per_cell]   (default 100)
# Writes: analysis/output/power-results.csv and power-results.md
#
# For each N (participants enrolled) × sessions per condition, simulate studies with the effects in
# simulate.R (`sim_assumptions`), apply the preregistered exclusions, fit the H1a model and count
# how often each intervention-vs-control contrast is significant in the predicted direction.
#
# Simplifications to keep it light (a few minutes for 100 simulations per cell):
# - random intercept only (the full analysis tries condition slopes first); the data DO contain
#   small slope differences, so this is slightly optimistic;
# - α = .05/4 = .0125 per contrast (Bonferroni over the 4 H1 tests) — Holm is never less powerful,
#   so this is a lower bound for the Holm-corrected test.

local({
  f <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  dir <- if (length(f) > 0) dirname(normalizePath(sub("^--file=", "", f[1]))) else "analysis"
  source(file.path(dir, "common.R"), local = globalenv())
  source(file.path(dir, "simulate.R"), local = globalenv())
})

suppressPackageStartupMessages(library(glmmTMB))

ALPHA_EACH <- 0.05 / 4

# One simulated study → c(friction = hit?, intention = hit?, included = participants), or NA hits
# if the model failed.
one_study <- function(n, k) {
  d <- prepare(apply_exclusions(simulate_study(n, k))$data)
  included <- length(unique(d$pid))
  if (included < 2) return(c(friction = NA, intention = NA, included = included))
  f <- stats::as.formula(paste("attempts ~", fixed_terms(d), "+ offset(log(hours)) + (1 | pid)"))
  m <- tryCatch(suppressWarnings(glmmTMB(f, data = d, family = nbinom2())), error = function(e) NULL)
  if (is.null(m) || isFALSE(m$sdr$pdHess)) {
    return(c(friction = NA, intention = NA, included = included))
  }
  cf <- summary(m)$coefficients$cond
  hit <- function(term) {
    est <- cf[term, 1]
    p <- 2 * stats::pnorm(-abs(est / cf[term, 2]))
    as.numeric(est < 0 && p < ALPHA_EACH)
  }
  c(friction = hit("conditionfriction"), intention = hit("conditionintention"), included = included)
}

run_power <- function(ns = c(8, 12, 20, 30), ks = c(5, 8), nsim = 100, seed = 2026) {
  grid <- expand.grid(sessions_per_condition = ks, participants = ns)
  out <- vector("list", nrow(grid))
  for (i in seq_len(nrow(grid))) {
    n <- grid$participants[i]
    k <- grid$sessions_per_condition[i]
    set.seed(seed + i)
    started <- Sys.time()
    sims <- t(vapply(seq_len(nsim), function(s) one_study(n, k), numeric(3)))
    ok <- !is.na(sims[, "friction"])
    out[[i]] <- data.frame(
      participants = n,
      sessions_per_condition = k,
      mean_included = mean(sims[, "included"]),
      power_friction = mean(sims[ok, "friction"]),
      power_intention = mean(sims[ok, "intention"]),
      power_both = mean(sims[ok, "friction"] * sims[ok, "intention"]),
      failed_fits = sum(!ok),
      simulations = nsim
    )
    cat(sprintf("N = %2d, %d per condition: friction %.2f, intention %.2f, both %.2f (%.0f s)\n",
                n, k, out[[i]]$power_friction, out[[i]]$power_intention, out[[i]]$power_both,
                as.numeric(difftime(Sys.time(), started, units = "secs"))))
  }
  do.call(rbind, out)
}

if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  nsim <- if (length(args) >= 1) as.integer(args[1]) else 100L
  out_dir <- file.path("analysis", "output")
  dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
  res <- run_power(nsim = nsim)
  utils::write.csv(res, file.path(out_dir, "power-results.csv"), row.names = FALSE)
  a <- sim_assumptions
  md <- c(
    "## Power for H1a (attempts per hour), simulated",
    "",
    sprintf("%d simulations per cell · R %s, glmmTMB %s · %s", nsim, getRversion(),
            utils::packageVersion("glmmTMB"), format(Sys.time(), "%Y-%m-%d %H:%M")),
    "",
    md_table(res),
    "",
    sprintf(paste0("Assumptions: control %g attempts/hour; true rate ratios friction %g, ",
                   "intention %g; between-person SD %g (log); NB size %g; %g%% of sessions ended ",
                   "early (some under 5 min, excluded); α = .05/4 per contrast; random-intercept ",
                   "model. `participants` = enrolled; `mean_included` = left after the ",
                   "exclusions (≥ 5 sessions per condition)."),
            a$base_attempts_per_hour, a$rr_friction, a$rr_intention, a$sd_participant_log_rate,
            a$nb_size, 100 * a$p_ended_early),
    ""
  )
  writeLines(md, file.path(out_dir, "power-results.md"))
  cat("\nWrote", file.path(out_dir, "power-results.md"), "\n")
}
