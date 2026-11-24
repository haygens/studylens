/**
 * The StudyLens server API (P16), with every failure turned into a value (never a throw), so the
 * UI can always show a clear state instead of a blank screen.
 *
 * Browser APIs (fetch, the permission check) are injected, so this is unit-testable.
 * Privacy: requests carry only what each endpoint needs (display name, group name, join code, the
 * device token). No cookies, no referrer, no browsing data.
 */
import type {
  ApiErrorBody,
  ApiErrorCode,
  DeleteDeviceResponse,
  GroupResponse,
  ListGroupsResponse,
  RegisterDeviceResponse,
  UpdateDeviceResponse,
} from '@studylens/shared';
import { REQUEST_TIMEOUT_MS } from './config';

export type ApiFailure =
  /** The server couldn't be reached (offline, DNS, connection refused, CORS). */
  | { ok: false; kind: 'offline' }
  | { ok: false; kind: 'timeout' }
  /** StudyLens doesn't have permission to contact the server (never granted, or taken back). */
  | { ok: false; kind: 'no-permission' }
  /**
   * Firefox: the request would send (or reveal to a group) the display name, but the user hasn't
   * allowed sharing it (data collection consent). Nothing was sent.
   */
  | { ok: false; kind: 'no-name-consent' }
  | {
      ok: false;
      kind: 'http';
      status: number;
      code: ApiErrorCode | 'unknown';
      message: string;
      /** First field problem, for `validation_failed`. */
      detail?: string;
    };

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export interface ApiClientDeps {
  base: string;
  fetch: typeof fetch;
  /**
   * Checked before every request. `sendsName` is true for requests that send the display name or
   * make it visible to a group (register, rename, create, join).
   */
  hasPermission: (sendsName: boolean) => Promise<'ok' | 'no-permission' | 'no-name-consent'>;
  timeoutMs?: number;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export function createApiClient(deps: ApiClientDeps) {
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function call<T>(
    method: Method,
    path: string,
    opts: { token?: string; body?: unknown; sendsName?: boolean } = {},
  ): Promise<ApiResult<T>> {
    const allowed = await deps.hasPermission(opts.sendsName === true);
    if (allowed !== 'ok') return { ok: false, kind: allowed };

    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await deps.fetch(`${deps.base}${path}`, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
      } catch {
        return controller.signal.aborted
          ? { ok: false, kind: 'timeout' }
          : { ok: false, kind: 'offline' };
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        if (controller.signal.aborted) return { ok: false, kind: 'timeout' };
        json = null;
      }
      if (res.ok) return { ok: true, data: json as T };

      const error = (json as Partial<ApiErrorBody> | null)?.error;
      return {
        ok: false,
        kind: 'http',
        status: res.status,
        code: error?.code ?? 'unknown',
        message: typeof error?.message === 'string' ? error.message : `HTTP ${res.status}`,
        ...(error?.details?.[0] && { detail: error.details[0].message }),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    register: (displayName: string) =>
      call<RegisterDeviceResponse>('POST', '/api/devices', {
        body: { displayName },
        sendsName: true,
      }),
    listGroups: (token: string) => call<ListGroupsResponse>('GET', '/api/groups', { token }),
    createGroup: (token: string, name: string) =>
      call<GroupResponse>('POST', '/api/groups', { token, body: { name }, sendsName: true }),
    joinGroup: (token: string, code: string) =>
      call<GroupResponse>('POST', '/api/groups/join', { token, body: { code }, sendsName: true }),
    leaveGroup: (token: string, groupId: string) =>
      call<{ ok: true }>('DELETE', `/api/groups/${encodeURIComponent(groupId)}/membership`, {
        token,
      }),
    rename: (token: string, displayName: string) =>
      call<UpdateDeviceResponse>('PATCH', '/api/devices/me', {
        token,
        body: { displayName },
        sendsName: true,
      }),
    deleteDevice: (token: string) =>
      call<DeleteDeviceResponse>('DELETE', '/api/devices/me', { token }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** True when the server says this device's token is unknown (its data was already deleted). */
export function isUnknownDevice(failure: ApiFailure): boolean {
  return failure.kind === 'http' && failure.status === 401;
}

/** A plain-language sentence for a failure, for the UI. */
export function failureText(failure: ApiFailure): string {
  switch (failure.kind) {
    case 'offline':
      return 'Can’t reach the StudyLens server. Check your internet connection and try again.';
    case 'timeout':
      return 'The StudyLens server took too long to answer. Try again in a moment.';
    case 'no-permission':
      return 'StudyLens doesn’t have permission to contact its server, so nothing was sent.';
    case 'no-name-consent':
      return 'Study groups need your OK to share your display name, and Firefox doesn’t have it, so nothing was sent.';
    case 'http':
      switch (failure.code) {
        case 'validation_failed':
          return failure.detail ?? failure.message;
        case 'not_found':
        case 'group_full':
        case 'too_many_groups':
        case 'rate_limited':
          return failure.message;
        case 'unauthorized':
          return 'The server doesn’t know this browser any more (its group data may have been deleted).';
        default:
          return failure.status >= 500
            ? `Something went wrong on the StudyLens server (error ${failure.status}). Try again later.`
            : `The request didn’t work (error ${failure.status}): ${failure.message}`;
      }
  }
}
