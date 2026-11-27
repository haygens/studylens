/**
 * Live group focus sessions (P18b): shapes and rules both the server (web/) and the extension
 * agree on. See docs/backend.md.
 *
 * Any member starts one for a group (optional goal visible to the group, a length); other members
 * join, late if they like. Everyone shares the SAME end time, set by the server's clock. The
 * participants list shows each person's status (focusing / finished / left) and, once they are
 * done, their focus minutes in the session — only if they share focus minutes in that group.
 * Never sites, labels, research conditions or check-in answers.
 */

/** At most this many characters of goal text (the database allows 120). */
export const LIVE_GOAL_MAX_LENGTH = 120;
/** The length choices offered: 25, 50, or a custom 5–180 minutes (the same as solo sessions). */
export const LIVE_PRESET_MINUTES = [25, 50] as const;
export const LIVE_MIN_MINUTES = 5;
export const LIVE_MAX_MINUTES = 180;
/** The popup and the Study groups tab poll this often while they are open (never otherwise). */
export const LIVE_POLL_MS = 15_000;
/** A session's goal is deleted this long after the session ended. */
export const LIVE_GOAL_KEEP_MS = 24 * 60 * 60_000;
/**
 * A focusing participant who hasn't sent a heartbeat for this long shows as "Away (last seen N min
 * ago)". The extension sends one on its 1-minute session tick, so this is about two missed ticks.
 */
export const LIVE_HEARTBEAT_STALE_MS = 2 * 60_000;

/**
 * P18c: every live session gets a room code for its read-only web page `/s/<code>`. 16 characters
 * from the join-code alphabet (29^16 ≈ 2.5 × 10^23 codes), made with a cryptographic random
 * generator, so the link can't be guessed. Valid until 1 hour after the session ended.
 */
export const ROOM_CODE_LENGTH = 16;
export const ROOM_VALID_AFTER_END_MS = 60 * 60_000;
/** The web room page polls this often while it is visible. */
export const ROOM_POLL_MS = 15_000;

const ROOM_CODE_PATTERN = new RegExp(`^[23456789ABCDEFGHJKMNPQRSTWXYZ]{${ROOM_CODE_LENGTH}}$`);

/** True for a well-formed room code (exact case: links are copied, never typed). */
export function isRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/** A participant's status. `finished` = was still in the session when it reached its end. */
export const PARTICIPANT_STATUSES = ['focusing', 'finished', 'left'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

/** One participant as the members of the group see them. Never a device ID. */
export interface LiveParticipant {
  displayName: string;
  isMe: boolean;
  /** Started the session. The session keeps running if the host leaves. */
  isHost: boolean;
  status: ParticipantStatus;
  /** False while focusing but no heartbeat for 2 minutes (offline or the browser closed). */
  recentlySeen: boolean;
  /**
   * Whole minutes since the last heartbeat, only while focusing and not recently seen (for
   * "Away (last seen N min ago)"); otherwise null.
   */
  lastSeenMinutesAgo: number | null;
  /**
   * Whole minutes from joining to leaving or to the end, once the participant is done
   * (`finished` or `left`). Null while still focusing, or when the participant doesn't share focus
   * minutes in this group ("not shared").
   */
  focusMinutes: number | null;
}

export interface LiveSession {
  id: string;
  groupId: string;
  groupName: string;
  /** Optional goal, visible to the group. Null when none was given or after it was deleted. */
  goal: string | null;
  plannedMinutes: number;
  /** Epoch ms, server clock. */
  startedAt: number;
  /** The shared end time, epoch ms, server clock. */
  endsAt: number;
  /**
   * `running` until `endsAt`, or until nobody is focusing in it any more (everyone left early);
   * then `ended`.
   */
  state: 'running' | 'ended';
  /** My status, or null if I haven't joined. */
  me: ParticipantStatus | null;
  /** Oldest participant first. */
  participants: LiveParticipant[];
  /** P18c: the code of the read-only room page `/s/<code>` (members only see it). */
  roomCode: string | null;
}

/** P18c: a participant on the public room page: name and status only (no minutes, no "me"). */
export interface RoomParticipant {
  displayName: string;
  isHost: boolean;
  status: ParticipantStatus;
  recentlySeen: boolean;
  lastSeenMinutesAgo: number | null;
}

/** P18c: what anyone with the room link sees. */
export interface LiveRoom {
  groupName: string;
  goal: string | null;
  plannedMinutes: number;
  startedAt: number;
  endsAt: number;
  state: 'running' | 'ended';
  participants: RoomParticipant[];
}

/** GET /api/rooms/:code */
export interface LiveRoomResponse {
  serverNow: number;
  room: LiveRoom;
}

/** Every live-session answer carries the server's clock, so the extension can correct for skew. */
export interface LiveSessionResponse {
  serverNow: number;
  session: LiveSession;
}

/** GET /api/group-sessions — running sessions in my groups (at most one per group). */
export interface ActiveLiveSessionsResponse {
  serverNow: number;
  sessions: LiveSession[];
}

/** POST /api/groups/:id/sessions */
export interface StartLiveSessionRequest {
  goal?: string;
  minutes: number;
}

/**
 * The offset to add to the local clock to get the server's clock, from one request: the server's
 * time minus the middle of the request (assumes the request took as long going as coming back).
 */
export function clockOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  return Math.round(serverNow - (sentAt + receivedAt) / 2);
}

/** A server time in the local clock. */
export function toLocalTime(serverTime: number, offsetMs: number): number {
  return serverTime - offsetMs;
}

/**
 * The words for a participant who is still in the session: "Focusing" while their heartbeat is
 * fresh, "Away (last seen N min ago)" after about 2 minutes without one. Used by both the web
 * room page and the extension.
 */
export function focusingStatusText(
  p: Pick<LiveParticipant, 'recentlySeen' | 'lastSeenMinutesAgo'>,
): string {
  if (p.recentlySeen) return 'Focusing';
  const minutes = Math.max(LIVE_HEARTBEAT_STALE_MS / 60_000, p.lastSeenMinutesAgo ?? 0);
  return `Away (last seen ${minutes} min ago)`;
}

/** True for a whole number of minutes a live session may last. */
export function isLiveMinutes(minutes: unknown): minutes is number {
  return (
    typeof minutes === 'number' &&
    Number.isInteger(minutes) &&
    minutes >= LIVE_MIN_MINUTES &&
    minutes <= LIVE_MAX_MINUTES
  );
}
