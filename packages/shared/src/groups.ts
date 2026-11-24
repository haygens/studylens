/**
 * Study groups (P16): shapes and rules both the server (web/) and the extension agree on.
 * See docs/backend.md. No browsing data ever appears here: only display names, group names,
 * join codes and membership.
 */

export const GROUP_NAME_MAX_LENGTH = 40;
/** A group never has more members than this. */
export const MAX_GROUP_MEMBERS = 20;
/** A device can be in at most this many groups (including the ones it created). */
export const MAX_GROUPS_PER_DEVICE = 5;

/**
 * Join codes: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L, U/V).
 * 30^8 ≈ 6.6 × 10^11 codes, and join attempts are rate-limited, so guessing doesn't work.
 * Case-insensitive; spaces and dashes are ignored, so `abcd-efgh` = `ABCDEFGH`.
 */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ' as const;
export const JOIN_CODE_LENGTH = 8;
const JOIN_CODE_PATTERN = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);

/** Uppercase, without spaces or dashes. Doesn't check the characters (see `isJoinCode`). */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

/** True for a normalized, well-formed join code. */
export function isJoinCode(code: string): boolean {
  return JOIN_CODE_PATTERN.test(code);
}

/** `ABCDEFGH` → `ABCD-EFGH` (easier to read out loud and type). */
export function formatJoinCode(code: string): string {
  const c = normalizeJoinCode(code);
  return c.length === JOIN_CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export type GroupRole = 'owner' | 'member';

export interface GroupMember {
  displayName: string;
  role: GroupRole;
  /** True for the device asking. Other members' device IDs are never sent. */
  isMe: boolean;
}

export interface GroupSummary {
  id: string;
  name: string;
  /** Normalized (no dash). Show it with `formatJoinCode`. */
  joinCode: string;
  /** My role in this group. */
  role: GroupRole;
  /** Epoch ms. */
  joinedAt: number;
  /** Oldest member first. */
  members: GroupMember[];
}

/** POST /api/groups */
export interface CreateGroupRequest {
  name: string;
}

/** POST /api/groups/join — `code` may be lowercase and contain spaces or a dash. */
export interface JoinGroupRequest {
  code: string;
}

/** POST /api/groups (201) and POST /api/groups/join (200; 201 when newly joined). */
export interface GroupResponse {
  group: GroupSummary;
}

/** GET /api/groups */
export interface ListGroupsResponse {
  me: { displayName: string };
  /** Oldest membership first. */
  groups: GroupSummary[];
}

/** PATCH /api/devices/me */
export interface UpdateDeviceRequest {
  displayName: string;
}

export interface UpdateDeviceResponse {
  displayName: string;
}

/** DELETE /api/devices/me — everything the server had about this device is gone. */
export interface DeleteDeviceResponse {
  ok: true;
}
