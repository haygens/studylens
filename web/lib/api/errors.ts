import type { ApiErrorBody, ApiErrorCode } from '@studylens/shared';

/** An expected error with an HTTP status. Thrown by handlers; turned into JSON by `apiRoute`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorResponse(err: ApiError): Response {
  const body: ApiErrorBody = {
    ok: false,
    error: {
      code: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
    },
  };
  return Response.json(body, { status: err.status, headers: err.headers });
}

export function internalError(): ApiError {
  return new ApiError(500, 'internal_error', 'Something went wrong on the server.');
}
