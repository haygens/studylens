import { addDays, utcDate, type GroupRole, type GroupSummary } from '@studylens/shared';
import { buildOverviewMembers, historyStart } from './overview';
import {
  DAILY_TOTALS_KEEP_DAYS,
  ERROR_LOG_MAX_AGE_MS,
  RATE_LIMIT_ROW_MAX_AGE_MS,
} from './retention';
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
  shareMinutes: boolean;
  sharePresence: boolean;
}

/**
 * In-memory stub. Data is lost on restart — for local development without a database file and
 * for quick tests. It has devices, groups and memberships (P16) and daily totals and presence
 * (P18), but none of the P18b (live group session) tables yet.
 */
export function createMemoryDb(): Db {
  const devices = new Map<string, Device & { tokenHash: string }>();
  const groups = new Map<string, StoredGroup>();
  let memberships: Membership[] = [];
  const errorLogs: ErrorLog[] = [];
  const rateLimits = new Map<string, { windowStart: number; count: number }>();
  let nextErrorId = 1;
  /** `deviceId` → (`localDate` → minutes). */
  const totals = new Map<string, Map<string, number>>();
  /** `deviceId` → presence. */
  const presence = new Map<string, { since: number; expiresAt: number }>();

  const byJoinOrder = (a: Membership, b: Membership) =>
    a.joinedAt - b.joinedAt || (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0);
  const membersOf = (groupId: string) =>
    memberships.filter((m) => m.groupId === groupId).sort(byJoinOrder);
  const groupCount = (deviceId: string) =>
    memberships.filter((m) => m.deviceId === deviceId).length;

  const sharesMinutes = (deviceId: string) =>
    memberships.some((m) => m.deviceId === deviceId && m.shareMinutes);
  const sharesPresence = (deviceId: string) =>
    memberships.some((m) => m.deviceId === deviceId && m.sharePresence);

  /** Same rule as the SQL version: delete what no group shares any more. */
  function pruneUnshared(deviceId: string) {
    if (!sharesMinutes(deviceId)) totals.delete(deviceId);
    if (!sharesPresence(deviceId)) presence.delete(deviceId);
  }

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
      totals.delete(id);
      presence.delete(id);
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
        shareMinutes: g.sharing.focusMinutes,
        sharePresence: g.sharing.focusingNow,
      });
      return { status: 'created' };
    },

    async joinGroup(joinCode, deviceId, now, limits, sharing) {
      const group = [...groups.values()].find((g) => g.joinCode === joinCode);
      if (!group) return { status: 'not_found' };
      const members = membersOf(group.id);
      if (members.some((m) => m.deviceId === deviceId)) {
        return { status: 'already_member', groupId: group.id };
      }
      if (members.length >= limits.maxMembers) return { status: 'group_full' };
      if (groupCount(deviceId) >= limits.maxGroupsPerDevice) return { status: 'too_many_groups' };
      memberships.push({
        groupId: group.id,
        deviceId,
        role: 'member',
        joinedAt: now,
        shareMinutes: sharing.focusMinutes,
        sharePresence: sharing.focusingNow,
      });
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
            sharing: { focusMinutes: mine.shareMinutes, focusingNow: mine.sharePresence },
          };
        });
    },

    async leaveGroup(groupId, deviceId) {
      const before = memberships.length;
      memberships = memberships.filter((m) => !(m.groupId === groupId && m.deviceId === deviceId));
      if (memberships.length === before) return false;
      afterLeaving(groupId);
      pruneUnshared(deviceId);
      return true;
    },

    async updateSharing(groupId, deviceId, patch) {
      const m = memberships.find((x) => x.groupId === groupId && x.deviceId === deviceId);
      if (!m) return null;
      if (patch.focusMinutes !== undefined) m.shareMinutes = patch.focusMinutes;
      if (patch.focusingNow !== undefined) m.sharePresence = patch.focusingNow;
      pruneUnshared(deviceId);
      return { focusMinutes: m.shareMinutes, focusingNow: m.sharePresence };
    },

    async upsertDailyTotals(deviceId, days) {
      pruneUnshared(deviceId);
      if (!sharesMinutes(deviceId)) return 0;
      const mine = totals.get(deviceId) ?? new Map<string, number>();
      for (const d of days) mine.set(d.localDate, d.focusMinutes);
      totals.set(deviceId, mine);
      return days.length;
    },

    async setPresence(deviceId, state, now, ttlMs) {
      if (state === 'stop' || !sharesPresence(deviceId)) {
        presence.delete(deviceId);
        return false;
      }
      const old = presence.get(deviceId);
      const since = state === 'start' || !old || old.expiresAt <= now ? now : old.since;
      presence.set(deviceId, { since, expiresAt: now + ttlMs });
      return true;
    },

    async groupOverview(groupId, deviceId, q) {
      const group = groups.get(groupId);
      const members = membersOf(groupId);
      if (!group || !members.some((m) => m.deviceId === deviceId)) return null;
      const from = historyStart(q);
      const rows = members.flatMap((m) =>
        [...(totals.get(m.deviceId) ?? [])]
          .filter(([date]) => m.shareMinutes && date >= from && date <= q.today)
          .map(([localDate, focusMinutes]) => ({ deviceId: m.deviceId, localDate, focusMinutes })),
      );
      return {
        group: { id: group.id, name: group.name },
        members: buildOverviewMembers(
          members.map((m) => ({
            deviceId: m.deviceId,
            displayName: devices.get(m.deviceId)?.displayName ?? '',
            role: m.role,
            isMe: m.deviceId === deviceId,
            shareMinutes: m.shareMinutes,
            sharePresence: m.sharePresence,
            focusing: (presence.get(m.deviceId)?.expiresAt ?? 0) > q.now,
          })),
          rows,
          q,
        ),
      };
    },

    async countFocusingNow(deviceId, now) {
      const myGroups = new Set(
        memberships.filter((m) => m.deviceId === deviceId).map((m) => m.groupId),
      );
      const focusing = new Set(
        memberships
          .filter(
            (m) =>
              myGroups.has(m.groupId) &&
              m.deviceId !== deviceId &&
              m.sharePresence &&
              (presence.get(m.deviceId)?.expiresAt ?? 0) > now,
          )
          .map((m) => m.deviceId),
      );
      return focusing.size;
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
      let presenceRowsDeleted = 0;
      for (const [id, p] of presence) {
        if (p.expiresAt < now) {
          presence.delete(id);
          presenceRowsDeleted++;
        }
      }
      const totalsCutoff = addDays(utcDate(now), -DAILY_TOTALS_KEEP_DAYS);
      let dailyTotalsDeleted = 0;
      for (const days of totals.values()) {
        for (const date of [...days.keys()]) {
          if (date < totalsCutoff) {
            days.delete(date);
            dailyTotalsDeleted++;
          }
        }
      }
      return {
        errorLogsDeleted: before - errorLogs.length,
        goalsCleared: 0,
        presenceRowsDeleted,
        participantRowsDeleted: 0,
        rateLimitRowsDeleted,
        dailyTotalsDeleted,
      };
    },

    async close() {},
  };
}
