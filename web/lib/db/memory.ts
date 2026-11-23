import { ERROR_LOG_MAX_AGE_MS, RATE_LIMIT_ROW_MAX_AGE_MS } from './retention';
import type { Db, Device, ErrorLog } from './types';

/**
 * In-memory stub. Data is lost on restart — for local development without a database file and
 * for quick tests. It has no group tables yet, so cleanup only touches error logs and rate limits.
 */
export function createMemoryDb(): Db {
  const devices = new Map<string, Device & { tokenHash: string }>();
  const errorLogs: ErrorLog[] = [];
  const rateLimits = new Map<string, { windowStart: number; count: number }>();
  let nextErrorId = 1;

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
