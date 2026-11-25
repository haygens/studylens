/**
 * The StudyLens server API (P16), with every failure turned into a value (never a throw), so the
 * UI can always show a clear state instead of a blank screen.
 *
 * Browser APIs (fetch, the permission check) are injected, so this is unit-testable.
 * Privacy: requests carry only what each endpoint needs (display name, group name, join code, the
 * device token). No cookies, no referrer, no browsing data.
 */
import type {
  ActiveLiveSessionsResponse,
  ApiErrorBody,
  ApiErrorCode,
  DailyTotal,
  DeleteDeviceResponse,
  FocusingNowResponse,
  GroupOverviewResponse,
  GroupResponse,
  GroupSharing,
  ListGroupsResponse,
  LiveSessionResponse,
  PresenceResponse,
  PresenceState,
  RegisterDeviceResponse,
  StartLiveSessionRequest,
  TotalsResponse,
  UpdateDeviceResponse,
  UpdateSharingRequest,
  UpdateSharingResponse,
} from '@studylens/shared';
import { REQUEST_TIMEOUT_MS } from './config';
import type { ConsentNeed, GateResult } from './permission';

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
  /**
   * Firefox (P18): the request would send focus minutes / "focusing now" (or turn a sharing
   * switch on), but the user hasn't allowed sharing focus activity. Nothing was sent.
   */
  | { ok: false; kind: 'no-activity-consent' }
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
   * Checked before every request. `need` is `name` for requests that send the display name or
   * make it visible to a group (register, rename, create, join), `activity` for requests that send
   * focus minutes or "focusing now" (P18), else `none`.
   */
  hasPermission: (need: ConsentNeed) => Promise<GateResult>;
  timeoutMs?: number;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export function createApiClient(deps: ApiClientDeps) {
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function call<T>(
    method: Method,
    path: string,
    opts: { token?: string; body?: unknown; need?: ConsentNeed } = {},
  ): Promise<ApiResult<T>> {
    const allowed = await deps.hasPermission(opts.need ?? 'none');
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
        need: 'name',
      }),
    listGroups: (token: string) => call<ListGroupsResponse>('GET', '/api/groups', { token }),
    /** P18: `sharing` = my switches; turning either on also needs the activity consent. */
    createGroup: (token: string, name: string, sharing: GroupSharing) =>
      call<GroupResponse>('POST', '/api/groups', {
        token,
        body: { name, sharing },
        need: 'name',
      }),
    joinGroup: (token: string, code: string, sharing: GroupSharing) =>
      call<GroupResponse>('POST', '/api/groups/join', {
        token,
        body: { code, sharing },
        need: 'name',
      }),
    leaveGroup: (token: string, groupId: string) =>
      call<{ ok: true }>('DELETE', `/api/groups/${encodeURIComponent(groupId)}/membership`, {
        token,
      }),
    rename: (token: string, displayName: string) =>
      call<UpdateDeviceResponse>('PATCH', '/api/devices/me', {
        token,
        body: { displayName },
        need: 'name',
      }),
    deleteDevice: (token: string) =>
      call<DeleteDeviceResponse>('DELETE', '/api/devices/me', { token }),
    /** P18: turning a switch on needs the activity consent; turning one off never does. */
    updateSharing: (token: string, groupId: string, patch: UpdateSharingRequest) =>
      call<UpdateSharingResponse>('PATCH', `/api/groups/${encodeURIComponent(groupId)}/sharing`, {
        token,
        body: patch,
        need: patch.focusMinutes === true || patch.focusingNow === true ? 'activity' : 'none',
      }),
    sendTotals: (token: string, days: DailyTotal[]) =>
      call<TotalsResponse>('POST', '/api/totals', { token, body: { days }, need: 'activity' }),
    sendPresence: (token: string, state: PresenceState) =>
      call<PresenceResponse>('POST', '/api/presence', {
        token,
        body: { state },
        // `stop` only ends what was shared; it reveals nothing new.
        need: state === 'stop' ? 'none' : 'activity',
      }),
    overview: (token: string, groupId: string, today: string) =>
      call<GroupOverviewResponse>(
        'GET',
        `/api/groups/${encodeURIComponent(groupId)}/overview?today=${encodeURIComponent(today)}`,
        { token },
      ),
    focusingNow: (token: string) =>
      call<FocusingNowResponse>('GET', '/api/groups/focusing', { token }),
    /**
     * P18b live group sessions. Starting/joining shows my name in the participants list and
     * shares my live status (`live`: both Firefox OKs); heartbeats share the status only. Leaving
     * reveals nothing new, and reading sends only the token. `testSeconds` is accepted only by the
     * local E2E test server (the E2E build alone ever sends it).
     */
    startLive: (
      token: string,
      groupId: string,
      body: StartLiveSessionRequest & { testSeconds?: number },
    ) =>
      call<LiveSessionResponse>('POST', `/api/groups/${encodeURIComponent(groupId)}/sessions`, {
        token,
        body,
        need: 'live',
      }),
    listLive: (token: string) =>
      call<ActiveLiveSessionsResponse>('GET', '/api/group-sessions', { token }),
    getLive: (token: string, sessionId: string) =>
      call<LiveSessionResponse>('GET', `/api/group-sessions/${encodeURIComponent(sessionId)}`, {
        token,
      }),
    joinLive: (token: string, sessionId: string) =>
      call<LiveSessionResponse>(
        'POST',
        `/api/group-sessions/${encodeURIComponent(sessionId)}/join`,
        { token, need: 'live' },
      ),
    leaveLive: (token: string, sessionId: string) =>
      call<LiveSessionResponse>(
        'POST',
        `/api/group-sessions/${encodeURIComponent(sessionId)}/leave`,
        { token },
      ),
    heartbeatLive: (token: string, sessionId: string) =>
      call<LiveSessionResponse>(
        'POST',
        `/api/group-sessions/${encodeURIComponent(sessionId)}/heartbeat`,
        { token, need: 'activity' },
      ),
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
    case 'no-activity-consent':
      return 'Sharing focus minutes or “focusing now” needs your OK in Firefox (“technical and interaction data”), and Firefox doesn’t have it, so nothing was sent.';
    case 'http':
      switch (failure.code) {
        case 'validation_failed':
          return failure.detail ?? failure.message;
        case 'not_found':
        case 'group_full':
        case 'too_many_groups':
        case 'session_running':
        case 'session_over':
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
