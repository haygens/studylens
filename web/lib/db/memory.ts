import {
  addDays,
  utcDate,
  type GroupRole,
  type GroupSummary,
  type ParticipantStatus,
} from '@studylens/shared';
import { buildLiveSession, isRunning, type LiveSessionRow } from './live';
import { buildOverviewMembers, historyStart } from './overview';
import {
  DAILY_TOTALS_KEEP_DAYS,
  ERROR_LOG_MAX_AGE_MS,
  GOAL_AFTER_END_MS,
  LIVE_SESSION_KEEP_MS,
  PARTICIPANT_STALE_MS,
  RATE_LIMIT_ROW_MAX_AGE_MS,
} from './retention';
import type { Db, Device, ErrorLog } from './types';

type StoredLive = Omit<LiveSessionRow, 'groupName'>;

interface StoredParticipant {
  sessionId: string;
  deviceId: string;
  status: ParticipantStatus;
  joinedAt: number;
  lastHeartbeatAt: number;
  leftAt: number | null;
}

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
 * for quick tests. It has devices, groups and memberships (P16), daily totals and presence (P18)
 * and live group sessions (P18b), with the same rules as the SQL version (db/contract.ts).
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
  /** P18b. */
  let live: StoredLive[] = [];
  let participants: StoredParticipant[] = [];

  const partsOf = (sessionId: string) => participants.filter((p) => p.sessionId === sessionId);
  const running = (s: StoredLive, now: number) => isRunning(s, partsOf(s.id), now);
  const isMember = (groupId: string, deviceId: string) =>
    memberships.some((m) => m.groupId === groupId && m.deviceId === deviceId);
  /** Focusing in a live session (other than `exceptId`) that hasn't reached its end. */
  const busy = (deviceId: string, now: number, exceptId: string | null) =>
    participants.some((p) => {
      if (p.deviceId !== deviceId || p.status !== 'focusing' || p.sessionId === exceptId) {
        return false;
      }
      const s = live.find((x) => x.id === p.sessionId);
      return !!s && s.endedAt === null && s.endsAt > now;
    });
  /** Sessions nobody is focusing in any more end now (same rule as the SQL version). */
  function endAbandoned(now: number) {
    for (const s of live) {
      const anyone = partsOf(s.id).some((p) => p.status === 'focusing');
      if (s.endedAt === null && s.endsAt > now && s.startedAt <= now && !anyone) s.endedAt = now;
    }
  }
  function viewLive(s: StoredLive, viewerId: string, now: number) {
    const group = groups.get(s.groupId)!;
    return buildLiveSession(
      { ...s, groupName: group.name },
      partsOf(s.id).map((p) => ({
        deviceId: p.deviceId,
        displayName: devices.get(p.deviceId)?.displayName ?? '',
        status: p.status,
        joinedAt: p.joinedAt,
        lastHeartbeatAt: p.lastHeartbeatAt,
        leftAt: p.leftAt,
        sharesMinutes: memberships.some(
          (m) => m.groupId === s.groupId && m.deviceId === p.deviceId && m.shareMinutes,
        ),
      })),
      viewerId,
      now,
    );
  }
  const heartbeat = (sessionId: string, deviceId: string, now: number) => {
    const s = live.find((x) => x.id === sessionId);
    const p = participants.find((x) => x.sessionId === sessionId && x.deviceId === deviceId);
    if (!s || !p || p.status !== 'focusing' || s.endedAt !== null || s.endsAt <= now) return false;
    p.lastHeartbeatAt = now;
    return true;
  };

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
      const gone = new Set(live.filter((s) => s.groupId === groupId).map((s) => s.id));
      live = live.filter((s) => !gone.has(s.id));
      participants = participants.filter((p) => !gone.has(p.sessionId));
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

    async deleteDevice(id, now = Date.now()) {
      const groupIds = memberships.filter((m) => m.deviceId === id).map((m) => m.groupId);
      memberships = memberships.filter((m) => m.deviceId !== id);
      for (const g of groupIds) afterLeaving(g);
      participants = participants.filter((p) => p.deviceId !== id);
      endAbandoned(now);
      for (const s of live) if (s.hostDeviceId === id) s.hostDeviceId = null;
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

    async leaveGroup(groupId, deviceId, now = Date.now()) {
      const before = memberships.length;
      memberships = memberships.filter((m) => !(m.groupId === groupId && m.deviceId === deviceId));
      if (memberships.length === before) return false;
      const inGroup = new Set(live.filter((s) => s.groupId === groupId).map((s) => s.id));
      participants = participants.filter(
        (p) => !(p.deviceId === deviceId && inGroup.has(p.sessionId)),
      );
      endAbandoned(now);
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

    async startLiveSession(n) {
      if (!isMember(n.groupId, n.hostDeviceId)) return { status: 'not_member' };
      if (live.some((s) => s.groupId === n.groupId && running(s, n.startedAt))) {
        return { status: 'session_running' };
      }
      if (busy(n.hostDeviceId, n.startedAt, null)) return { status: 'busy' };
      live.push({
        id: n.id,
        groupId: n.groupId,
        hostDeviceId: n.hostDeviceId,
        goal: n.goal,
        plannedMinutes: n.plannedMinutes,
        startedAt: n.startedAt,
        endsAt: n.endsAt,
        endedAt: null,
      });
      participants.push({
        sessionId: n.id,
        deviceId: n.hostDeviceId,
        status: 'focusing',
        joinedAt: n.startedAt,
        lastHeartbeatAt: n.startedAt,
        leftAt: null,
      });
      return { status: 'started' };
    },

    async listLiveSessions(deviceId, now) {
      const order = new Map(
        memberships.filter((m) => m.deviceId === deviceId).map((m) => [m.groupId, m.joinedAt]),
      );
      return live
        .filter((s) => order.has(s.groupId) && running(s, now))
        .sort((a, b) => order.get(a.groupId)! - order.get(b.groupId)! || a.startedAt - b.startedAt)
        .map((s) => viewLive(s, deviceId, now));
    },

    async liveSession(sessionId, deviceId, now) {
      const s = live.find((x) => x.id === sessionId);
      return s && isMember(s.groupId, deviceId) ? viewLive(s, deviceId, now) : null;
    },

    async joinLiveSession(sessionId, deviceId, now) {
      const s = live.find((x) => x.id === sessionId);
      if (!s || !isMember(s.groupId, deviceId)) return false;
      const existing = participants.find(
        (p) => p.sessionId === sessionId && p.deviceId === deviceId,
      );
      if (existing || !running(s, now) || busy(deviceId, now, sessionId)) {
        heartbeat(sessionId, deviceId, now);
        return false;
      }
      participants.push({
        sessionId,
        deviceId,
        status: 'focusing',
        joinedAt: now,
        lastHeartbeatAt: now,
        leftAt: null,
      });
      return true;
    },

    async leaveLiveSession(sessionId, deviceId, now) {
      const s = live.find((x) => x.id === sessionId);
      const p = participants.find((x) => x.sessionId === sessionId && x.deviceId === deviceId);
      if (!s || !p || p.status !== 'focusing' || s.endedAt !== null || s.endsAt <= now) {
        return false;
      }
      p.status = 'left';
      p.leftAt = now;
      endAbandoned(now);
      return true;
    },

    async heartbeatLiveSession(sessionId, deviceId, now) {
      return heartbeat(sessionId, deviceId, now);
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
      // P18b, in the same order as the SQL version.
      let goalsCleared = 0;
      for (const s of live) {
        if (s.goal !== null && (s.endedAt ?? s.endsAt) < now - GOAL_AFTER_END_MS) {
          s.goal = null;
          goalsCleared++;
        }
      }
      const partsBefore = participants.length;
      participants = participants.filter((p) => p.lastHeartbeatAt >= now - PARTICIPANT_STALE_MS);
      const participantRowsDeleted = partsBefore - participants.length;
      let groupSessionsEnded = 0;
      for (const s of live) {
        if (s.endsAt > now) continue;
        for (const p of partsOf(s.id)) if (p.status === 'focusing') p.status = 'finished';
        if (s.endedAt === null) {
          s.endedAt = s.endsAt;
          groupSessionsEnded++;
        }
      }
      const old = new Set(
        live.filter((s) => (s.endedAt ?? s.endsAt) < now - LIVE_SESSION_KEEP_MS).map((s) => s.id),
      );
      live = live.filter((s) => !old.has(s.id));
      participants = participants.filter((p) => !old.has(p.sessionId));
      return {
        errorLogsDeleted: before - errorLogs.length,
        goalsCleared,
        presenceRowsDeleted,
        participantRowsDeleted,
        rateLimitRowsDeleted,
        dailyTotalsDeleted,
        groupSessionsEnded,
        groupSessionsDeleted: old.size,
      };
    },

    async close() {},
  };
}
