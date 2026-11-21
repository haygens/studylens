/**
 * "Export for research (CSV)" (P13c): one row per finished focus session, for the analysis script
 * (P19b). Pure — the My Data page turns the result into a download. Every column is documented in
 * docs/research/codebook.md; keep the two in sync (a unit test checks the column list).
 *
 * Privacy: numbers and fixed words only. No goal text, no site names, no web addresses, no exact
 * times (the start is reduced to the local date and hour). The participant ID is random, made on
 * this device, and not linked to anything. Nothing is sent anywhere: the file is only downloaded.
 */
import type { FocusSession } from '../sessions/session';
import { meanDwellSeconds } from '../interventions/attempts';
import { isInterstitialMode } from '../interventions/interstitial';
import { STORAGE_KEYS } from '../storage/keys';
import { asHistory } from '../storage/sessions-store';

/** The CSV columns, in order. docs/research/codebook.md documents each one. */
export const RESEARCH_COLUMNS = [
  'participant_id',
  'session_number',
  'mode',
  'condition',
  'start_date',
  'start_hour',
  'planned_minutes',
  'actual_minutes',
  'study_minutes',
  'neutral_minutes',
  'distraction_minutes',
  'distraction_visits',
  'attempts',
  'continued',
  'turned_back',
  'mean_dwell_seconds',
  'focus_rating',
  'goal_completed',
  'checkin_status',
  'ended_early',
  'label_set_version',
  'labels_locked',
] as const;

export type ResearchColumn = (typeof RESEARCH_COLUMNS)[number];
type Cell = string | number | null;
export type ResearchRow = Record<ResearchColumn, Cell>;

const round1 = (n: number) => Math.round(n * 10) / 10;
const pad = (n: number) => String(n).padStart(2, '0');

/** Local `YYYY-MM-DD`. */
function localDate(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** One row. `position` (1-based place in the history) numbers sessions from before v0.4.0. */
export function researchRow(participantId: string, s: FocusSession, position: number): ResearchRow {
  const helper = isInterstitialMode(s.condition);
  const checkIn = s.checkIn;
  const answered = checkIn && !('skipped' in checkIn) ? checkIn : null;
  return {
    participant_id: participantId,
    session_number: s.sessionNumber ?? position,
    mode: s.mode,
    condition: s.condition ?? 'none',
    start_date: localDate(s.start),
    start_hour: new Date(s.start).getHours(),
    planned_minutes: round1(s.plannedMinutes),
    actual_minutes: round1((s.actualEnd - s.start) / 60_000),
    study_minutes: round1(s.minutesByCategory.study),
    neutral_minutes: round1(s.minutesByCategory.neutral),
    distraction_minutes: round1(s.minutesByCategory.distraction),
    distraction_visits: s.distractionVisits,
    attempts: s.distractionAttempts,
    continued: helper ? s.frictionContinued + s.intentionContinued : null,
    turned_back: helper ? s.frictionTurnedBack + s.intentionTurnedBack : null,
    mean_dwell_seconds: helper ? meanDwellSeconds(s.attempts) : null,
    focus_rating: answered?.focusRating ?? null,
    goal_completed: answered?.goalCompleted ?? null,
    checkin_status: checkIn === null ? 'pending' : answered ? 'answered' : 'skipped',
    ended_early: s.endedEarly ? 1 : 0,
    label_set_version: s.labelSetVersion,
    labels_locked: s.labelsLocked ? 1 : 0,
  };
}

/** Every finished session, in session order. */
export function researchRows(
  stored: Record<string, unknown>,
  participantId: string,
): ResearchRow[] {
  return asHistory(stored[STORAGE_KEYS.sessionHistory])
    .map((s, i) => researchRow(participantId, s, i + 1))
    .sort((a, b) => Number(a.session_number) - Number(b.session_number));
}

/** RFC 4180 quoting (values are numbers and fixed words, but stay safe anyway). */
function csvCell(value: Cell): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The CSV text: a header row, then one row per session. Lines end with CRLF. */
export function researchCsv(stored: Record<string, unknown>, participantId: string): string {
  const lines = [RESEARCH_COLUMNS.join(',')];
  for (const row of researchRows(stored, participantId)) {
    lines.push(RESEARCH_COLUMNS.map((c) => csvCell(row[c])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** `studylens-research-2026-11-21.csv`, using the local date. */
export function researchFileName(now: number): string {
  return `studylens-research-${localDate(now)}.csv`;
}
