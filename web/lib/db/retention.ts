/** Server-side retention rules, applied by the daily cleanup (`GET /api/cleanup`). */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Error logs are deleted after 14 days. */
export const ERROR_LOG_MAX_AGE_MS = 14 * DAY;

/**
 * A group session's optional goal is cleared 24 h after the session ends: its `ended_at`, or — if
 * the host never ended it — its planned end (`started_at + planned_minutes`).
 */
export const GOAL_AFTER_END_MS = 24 * HOUR;

/** Live-session participant rows with no heartbeat for 24 h are deleted. */
export const PARTICIPANT_STALE_MS = 24 * HOUR;

/** Rate-limit counters are deleted once their window started more than a day ago. */
export const RATE_LIMIT_ROW_MAX_AGE_MS = DAY;

/**
 * Daily focus totals (P18) are kept for 14 days: rows whose local date is more than 14 days before
 * the cleanup's UTC date are deleted. (Leaving a group, turning sharing off, or deleting the
 * device removes them immediately.)
 */
export { DAILY_TOTALS_KEEP_DAYS } from '@studylens/shared';

// Expired `device_presence` rows (`expires_at` in the past) are deleted too; no constant needed.
