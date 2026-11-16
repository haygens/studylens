/** Messages from the popup to the background script about focus sessions. */
import type { StartError } from './session';

export type SessionMessage =
  | { type: 'session:start'; goal: string; minutes: number }
  | { type: 'session:end-early' }
  /** The popup saw the countdown reach zero: end the session now if it is due. */
  | { type: 'session:check' };

export type SessionReply = { ok: true } | { ok: false; error: StartError | 'unknown' };

const TYPES = new Set(['session:start', 'session:end-early', 'session:check']);

export function isSessionMessage(value: unknown): value is SessionMessage {
  const v = value as { type?: unknown } | null;
  return typeof v === 'object' && v !== null && typeof v.type === 'string' && TYPES.has(v.type);
}
