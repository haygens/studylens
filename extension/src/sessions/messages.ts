/** Messages from the popup to the background script about focus sessions. */
import type { CheckInError } from './check-in';
import type { StartError } from './session';

export type SessionMessage =
  | {
      type: 'session:start';
      goal: string;
      minutes: number;
      /** Honored only by the E2E test build (src/e2e/test-seconds.ts). */
      testSeconds?: number;
    }
  | { type: 'session:end-early' }
  /** The popup saw the countdown reach zero: end the session now if it is due. */
  | { type: 'session:check' }
  /** End-of-session check-in answers (P5). The background validates them. */
  | { type: 'checkin:answer'; sessionId: string; goalCompleted: unknown; focusRating: unknown }
  | { type: 'checkin:skip'; sessionId: string }
  /** My Data (P6): delete everything, ending any running session without a check-in. */
  | { type: 'data:delete-all' };

export type SessionReply =
  { ok: true } | { ok: false; error: StartError | CheckInError | 'unknown' };

const TYPES = new Set([
  'session:start',
  'session:end-early',
  'session:check',
  'checkin:answer',
  'checkin:skip',
  'data:delete-all',
]);

export function isSessionMessage(value: unknown): value is SessionMessage {
  const v = value as { type?: unknown } | null;
  return typeof v === 'object' && v !== null && typeof v.type === 'string' && TYPES.has(v.type);
}
