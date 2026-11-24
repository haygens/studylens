/**
 * All server data access goes through this interface. Two implementations:
 * - `createSqlDb` (sql-db.ts): libSQL — Turso in production, a local file for dev/tests.
 * - `createMemoryDb` (memory.ts): in-memory stub for quick dev without a database file.
 *
 * P15: devices, error logs, rate limits, cleanup. P16: groups and memberships. P18/P18b methods are
 * added with their endpoints (the schema for them already exists, schema.ts).
 */
import type { GroupRole, GroupSummary } from '@studylens/shared';

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
}

export interface NewGroup {
  id: string;
  name: string;
  /** Normalized join code (see @studylens/shared `isJoinCode`). */
  joinCode: string;
  /** The creator, who becomes the owner and first member. */
  deviceId: string;
  createdAt: number;
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

export type { GroupRole, GroupSummary };

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
  deleteDevice(id: string): Promise<void>;

  /** Creates a group with the creator as owner, unless the device is in too many groups. */
  createGroup(group: NewGroup, maxGroupsPerDevice: number): Promise<CreateGroupResult>;
  /** Joins by (normalized) join code, respecting both limits atomically. */
  joinGroup(
    joinCode: string,
    deviceId: string,
    now: number,
    limits: GroupLimits,
  ): Promise<JoinGroupResult>;
  /** The device's groups with their members (oldest membership first). */
  listGroups(deviceId: string): Promise<GroupSummary[]>;
  /**
   * Removes the device from the group. Returns false if it wasn't a member. An empty group is
   * deleted; if the owner left, the longest-standing member becomes the owner.
   */
  leaveGroup(groupId: string, deviceId: string): Promise<boolean>;

  addErrorLog(entry: NewErrorLog): Promise<void>;
  /** Newest first. */
  listErrorLogs(limit?: number): Promise<ErrorLog[]>;

  /** Adds one hit to the counter for `key` in the window starting at `windowStart`; returns the new count. */
  hitRateLimit(key: string, windowStart: number): Promise<number>;

  /** Retention job (daily Vercel Cron). See retention.ts for the rules. */
  cleanup(now: number): Promise<CleanupResult>;

  close(): Promise<void>;
}
