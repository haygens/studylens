# StudyLens analysis (P19b)

> **DRAFT – not registered; pending advisor and IRB review.** The scripts implement the analysis
> plan in [docs/research/preregistration.md](../docs/research/preregistration.md). Until IRB
> approval they only ever run on **simulated** data or the author's own pilot CSV. Never commit a
> participant's CSV to this repository.

| Script       | What it does                                                                                                                                                      | Output (in `analysis/output/`, gitignored)    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `common.R`   | Shared: the 22 research CSV columns, reading/writing, the preregistered exclusions, derived variables                                                             | —                                             |
| `simulate.R` | Fake study data with the exact CSV columns and stated effect-size assumptions (`sim_assumptions`), including group/opted-out/short sessions and skipped check-ins | `simulated-research.csv`                      |
| `analyze.R`  | Reads a research CSV, applies the exclusions, fits every preregistered model (H1a, H1b, H2, H3, goal completion, robustness), Holm-corrects H1                    | `results.csv`, `results.md`, `exclusions.csv` |
| `power.R`    | Simulation-based power for H1a at N = 8, 12, 20, 30 × 5 or 8 sessions per condition                                                                               | `power-results.csv`, `power-results.md`       |

## Packages

R ≥ 4.3 with **glmmTMB** (negative binomial and Tweedie GLMMs), **lme4** (binomial GLMM, LMMs) and
**ordinal** (cumulative link mixed models). `common.R` and `simulate.R` need base R only.

```r
install.packages(c("glmmTMB", "lme4", "ordinal"))
```

## Running (from the repo root)

```powershell
Rscript analysis/simulate.R                      # → analysis/output/simulated-research.csv
Rscript analysis/analyze.R                       # analyses that file → results.md
Rscript analysis/power.R 100                     # 100 simulations per cell (a few minutes)
```

On a real export: `Rscript analysis/analyze.R path\to\studylens-research-2027-02-01.csv analysis/output`
(several participants' CSVs: combine them first; the header row is the same in every file).

Options: `simulate.R [out.csv] [participants] [sessions_per_condition]`,
`analyze.R [in.csv] [out_dir]`, `power.R [simulations_per_cell]`.

## In GitHub Actions

`.github/workflows/analysis.yml` (“Analysis (R)”) installs R and the packages and runs all three
scripts on simulated data whenever `analysis/` changes, or by hand (Actions → Analysis (R) → Run
workflow, with a custom number of simulations). The tables appear in the run's **summary**, and
`analysis/output/` is attached as the artifact `analysis-output`.

## Installing R locally on M: (no admin)

R isn't installed on the dev PC. To install it per-user on M: (nothing on C:):

1. Download the current Windows installer from <https://cloud.r-project.org/bin/windows/base/>
   (e.g. `R-4.x.y-win.exe`) into `M:\Downloads`.
2. Install for the current user only, into M::
   `& "M:\Downloads\R-4.x.y-win.exe" /CURRENTUSER /DIR="M:\Tools\R" /SILENT`
3. Keep packages on M: as well (the default user library is on C:):
   `[Environment]::SetEnvironmentVariable('R_LIBS_USER', 'M:\Tools\R-library', 'User')`
   then open a new PowerShell window.
4. Add R to this window's PATH and install the packages (binary packages, no Rtools needed):
   `$env:Path = "M:\Tools\R\bin;$env:Path"; New-Item -ItemType Directory -Force M:\Tools\R-library; Rscript -e "install.packages(c('glmmTMB','lme4','ordinal'), repos='https://cloud.r-project.org')"`
