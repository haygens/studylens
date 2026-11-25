#!/usr/bin/env Rscript
# StudyLens analysis (P19b) — fits every preregistered model on a research CSV.
# DRAFT – not registered; pending advisor and IRB review. See docs/research/preregistration.md.
#
# Run from the repo root:
#   Rscript analysis/analyze.R [research.csv] [output_dir]
# Defaults: analysis/output/simulated-research.csv → analysis/output/
# Writes: results.csv, results.md (results table + exclusion counts), exclusions.csv.
#
# Packages: glmmTMB, lme4, ordinal (see analysis/README.md).

local({
  f <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  dir <- if (length(f) > 0) dirname(normalizePath(sub("^--file=", "", f[1]))) else "analysis"
  source(file.path(dir, "common.R"), local = globalenv())
})

suppressPackageStartupMessages({
  library(glmmTMB)
  library(lme4)
  library(ordinal)
})

# ---- Fitting helpers --------------------------------------------------------------------------

# Runs a model fit; NULL on error. Warnings are kept in an attribute (reported in the table).
try_fit <- function(expr) {
  warnings <- character()
  m <- tryCatch(
    withCallingHandlers(expr, warning = function(w) {
      warnings <<- c(warnings, conditionMessage(w))
      invokeRestart("muffleWarning")
    }),
    error = function(e) NULL
  )
  if (!is.null(m)) attr(m, "fit_warnings") <- unique(warnings)
  m
}

# A fit we can use: converged, positive-definite Hessian (glmmTMB), not singular (lme4).
fit_ok <- function(m) {
  if (is.null(m)) return(FALSE)
  if (inherits(m, "glmmTMB")) {
    if (!is.null(m$fit$convergence) && m$fit$convergence != 0) return(FALSE)
    if (isFALSE(m$sdr$pdHess)) return(FALSE)
    return(all(is.finite(summary(m)$coefficients$cond[, 2])))
  }
  if (inherits(m, "merMod")) {
    return(!lme4::isSingular(m) && length(m@optinfo$conv$lme4$messages) == 0)
  }
  TRUE
}

# Estimate, SE and two-sided Wald p for one term.
coef_of <- function(m, term) {
  cf <- if (inherits(m, "glmmTMB")) summary(m)$coefficients$cond else summary(m)$coefficients
  if (is.null(m) || !(term %in% rownames(cf))) return(c(est = NA, se = NA, p = NA))
  est <- cf[term, 1]
  se <- cf[term, 2]
  c(est = est, se = se, p = 2 * stats::pnorm(-abs(est / se)))
}

# glmmTMB with condition slopes first, then intercept only (preregistration section 5).
fit_glmmtmb <- function(response, d, family, offset = TRUE, slopes = TRUE) {
  rhs <- paste(response, "~", fixed_terms(d), if (offset) "+ offset(log(hours))" else "")
  tries <- if (slopes) c("(1 + condition | pid)", "(1 | pid)") else "(1 | pid)"
  for (re in tries) {
    m <- try_fit(glmmTMB(stats::as.formula(paste(rhs, "+", re)), data = d, family = family))
    if (fit_ok(m)) {
      return(list(model = m, re = if (grepl("condition", re)) "intercept + condition slopes"
                                  else "intercept"))
    }
  }
  list(model = NULL, re = "failed")
}

fit_lmer <- function(lhs, d) {
  m <- try_fit(lmer(stats::as.formula(paste(lhs, "~", fixed_terms(d), "+ (1 | pid)")), data = d))
  list(model = m, re = if (is.null(m)) "failed" else "intercept")
}

fit_clmm <- function(response, d) {
  m <- try_fit(clmm(stats::as.formula(paste(response, "~", fixed_terms(d), "+ (1 | pid)")),
                    data = d, link = "logit"))
  list(model = m, re = if (is.null(m)) "failed" else "intercept")
}

fit_binomial <- function(success, failure, d) {
  f <- paste0("cbind(", success, ", ", failure, ") ~ ", fixed_terms(d), " + (1 | pid)")
  m <- try_fit(glmer(stats::as.formula(f), data = d, family = stats::binomial))
  list(model = m, re = if (is.null(m)) "failed" else "intercept")
}

# ---- Results rows -----------------------------------------------------------------------------

result_row <- function(hypothesis, outcome, contrast, model_name, fit, term, d,
                       scale = c("ratio", "difference"), role = "confirmatory") {
  scale <- match.arg(scale)
  cf <- if (is.null(fit$model)) c(est = NA, se = NA, p = NA) else coef_of(fit$model, term)
  lo <- cf[["est"]] - 1.96 * cf[["se"]]
  hi <- cf[["est"]] + 1.96 * cf[["se"]]
  tr <- if (scale == "ratio") exp else identity
  warn <- if (is.null(fit$model)) "" else paste(attr(fit$model, "fit_warnings"), collapse = "; ")
  data.frame(
    hypothesis = hypothesis, role = role, outcome = outcome, contrast = contrast,
    model = model_name, random_effects = fit$re,
    effect = if (scale == "ratio") ifelse(grepl("logit|ordinal", model_name), "odds ratio",
                                          "rate ratio") else "difference",
    estimate = tr(cf[["est"]]), ci_low = tr(lo), ci_high = tr(hi), p = cf[["p"]],
    n_sessions = nrow(d), n_participants = length(unique(d$pid)),
    warnings = substr(warn, 1, 200),
    stringsAsFactors = FALSE
  )
}

# ---- The preregistered analysis ---------------------------------------------------------------

run_analysis <- function(input, out_dir) {
  dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
  raw <- read_research_csv(input)
  ex <- apply_exclusions(raw)
  d <- prepare(ex$data)
  if (nrow(d) == 0) stop("No sessions left after the exclusions (see the log).")
  rows <- list()
  vs <- function(a) paste(a, "vs control")

  # H1a: attempts per hour — NB2 GLMM with log(hours) offset; Poisson if NB fails.
  h1a <- fit_glmmtmb("attempts", d, glmmTMB::nbinom2())
  h1a_name <- "negative binomial GLMM, offset log(hours)"
  if (is.null(h1a$model)) {
    h1a <- fit_glmmtmb("attempts", d, stats::poisson())
    h1a_name <- "Poisson GLMM, offset log(hours) (NB failed)"
  }
  for (a in c("friction", "intention")) {
    rows[[length(rows) + 1]] <- result_row("H1a", "attempts per hour", vs(a), h1a_name, h1a,
                                           paste0("condition", a), d)
  }

  # H1b: distraction minutes per hour — Tweedie GLMM with log(hours) offset.
  h1b <- fit_glmmtmb("distraction_minutes", d, glmmTMB::tweedie(link = "log"))
  for (a in c("friction", "intention")) {
    rows[[length(rows) + 1]] <- result_row("H1b", "distraction minutes per hour", vs(a),
                                           "Tweedie GLMM, offset log(hours)", h1b,
                                           paste0("condition", a), d)
  }

  # H2: focus rating, intention vs friction — CLMM (answered check-ins only).
  da <- keep_rows(d, d$checkin_status == "answered" & !is.na(d$focus_rating))
  da$focus <- droplevels(factor(da$focus_rating, levels = 1:5, ordered = TRUE))
  da_f <- da
  da_f$condition <- stats::relevel(da_f$condition, ref = "friction")
  h2 <- fit_clmm("focus", da_f)
  rows[[length(rows) + 1]] <- result_row("H2", "focus rating (1-5)", "intention vs friction",
                                         "cumulative link mixed model (ordinal)", h2,
                                         "conditionintention", da_f)

  # H3: turn-back rate, intention vs friction — binomial GLMM on attempts.
  dh <- keep_rows(d, d$condition %in% c("friction", "intention") & d$attempts >= 1 &
                     !is.na(d$turned_back))
  dh$condition <- factor(as.character(dh$condition), levels = c("friction", "intention"))
  dh$not_turned <- dh$attempts - dh$turned_back
  h3 <- fit_binomial("turned_back", "not_turned", dh)
  rows[[length(rows) + 1]] <- result_row("H3", "turn-back rate", "intention vs friction",
                                         "binomial GLMM (logit)", h3, "conditionintention", dh)

  # Secondary: goal completion (no < partly < yes), all conditions vs control.
  dg <- keep_rows(d, d$checkin_status == "answered" & !is.na(d$goal_completed))
  dg$goal <- droplevels(factor(dg$goal_completed, levels = c("no", "partly", "yes"),
                               ordered = TRUE))
  gfit <- fit_clmm("goal", dg)
  for (a in c("friction", "intention")) {
    rows[[length(rows) + 1]] <- result_row("secondary", "goal completion (ordinal)", vs(a),
                                           "cumulative link mixed model (ordinal)", gfit,
                                           paste0("condition", a), dg, role = "secondary")
  }

  # Robustness (reported, not used to decide hypotheses).
  rob <- "robustness"
  h1a_p <- fit_glmmtmb("attempts", d, stats::poisson(), slopes = FALSE)
  for (a in c("friction", "intention")) {
    rows[[length(rows) + 1]] <- result_row("H1a", "attempts per hour", vs(a),
                                           "Poisson GLMM, offset log(hours)", h1a_p,
                                           paste0("condition", a), d, role = rob)
  }
  h1b_l <- fit_lmer("log1p(distraction_per_hour)", d)
  for (a in c("friction", "intention")) {
    rows[[length(rows) + 1]] <- result_row("H1b", "log(1 + distraction minutes per hour)", vs(a),
                                           "linear mixed model", h1b_l, paste0("condition", a), d,
                                           scale = "difference", role = rob)
  }
  h2_l <- fit_lmer("focus_rating", da_f)
  rows[[length(rows) + 1]] <- result_row("H2", "focus rating (1-5)", "intention vs friction",
                                         "linear mixed model", h2_l, "conditionintention", da_f,
                                         scale = "difference", role = rob)
  dc <- keep_rows(dh, (dh$turned_back + dh$continued) > 0)
  h3_c <- fit_binomial("turned_back", "continued", dc)
  rows[[length(rows) + 1]] <- result_row("H3", "turn-back rate (closed pages left out)",
                                         "intention vs friction", "binomial GLMM (logit)", h3_c,
                                         "conditionintention", dc, role = rob)

  res <- do.call(rbind, rows)

  # Inference criteria (section 5.3): Holm across the 4 H1 tests; direction must match.
  res$p_holm <- NA_real_
  h1 <- res$role == "confirmatory" & res$hypothesis %in% c("H1a", "H1b")
  res$p_holm[h1] <- stats::p.adjust(res$p[h1], method = "holm")
  res$supported <- NA
  res$supported[h1] <- res$p_holm[h1] < 0.05 & res$estimate[h1] < 1
  h23 <- res$role == "confirmatory" & res$hypothesis %in% c("H2", "H3")
  res$supported[h23] <- res$p[h23] < 0.05 & res$estimate[h23] > 1
  res <- res[, c("hypothesis", "role", "outcome", "contrast", "effect", "estimate", "ci_low",
                 "ci_high", "p", "p_holm", "supported", "model", "random_effects", "n_sessions",
                 "n_participants", "warnings")]

  # Check-in completeness per condition (section 5.5).
  answered <- tapply(d$checkin_status == "answered", d$condition, mean)

  utils::write.csv(res, file.path(out_dir, "results.csv"), row.names = FALSE, na = "")
  utils::write.csv(ex$log, file.path(out_dir, "exclusions.csv"), row.names = FALSE)
  md <- c(
    "# StudyLens analysis results",
    "",
    "_DRAFT – not registered; pending advisor and IRB review._",
    "",
    sprintf("Input: `%s` · %s · R %s, glmmTMB %s, lme4 %s, ordinal %s", basename(input),
            format(Sys.time(), "%Y-%m-%d %H:%M"), getRversion(), utils::packageVersion("glmmTMB"),
            utils::packageVersion("lme4"), utils::packageVersion("ordinal")),
    "",
    "## Exclusions",
    "",
    md_table(ex$log),
    "",
    "## Check-ins answered (share of included sessions)",
    "",
    md_table(data.frame(condition = names(answered), answered = as.numeric(answered))),
    "",
    "## Models",
    "",
    md_table(res[, setdiff(names(res), "warnings")]),
    ""
  )
  writeLines(md, file.path(out_dir, "results.md"))
  print(res[, c("hypothesis", "role", "contrast", "estimate", "ci_low", "ci_high", "p", "p_holm",
                "supported", "random_effects")], row.names = FALSE, digits = 3)
  cat("\nWrote", file.path(out_dir, "results.md"), "and results.csv\n")
  invisible(res)
}

if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  input <- if (length(args) >= 1) args[1] else file.path("analysis", "output", "simulated-research.csv")
  out_dir <- if (length(args) >= 2) args[2] else file.path("analysis", "output")
  run_analysis(input, out_dir)
}
