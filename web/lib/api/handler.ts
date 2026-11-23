import { getDb } from '@/lib/db';
import { checkOrigin, corsHeaders, isAllowedOrigin } from './cors';
import { ApiError, errorResponse, internalError } from './errors';
import { scrubMessage } from './scrub';

type Handler = (req: Request) => Promise<Response> | Response;

/**
 * Stores an unexpected server error in `error_logs` (scrubbed message only: no request body,
 * headers, tokens or IPs). If the database itself is the problem, falls back to the console.
 */
export async function logServerError(route: string, err: unknown): Promise<void> {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const message = scrubMessage(raw) || 'Unknown error';
  try {
    const db = await getDb();
    await db.addErrorLog({
      source: 'server',
      route,
      message,
      extensionVersion: null,
      createdAt: Date.now(),
    });
  } catch (logErr) {
    console.error(`[${route}] ${message}`);
    console.error(`[${route}] could not write error log:`, scrubMessage(String(logErr)));
  }
}

/**
 * Wraps a route handler: `ApiError`s become consistent JSON errors; anything else is logged to
 * `error_logs` and answered with a generic 500 (no internals leak to the client).
 */
export function withErrorLogging(route: string, handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err);
      await logServerError(route, err);
      return errorResponse(internalError());
    }
  };
}

function withHeaders(res: Response, headers: Record<string, string>): Response {
  const entries = Object.entries(headers);
  if (entries.length === 0) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of entries) out.headers.set(k, v);
  out.headers.append('Vary', 'Origin');
  return out;
}

/**
 * A complete API route: CORS check (403 for other origins), error logging, CORS headers on every
 * response (including errors), and `Cache-Control: no-store`.
 */
export function apiRoute(route: string, methods: string[], handler: Handler): Handler {
  const inner = withErrorLogging(route, handler);
  return async (req) => {
    let cors: Record<string, string>;
    try {
      cors = checkOrigin(req, methods);
    } catch (err) {
      return errorResponse(err as ApiError);
    }
    const res = withHeaders(await inner(req), cors);
    if (!res.headers.has('Cache-Control')) res.headers.set('Cache-Control', 'no-store');
    return res;
  };
}

/** OPTIONS handler for CORS preflight requests. */
export function preflight(methods: string[]): Handler {
  return (req) => {
    const origin = req.headers.get('origin');
    if (!origin || !isAllowedOrigin(origin)) {
      return errorResponse(
        new ApiError(403, 'origin_not_allowed', 'This origin may not call the StudyLens API.'),
      );
    }
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders(origin, methods), Vary: 'Origin' },
    });
  };
}
