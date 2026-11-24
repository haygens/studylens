import type { GroupRole, GroupSummary } from '@studylens/shared';
import { ERROR_LOG_MAX_AGE_MS, RATE_LIMIT_ROW_MAX_AGE_MS } from './retention';
import type { Db, Device, ErrorLog } from './types';

interface StoredGroup {
  id: string;
  name: string;
  joinCode: string;
  createdBy: string | null;
  createdAt: number;
}

interface Membership {
  groupId: string;
  deviceId: string;
  role: GroupRole;
  joinedAt: number;
}

/**
 * In-memory stub. Data is lost on restart — for local development without a database file and
 * for quick tests. It has devices, groups and memberships (P16) but none of the P18/P18b tables
 * yet, so cleanup only touches error logs and rate limits.
 */
export function createMemoryDb(): Db {
  const devices = new Map<string, Device & { tokenHash: string }>();
  const groups = new Map<string, StoredGroup>();
  let memberships: Membership[] = [];
  const errorLogs: ErrorLog[] = [];
  const rateLimits = new Map<string, { windowStart: number; count: number }>();
  let nextErrorId = 1;

  const byJoinOrder = (a: Membership, b: Membership) =>
    a.joinedAt - b.joinedAt || (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0);
  const membersOf = (groupId: string) =>
    memberships.filter((m) => m.groupId === groupId).sort(byJoinOrder);
  const groupCount = (deviceId: string) =>
    memberships.filter((m) => m.deviceId === deviceId).length;

  /** Same rules as the SQL version: a new owner if needed, and empty groups are deleted. */
  function afterLeaving(groupId: string) {
    const left = membersOf(groupId);
    if (left.length === 0) {
      groups.delete(groupId);
      return;
    }
    if (!left.some((m) => m.role === 'owner')) left[0]!.role = 'owner';
  }

  return {
    async ping() {},

    async createDevice(d) {
      for (const existing of devices.values()) {
        if (existing.id === d.id || existing.tokenHash === d.tokenHash) {
          throw new Error('UNIQUE constraint failed: devices');
        }
      }
      devices.set(d.id, {
        id: d.id,
        displayName: d.displayName,
        tokenHash: d.tokenHash,
        createdAt: d.createdAt,
        lastSeenAt: d.createdAt,
      });
    },

    async findDeviceByTokenHash(tokenHash) {
      for (const d of devices.values()) {
        if (d.tokenHash === tokenHash) {
          return {
            id: d.id,
            displayName: d.displayName,
            createdAt: d.createdAt,
            lastSeenAt: d.lastSeenAt,
          };
        }
      }
      return null;
    },

    async touchDevice(id, now) {
      const d = devices.get(id);
      if (d && d.lastSeenAt < now) d.lastSeenAt = now;
    },

    async updateDisplayName(id, displayName) {
      const d = devices.get(id);
      if (d) d.displayName = displayName;
    },

    async deleteDevice(id) {
      const groupIds = memberships.filter((m) => m.deviceId === id).map((m) => m.groupId);
      memberships = memberships.filter((m) => m.deviceId !== id);
      for (const g of groupIds) afterLeaving(g);
      for (const g of groups.values()) if (g.createdBy === id) g.createdBy = null;
      devices.delete(id);
    },

    async createGroup(g, maxGroupsPerDevice) {
      if (groupCount(g.deviceId) >= maxGroupsPerDevice) return { status: 'too_many_groups' };
      for (const existing of groups.values()) {
        if (existing.id === g.id || existing.joinCode === g.joinCode) {
          return { status: 'code_taken' };
        }
      }
      groups.set(g.id, {
        id: g.id,
        name: g.name,
        joinCode: g.joinCode,
        createdBy: g.deviceId,
        createdAt: g.createdAt,
      });
      memberships.push({
        groupId: g.id,
        deviceId: g.deviceId,
        role: 'owner',
        joinedAt: g.createdAt,
      });
      return { status: 'created' };
    },

    async joinGroup(joinCode, deviceId, now, limits) {
      const group = [...groups.values()].find((g) => g.joinCode === joinCode);
      if (!group) return { status: 'not_found' };
      const members = membersOf(group.id);
      if (members.some((m) => m.deviceId === deviceId)) {
        return { status: 'already_member', groupId: group.id };
      }
      if (members.length >= limits.maxMembers) return { status: 'group_full' };
      if (groupCount(deviceId) >= limits.maxGroupsPerDevice) return { status: 'too_many_groups' };
      memberships.push({ groupId: group.id, deviceId, role: 'member', joinedAt: now });
      return { status: 'joined', groupId: group.id };
    },

    async listGroups(deviceId) {
      return memberships
        .filter((m) => m.deviceId === deviceId)
        .sort((a, b) => a.joinedAt - b.joinedAt || (a.groupId < b.groupId ? -1 : 1))
        .map((mine): GroupSummary => {
          const g = groups.get(mine.groupId)!;
          return {
            id: g.id,
            name: g.name,
            joinCode: g.joinCode,
            role: mine.role,
            joinedAt: mine.joinedAt,
            members: membersOf(g.id).map((m) => ({
              displayName: devices.get(m.deviceId)?.displayName ?? '',
              role: m.role,
              isMe: m.deviceId === deviceId,
            })),
          };
        });
    },

    async leaveGroup(groupId, deviceId) {
      const before = memberships.length;
      memberships = memberships.filter((m) => !(m.groupId === groupId && m.deviceId === deviceId));
      if (memberships.length === before) return false;
      afterLeaving(groupId);
      return true;
    },

    async addErrorLog(e) {
      errorLogs.push({ ...e, id: nextErrorId++ });
    },

    async listErrorLogs(limit = 100) {
      return [...errorLogs]
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
        .slice(0, limit)
        .map((e) => ({ ...e }));
    },

    async hitRateLimit(key, windowStart) {
      const mapKey = `${key}\u0000${windowStart}`;
      const entry = rateLimits.get(mapKey) ?? { windowStart, count: 0 };
      entry.count += 1;
      rateLimits.set(mapKey, entry);
      return entry.count;
    },

    async cleanup(now) {
      const errorCutoff = now - ERROR_LOG_MAX_AGE_MS;
      const before = errorLogs.length;
      for (let i = errorLogs.length - 1; i >= 0; i--) {
        if (errorLogs[i]!.createdAt < errorCutoff) errorLogs.splice(i, 1);
      }
      let rateLimitRowsDeleted = 0;
      for (const [k, v] of rateLimits) {
        if (v.windowStart < now - RATE_LIMIT_ROW_MAX_AGE_MS) {
          rateLimits.delete(k);
          rateLimitRowsDeleted++;
        }
      }
      return {
        errorLogsDeleted: before - errorLogs.length,
        goalsCleared: 0,
        presenceRowsDeleted: 0,
        participantRowsDeleted: 0,
        rateLimitRowsDeleted,
      };
    },

    async close() {},
  };
}
