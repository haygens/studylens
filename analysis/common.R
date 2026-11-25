# StudyLens analysis (P19b) — shared helpers: CSV columns, reading, exclusions, derived variables.
# DRAFT – not registered; pending advisor and IRB review. See docs/research/preregistration.md.
#
# Used by simulate.R, analyze.R and power.R. Base R only (no packages needed here).

# The research CSV columns, in order (docs/research/codebook.md; extension/src/my-data/research-csv.ts).
RESEARCH_COLUMNS <- c(
  "participant_id", "session_number", "mode", "condition", "start_date", "start_hour",
  "planned_minutes", "actual_minutes", "study_minutes", "neutral_minutes", "distraction_minutes",
  "distraction_visits", "attempts", "continued", "turned_back", "mean_dwell_seconds",
  "focus_rating", "goal_completed", "checkin_status", "ended_early", "label_set_version",
  "labels_locked"
)

CONDITIONS <- c("control", "friction", "intention")

# Preregistered thresholds (preregistration.md, section 5.4).
MIN_SESSIONS_PER_CONDITION <- 5
MIN_SESSION_MINUTES <- 5

# The folder this script lives in (works with Rscript and with source()).
script_dir <- function() {
  file_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  if (length(file_arg) > 0) return(dirname(normalizePath(sub("^--file=", "", file_arg[1]))))
  "analysis"
}

# Reads a research CSV and checks that it has exactly the documented columns. Empty cells = NA.
read_research_csv <- function(path) {
  df <- utils::read.csv(path, na.strings = "", stringsAsFactors = FALSE, check.names = FALSE)
  if (!identical(names(df), RESEARCH_COLUMNS)) {
    stop("Unexpected columns in ", path, ". Expected: ", paste(RESEARCH_COLUMNS, collapse = ","))
  }
  df
}

# Writes a data frame in the extension's CSV format (no quotes needed, empty = NA, CRLF).
write_research_csv <- function(df, path) {
  utils::write.table(df[, RESEARCH_COLUMNS], path, sep = ",", row.names = FALSE, na = "",
                     quote = FALSE, eol = "\r\n")
}

# Rows where `ok` is TRUE (NA counts as FALSE), with unused factor levels dropped.
keep_rows <- function(d, ok) droplevels(d[!is.na(ok) & ok, , drop = FALSE])

# The preregistered exclusions (section 5.4, steps 1-6), in order, with a count after each step.
# Returns list(data = included sessions, log = data.frame(step, sessions, participants)).
apply_exclusions <- function(df,
                             min_per_condition = MIN_SESSIONS_PER_CONDITION,
                             min_minutes = MIN_SESSION_MINUTES) {
  log <- data.frame(step = character(), sessions = integer(), participants = integer(),
                    stringsAsFactors = FALSE)
  add <- function(label, d) {
    log[nrow(log) + 1, ] <<- list(label, nrow(d), length(unique(d$participant_id)))
  }
  d <- df
  add("0. all sessions in the file", d)
  d <- keep_rows(d, d$mode == "solo")
  add("1. solo sessions only (group sessions out)", d)
  d <- keep_rows(d, d$condition %in% CONDITIONS)
  add("2. condition control/friction/intention (opted-out, group, none out)", d)
  d <- keep_rows(d, !is.na(d$attempts))
  add("3. attempts recorded (pre-v0.4.0 sessions out)", d)
  d <- keep_rows(d, d$labels_locked == 1)
  add("4. labels locked (study mode on)", d)
  d <- keep_rows(d, d$actual_minutes >= min_minutes)
  add(sprintf("5. at least %g minutes long", min_minutes), d)
  if (nrow(d) > 0) {
    counts <- table(factor(d$condition, levels = CONDITIONS), d$participant_id)
    enough <- colnames(counts)[apply(counts, 2, min) >= min_per_condition]
    d <- keep_rows(d, d$participant_id %in% enough)
  }
  add(sprintf("6. participants with >= %d sessions in every condition", min_per_condition), d)
  list(data = d, log = log)
}

# Derived variables for the models (section 5): factors, hours (offset), centered order, time of day.
prepare <- function(d) {
  d$condition <- factor(d$condition, levels = CONDITIONS)
  d$pid <- factor(d$participant_id)
  d$hours <- d$actual_minutes / 60
  # Session order: centered at each participant's mean, per 10 sessions.
  d$order_c <- (d$session_number - stats::ave(d$session_number, d$pid)) / 10
  tod <- ifelse(d$start_hour < 12, "morning", ifelse(d$start_hour < 17, "afternoon", "evening"))
  d$tod <- droplevels(factor(tod, levels = c("afternoon", "morning", "evening")))
  d$distraction_per_hour <- d$distraction_minutes / d$hours
  d
}

# "condition + order_c + tod" (tod left out if the data has only one band).
fixed_terms <- function(d) {
  terms <- c("condition", "order_c")
  if (nlevels(droplevels(factor(d$tod))) > 1) terms <- c(terms, "tod")
  paste(terms, collapse = " + ")
}

# A GitHub-style markdown table from a data frame (numbers to 3 significant digits).
md_table <- function(df) {
  fmt <- function(x) {
    if (is.numeric(x)) ifelse(is.na(x), "", formatC(x, digits = 3, format = "g"))
    else ifelse(is.na(x), "", as.character(x))
  }
  cols <- lapply(df, fmt)
  rows <- do.call(paste, c(cols, sep = " | "))
  c(paste0("| ", paste(names(df), collapse = " | "), " |"),
    paste0("|", paste(rep("---", ncol(df)), collapse = "|"), "|"),
    paste0("| ", rows, " |"))
}
