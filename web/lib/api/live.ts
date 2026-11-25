/**
 * Live group focus sessions (P18b): request validation, path parsing and the errors the routes
 * share. See docs/backend.md.
 */
import {
  LIVE_GOAL_MAX_LENGTH,
  LIVE_MAX_MINUTES,
  LIVE_MIN_MINUTES,
  type LiveSession,
  type LiveSessionResponse,
} from '@studylens/shared';
import { z } from 'zod';
import { ApiError } from './errors';

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** The E2E test server's longest test session (the extension's MAX_TEST_SECONDS). */
const MAX_TEST_SECONDS = 600;

/** Optional goal: trimmed, single-spaced, ≤120 characters, no invisible characters, email or URL. */
export const liveGoalSchema = z
  .string()
  .transform((s) => s.normalize('NFC').trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .max(LIVE_GOAL_MAX_LENGTH, `The goal can be at most ${LIVE_GOAL_MAX_LENGTH} characters.`)
      .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), 'The goal has invisible characters.')
      .refine((s) => !EMAIL_LIKE.test(s), 'Leave email addresses out of the goal.')
      .refine((s) => !/:\/\//.test(s), 'Leave web addresses out of the goal.'),
  );

const minutesSchema = z
  .number()
  .int('Pick a whole number of minutes.')
  .min(LIVE_MIN_MINUTES, `Pick ${LIVE_MIN_MINUTES}–${LIVE_MAX_MINUTES} minutes.`)
  .max(LIVE_MAX_MINUTES, `Pick ${LIVE_MIN_MINUTES}–${LIVE_MAX_MINUTES} minutes.`);

/**
 * True only on the local E2E test server (`STUDYLENS_LIVE_TEST_SECONDS=1`, set by
 * extension/e2e/web-server.ts), never on Vercel or in a production build: there a `testSeconds`
 * field is an unknown field and rejected like any other.
 */
export function testSecondsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STUDYLENS_LIVE_TEST_SECONDS === '1' && !env.VERCEL && env.NODE_ENV !== 'production';
}

/** POST /api/groups/:id/sessions. Strict: unknown fields are rejected. */
export function startLiveSchema(allowTestSeconds = testSecondsAllowed()) {
  const base = { goal: liveGoalSchema.optional(), minutes: minutesSchema };
  return allowTestSeconds
    ? z.strictObject({
        ...base,
        testSeconds: z.number().int().min(1).max(MAX_TEST_SECONDS).optional(),
      })
    : z.strictObject(base);
}

/** The planned minutes and shared end time of a new session. */
export function liveLength(
  body: { minutes: number; testSeconds?: number },
  now: number,
): { plannedMinutes: number; endsAt: number } {
  if (body.testSeconds !== undefined) {
    return {
      plannedMinutes: Math.max(1, Math.ceil(body.testSeconds / 60)),
      endsAt: now + body.testSeconds * 1000,
    };
  }
  return { plannedMinutes: body.minutes, endsAt: now + body.minutes * 60_000 };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The `[id]` of /api/group-sessions/<id> (`sub` = null) or /api/group-sessions/<id>/<sub>, or null
 * if it isn't a session ID.
 */
export function liveIdFromPath(pathname: string, sub: 'join' | 'leave' | 'heartbeat' | null) {
  const m = /^\/api\/group-sessions\/([^/]+)(?:\/([a-z]+))?\/?$/.exec(pathname);
  const id = m?.[1];
  return id && (m[2] ?? null) === sub && UUID.test(id) ? id : null;
}

/** 404 for a session that doesn't exist or isn't in one of my groups (the same answer). */
export const liveNotFound = () =>
  new ApiError(404, 'not_found', 'This live session doesn’t exist, or it isn’t in your groups.');

export const notInLiveSession = () =>
  new ApiError(404, 'not_found', 'You aren’t in this live session.');

export function liveSessionRunning(): ApiError {
  return new ApiError(
    409,
    'session_running',
    'This group already has a live session. Join it instead, or start one when it’s over.',
  );
}

export function liveBusy(): ApiError {
  return new ApiError(
    409,
    'session_running',
    'You’re already in another live session. Leave it first.',
  );
}

export function liveOver(left: boolean): ApiError {
  return new ApiError(
    409,
    'session_over',
    left
      ? 'You left this live session, so you can’t join it again. Join or start the next one.'
      : 'This live session is over.',
  );
}

/** A live-session answer with the server's clock (read as late as possible). */
export function liveResponse(session: LiveSession, status = 200): Response {
  const body: LiveSessionResponse = { serverNow: Date.now(), session };
  return Response.json(body, { status });
}
