/** Server-side retention rules, applied by the daily cleanup (`GET /api/cleanup`). */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Error logs are deleted after 14 days. */
export const ERROR_LOG_MAX_AGE_MS = 14 * DAY;

/**
 * A live group session's optional goal is cleared 24 h after the session ends: its `ended_at`
 * (everyone left early, or the cleanup marked it ended), else its shared end time `ends_at`. The
 * whole session and its participant rows are deleted at the same point (P18b): after that nobody
 * needs its summary. (The API already hides the goal from then on, even before the cleanup.)
 */
export const GOAL_AFTER_END_MS = 24 * HOUR;
export const LIVE_SESSION_KEEP_MS = GOAL_AFTER_END_MS;

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
