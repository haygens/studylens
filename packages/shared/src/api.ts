/**
 * Request/response shapes of the StudyLens server API (web/app/api), shared so both sides agree.
 * The extension calls the server only for study groups (P16), after the user opts in.
 * Group shapes are in groups.ts. See docs/backend.md.
 */

export const DISPLAY_NAME_MAX_LENGTH = 30;
export const ERROR_MESSAGE_MAX_LENGTH = 500;

/** GET /api/health */
export interface HealthResponse {
  ok: boolean;
  db: 'up' | 'down';
  version: string;
}

/** POST /api/devices */
export interface RegisterDeviceRequest {
  displayName: string;
}

/** The token is returned only once; send it later as `Authorization: Bearer <token>`. */
export interface RegisterDeviceResponse {
  deviceId: string;
  token: string;
  displayName: string;
}

/** Where in the extension an error happened. */
export const ERROR_CONTEXTS = [
  'background',
  'popup',
  'options',
  'interstitial',
  'welcome',
  'other',
] as const;
export type ErrorContext = (typeof ERROR_CONTEXTS)[number];

/** POST /api/errors (needs a device token). No user data: just the error message. */
export interface ErrorReportRequest {
  message: string;
  context?: ErrorContext;
  extensionVersion?: string;
}

export const API_ERROR_CODES = [
  'bad_request',
  'invalid_json',
  'validation_failed',
  'unsupported_media_type',
  'payload_too_large',
  'unauthorized',
  'origin_not_allowed',
  'not_found',
  'group_full',
  'too_many_groups',
  /** P18b: the group already has a running live session / I can't (re)join this one. */
  'session_running',
  'session_over',
  'rate_limited',
  'not_configured',
  'internal_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every error response has this shape. */
export interface ApiErrorBody {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** For `validation_failed`: which fields were wrong. */
    details?: { path: string; message: string }[];
  };
}
