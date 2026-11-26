/**
 * All server data access goes through this interface. Two implementations:
 * - `createSqlDb` (sql-db.ts): libSQL — Turso in production, a local file for dev/tests.
 * - `createMemoryDb` (memory.ts): in-memory stub for quick dev without a database file.
 *
 * P15: devices, error logs, rate limits, cleanup. P16: groups and memberships. P18: sharing
 * switches, daily totals, presence, group overview. P18b: live group focus sessions.
 */
import type {
  DailyTotal,
  GroupRole,
  GroupSharing,
  GroupSummary,
  LiveRoom,
  LiveSession,
  OverviewMember,
  PresenceState,
} from '@studylens/shared';

export interface Device {
  id: string;
  displayName: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds. */
  lastSeenAt: number;
}

export interface NewDevice {
  id: string;
  displayName: string;
  /** SHA-256 hex of the bearer token. The token itself is never stored. */
  tokenHash: string;
  createdAt: number;
}

export type ErrorSource = 'server' | 'extension';

export interface NewErrorLog {
  source: ErrorSource;
  /** Server route (`/api/devices`) or extension page (`popup`). */
  route: string | null;
  /** Already scrubbed (no URLs, domains, emails or IPs) and at most 500 characters. */
  message: string;
  extensionVersion: string | null;
  createdAt: number;
}

export interface ErrorLog extends NewErrorLog {
  id: number;
}

export interface CleanupResult {
  errorLogsDeleted: number;
  goalsCleared: number;
  presenceRowsDeleted: number;
  participantRowsDeleted: number;
  rateLimitRowsDeleted: number;
  dailyTotalsDeleted: number;
  /** P18b: live sessions past their end time, marked ended (participants still in: finished). */
  groupSessionsEnded: number;
  /** P18b: live sessions (with their participants) deleted 24 h after they ended. */
  groupSessionsDeleted: number;
}

/** P18b: a new live group session. The host joins it at once. */
export interface NewLiveSession {
  id: string;
  groupId: string;
  hostDeviceId: string;
  goal: string | null;
  /** 5–180 (the E2E test server: rounded up from its seconds, at least 1). */
  plannedMinutes: number;
  startedAt: number;
  /** The shared end time (server clock). */
  endsAt: number;
  /** P18c: room page code (16 characters, unique). */
  roomCode: string;
}

export type StartLiveSessionResult =
  | { status: 'started' }
  /** Not a member of the group (or it doesn't exist). */
  | { status: 'not_member' }
  /** The group already has a running live session. */
  | { status: 'session_running' }
  /** I'm still focusing in another live session (one at a time). */
  | { status: 'busy' };

export interface NewGroup {
  id: string;
  name: string;
  /** Normalized join code (see @studylens/shared `isJoinCode`). */
  joinCode: string;
  /** The creator, who becomes the owner and first member. */
  deviceId: string;
  createdAt: number;
  /** The creator's switches (P18). */
  sharing: GroupSharing;
}

export type CreateGroupResult =
  | { status: 'created' }
  /** The device is already in `MAX_GROUPS_PER_DEVICE` groups. */
  | { status: 'too_many_groups' }
  /** Another group has this join code: try again with a new one. */
  | { status: 'code_taken' };

export type JoinGroupResult =
  | { status: 'joined'; groupId: string }
  | { status: 'already_member'; groupId: string }
  | { status: 'not_found' }
  | { status: 'group_full' }
  | { status: 'too_many_groups' };

export interface GroupLimits {
  maxMembers: number;
  maxGroupsPerDevice: number;
}

export interface GroupOverview {
  group: { id: string; name: string };
  members: OverviewMember[];
}

export interface OverviewQuery {
  /** Epoch ms: presence counts only while `expires_at` is later than this. */
  now: number;
  /** The viewer's local date; history covers `historyDays` dates ending on it. */
  today: string;
  historyDays: number;
}

export type { GroupRole, GroupSharing, GroupSummary, LiveSession };

export interface Db {
  /** Throws if the database can't be reached. */
  ping(): Promise<void>;

  /** Throws if the token hash is already used (practically impossible for random tokens). */
  createDevice(device: NewDevice): Promise<void>;
  findDeviceByTokenHash(tokenHash: string): Promise<Device | null>;
  touchDevice(id: string, now: number): Promise<void>;
  updateDisplayName(id: string, displayName: string): Promise<void>;
  /**
   * Deletes the device and everything linked to it: memberships, presence, daily totals, live
   * session participation. Groups it was the last member of are deleted; in other groups the
   * longest-standing member becomes the owner if the device was the owner.
   */
  deleteDevice(id: string, now?: number): Promise<void>;

  /** Creates a group with the creator as owner, unless the device is in too many groups. */
  createGroup(group: NewGroup, maxGroupsPerDevice: number): Promise<CreateGroupResult>;
  /**
   * Joins by (normalized) join code, respecting both limits atomically. `sharing` applies only to
   * a new membership (an existing member keeps their switches).
   */
  joinGroup(
    joinCode: string,
    deviceId: string,
    now: number,
    limits: GroupLimits,
    sharing: GroupSharing,
  ): Promise<JoinGroupResult>;
  /** The device's groups with their members (oldest membership first). */
  listGroups(deviceId: string): Promise<GroupSummary[]>;
  /**
   * Removes the device from the group. Returns false if it wasn't a member. An empty group is
   * deleted; if the owner left, the longest-standing member becomes the owner. Daily totals and
   * presence that no remaining group of the device shares any more are deleted at once (P18).
   * The device also drops out of the group's live sessions (P18b); a session nobody is focusing
   * in any more ends.
   */
  leaveGroup(groupId: string, deviceId: string, now?: number): Promise<boolean>;

  /**
   * P18: changes my switches for one group (only the ones given). Returns the new switches, or
   * null if I'm not a member. Data no group shares any more is deleted at once.
   */
  updateSharing(
    groupId: string,
    deviceId: string,
    patch: Partial<GroupSharing>,
  ): Promise<GroupSharing | null>;
  /**
   * P18: saves daily focus minutes (insert or replace per date), but only if at least one of the
   * device's groups has "Share my focus minutes" on; otherwise deletes any it had. Returns the
   * number of days saved.
   */
  upsertDailyTotals(deviceId: string, days: DailyTotal[], now: number): Promise<number>;
  /**
   * P18: `start`/`heartbeat` mark the device as focusing until `now + ttlMs` (only if a group
   * shares it); `stop` deletes the row. Returns whether the device now counts as focusing.
   */
  setPresence(deviceId: string, state: PresenceState, now: number, ttlMs: number): Promise<boolean>;
  /** P18: what the members of a group see about each other; null if I'm not a member. */
  groupOverview(groupId: string, deviceId: string, q: OverviewQuery): Promise<GroupOverview | null>;
  /** P18: other members (any of my groups, counted once) focusing now who share it with me. */
  countFocusingNow(deviceId: string, now: number): Promise<number>;

  /**
   * P18b: starts a live session in a group I'm in, unless one is already running there (checked
   * in the same INSERT, so two members starting at once can't both succeed). I join it as host.
   */
  startLiveSession(session: NewLiveSession): Promise<StartLiveSessionResult>;
  /** P18b: the running live sessions in my groups (at most one per group), oldest group first. */
  listLiveSessions(deviceId: string, now: number): Promise<LiveSession[]>;
  /** P18b: one live session as I see it; null if it doesn't exist or I'm not in its group. */
  liveSession(sessionId: string, deviceId: string, now: number): Promise<LiveSession | null>;
  /**
   * P18b: joins a running session of one of my groups. Returns true if I was added now; false if
   * I was already in it (heartbeat refreshed), had left it, or it isn't running / isn't mine.
   */
  joinLiveSession(sessionId: string, deviceId: string, now: number): Promise<boolean>;
  /**
   * P18b: I leave early (status `left`). Returns true if my status changed. When nobody is
   * focusing any more, the session ends.
   */
  leaveLiveSession(sessionId: string, deviceId: string, now: number): Promise<boolean>;
  /** P18b: I'm still focusing in it. Returns true if my heartbeat was recorded. */
  heartbeatLiveSession(sessionId: string, deviceId: string, now: number): Promise<boolean>;
  /**
   * P18c: the public room view for a room code, or null if unknown or more than 1 hour past the
   * session's end. Names and statuses only.
   */
  liveRoom(roomCode: string, now: number): Promise<LiveRoom | null>;

  addErrorLog(entry: NewErrorLog): Promise<void>;
  /** Newest first. */
  listErrorLogs(limit?: number): Promise<ErrorLog[]>;

  /** Adds one hit to the counter for `key` in the window starting at `windowStart`; returns the new count. */
  hitRateLimit(key: string, windowStart: number): Promise<number>;

  /** Retention job (daily Vercel Cron). See retention.ts for the rules. */
  cleanup(now: number): Promise<CleanupResult>;

  close(): Promise<void>;
}
