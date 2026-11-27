/**
 * Builds what members see about a live group session (P18b) from plain rows, shared by the SQL
 * and in-memory `Db`s so both apply the same rules. Device IDs are used only to match rows here;
 * they never leave the server.
 *
 * Rules:
 * - A session is `running` until its shared end time, or until nobody is focusing in it any more
 *   (everyone left early, or the last participants left the group); then `ended`.
 * - A participant still `focusing` at the end time counts as `finished` (the daily cleanup also
 *   writes that down).
 * - Minutes in the session come from the server's own times: join → leave, or join → end. They
 *   are shown only once the participant is done, and only if they share focus minutes in this
 *   group (P18 switch); otherwise `null` = "not shared".
 * - The goal is hidden 24 h after the end, even before the daily cleanup deletes it.
 */
import {
  LIVE_GOAL_KEEP_MS,
  LIVE_HEARTBEAT_STALE_MS,
  ROOM_VALID_AFTER_END_MS,
  type LiveParticipant,
  type LiveRoom,
  type LiveSession,
  type ParticipantStatus,
} from '@studylens/shared';

export interface LiveSessionRow {
  id: string;
  groupId: string;
  groupName: string;
  hostDeviceId: string | null;
  goal: string | null;
  plannedMinutes: number;
  startedAt: number;
  endsAt: number;
  endedAt: number | null;
  /** P18c (null for sessions from before migration 4). */
  roomCode: string | null;
}

export interface LiveParticipantRow {
  deviceId: string;
  displayName: string;
  status: ParticipantStatus;
  joinedAt: number;
  lastHeartbeatAt: number;
  leftAt: number | null;
  /** "Share my focus minutes" is on for this group (false if no longer a member). */
  sharesMinutes: boolean;
}

const MINUTE = 60_000;

/** The status as of `now`: still focusing past the end time means finished. */
export function effectiveStatus(
  p: Pick<LiveParticipantRow, 'status'>,
  s: Pick<LiveSessionRow, 'endsAt'>,
  now: number,
): ParticipantStatus {
  return p.status === 'focusing' && now >= s.endsAt ? 'finished' : p.status;
}

/** True while the session is running at `now` (the same rule as `RUNNING_SQL` in sql-db.ts). */
export function isRunning(
  s: Pick<LiveSessionRow, 'endsAt' | 'endedAt'>,
  participants: readonly Pick<LiveParticipantRow, 'status'>[],
  now: number,
): boolean {
  return s.endedAt === null && now < s.endsAt && participants.some((p) => p.status === 'focusing');
}

function minutesOf(p: LiveParticipantRow, s: LiveSessionRow, status: ParticipantStatus) {
  if (!p.sharesMinutes || status === 'focusing') return null;
  const end = status === 'left' ? (p.leftAt ?? p.joinedAt) : s.endsAt;
  return Math.max(0, Math.floor((end - p.joinedAt) / MINUTE));
}

export function buildLiveSession(
  s: LiveSessionRow,
  participants: readonly LiveParticipantRow[],
  viewerId: string,
  now: number,
): LiveSession {
  const sorted = [...participants].sort(
    (a, b) => a.joinedAt - b.joinedAt || (a.deviceId < b.deviceId ? -1 : 1),
  );
  const running = isRunning(s, sorted, now);
  const view = sorted.map((p): LiveParticipant => {
    const status = effectiveStatus(p, s, now);
    const sinceHeartbeat = Math.max(0, now - p.lastHeartbeatAt);
    const recentlySeen = status !== 'focusing' || sinceHeartbeat < LIVE_HEARTBEAT_STALE_MS;
    return {
      displayName: p.displayName,
      isMe: p.deviceId === viewerId,
      isHost: p.deviceId === s.hostDeviceId,
      status,
      recentlySeen,
      lastSeenMinutesAgo: recentlySeen ? null : Math.floor(sinceHeartbeat / MINUTE),
      focusMinutes: minutesOf(p, s, status),
    };
  });
  const endedAt = s.endedAt ?? s.endsAt;
  const me = sorted.find((p) => p.deviceId === viewerId);
  return {
    id: s.id,
    groupId: s.groupId,
    groupName: s.groupName,
    goal: endedAt + LIVE_GOAL_KEEP_MS < now ? null : s.goal,
    plannedMinutes: s.plannedMinutes,
    startedAt: s.startedAt,
    endsAt: s.endsAt,
    state: running ? 'running' : 'ended',
    me: me ? effectiveStatus(me, s, now) : null,
    participants: view,
    roomCode: s.roomCode,
  };
}

/**
 * P18c: when a room link stops working: 1 hour after the session ended (everyone left early: then;
 * otherwise its shared end time).
 */
export function roomExpiresAt(s: Pick<LiveSessionRow, 'endsAt' | 'endedAt'>): number {
  return Math.min(s.endedAt ?? s.endsAt, s.endsAt) + ROOM_VALID_AFTER_END_MS;
}

/** P18c: the public room view (no device IDs, no minutes, no "me"); null once expired. */
export function buildLiveRoom(
  s: LiveSessionRow,
  participants: readonly LiveParticipantRow[],
  now: number,
): LiveRoom | null {
  if (now >= roomExpiresAt(s)) return null;
  const view = buildLiveSession(s, participants, '', now);
  return {
    groupName: view.groupName,
    goal: view.goal,
    plannedMinutes: view.plannedMinutes,
    startedAt: view.startedAt,
    endsAt: view.endsAt,
    state: view.state,
    participants: view.participants.map((p) => ({
      displayName: p.displayName,
      isHost: p.isHost,
      status: p.status,
      recentlySeen: p.recentlySeen,
      lastSeenMinutesAgo: p.lastSeenMinutesAgo,
    })),
  };
}
