import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { z } from 'zod';
import {
  AppError,
  MAX_REQUEST_BODY_BYTES,
  isAppError,
  uuidv7,
  type ErrorCode,
} from '@learnarena/core';
import { requestLogger } from '../logger';
import { siteOrigin } from '../env';

/**
 * The single wrapper every route handler goes through (PLANNING.md §16.1, §19.1).
 *
 * Responsibilities, in order:
 *   1. assign a request id and attach it to the response and every log line (§23.1)
 *   2. verify the `Origin` header on mutating requests — CSRF defence (§19.1)
 *   3. reject bodies over 16 KB with `413 PAYLOAD_TOO_LARGE` (§19.1)
 *   4. parse the body with Zod, reporting `400 INVALID_INPUT` with the field path
 *   5. render `AppError` as the §16.1 envelope with its documented HTTP status
 *   6. turn anything else into `500 INTERNAL_ERROR`, logged and sent to Sentry
 *
 * Handlers therefore only ever contain domain work; none of them format an
 * error response by hand, which is what keeps the client's `code` contract
 * stable.
 */

const REQUEST_ID_HEADER = 'x-request-id';

export interface HandlerContext<TBody = undefined, TParams = undefined> {
  request: Request;
  requestId: string;
  body: TBody;
  /** Validated dynamic route segments, e.g. `{ id }` for `/api/sessions/[id]`. */
  params: TParams;
  /** Parsed query string, for routes that take one. */
  query: URLSearchParams;
  log: ReturnType<typeof requestLogger>;
}

export interface RouteOptions<
  TSchema extends z.ZodType | undefined,
  TParams extends z.ZodType | undefined,
> {
  /** Route name for logs, e.g. 'POST /api/me/onboarding'. */
  name: string;
  /** When present, the body is parsed with this schema before the handler runs. */
  schema?: TSchema;
  /** When present, Next's dynamic segments are parsed with this schema. */
  params?: TParams;
  /** Mutating methods get the Origin check; GET does not need it. */
  requireOrigin?: boolean;
}

type Body<TSchema> = TSchema extends z.ZodType ? z.infer<TSchema> : undefined;
type Params<TParams> = TParams extends z.ZodType ? z.infer<TParams> : undefined;

/**
 * Next.js hands dynamic route handlers a second argument whose `params` is a
 * promise. Routes with no dynamic segment are called with nothing.
 */
export interface NextRouteContext {
  params?: Promise<Record<string, string | string[] | undefined>>;
}

function jsonResponse(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      [REQUEST_ID_HEADER]: requestId,
      // Never let a proxy or the browser cache a user-specific response.
      'cache-control': 'no-store',
    },
  });
}

export function errorResponse(
  code: ErrorCode,
  requestId: string,
  options: { message?: string; details?: Record<string, unknown> } = {},
): Response {
  const error = new AppError(code, options);
  return jsonResponse(error.toEnvelope(), error.status, requestId);
}

/**
 * §19.1: "all mutating route handlers additionally verify the Origin header
 * matches the app origin." Supabase cookies are SameSite=Lax, so this is the
 * second layer rather than the only one.
 */
function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  // Same-origin non-CORS requests from some clients omit Origin entirely; those
  // cannot be cross-site forgeries with SameSite=Lax cookies.
  if (origin === null) return;
  if (origin !== siteOrigin()) {
    throw new AppError('FORBIDDEN', { message: 'Request origin is not allowed.' });
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_REQUEST_BODY_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE');
  }

  const text = await request.text();
  // Check the real size too: content-length can be absent or wrong.
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BODY_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE');
  }
  if (text.trim() === '') return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('INVALID_INPUT', { message: 'Request body is not valid JSON.' });
  }
}

/**
 * Turn Zod issues into `details` the client can use to highlight a field.
 * Only paths and messages are included — never the submitted values, which
 * could contain anything (§23.1: never log full request bodies).
 */
function invalidInput(error: z.ZodError): AppError {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  return new AppError('INVALID_INPUT', {
    message: issues[0]?.message ?? 'Some of the details you sent are not valid.',
    details: { issues },
  });
}

export function route<
  TSchema extends z.ZodType | undefined = undefined,
  TParams extends z.ZodType | undefined = undefined,
>(
  options: RouteOptions<TSchema, TParams>,
  handler: (context: HandlerContext<Body<TSchema>, Params<TParams>>) => Promise<Response>,
): (request: Request, context?: NextRouteContext) => Promise<Response> {
  return async (request: Request, context?: NextRouteContext): Promise<Response> => {
    const requestId = request.headers.get(REQUEST_ID_HEADER) ?? uuidv7();
    const log = requestLogger({
      requestId,
      route: options.name,
      method: request.method,
    });

    try {
      if (options.requireOrigin ?? request.method !== 'GET') {
        assertSameOrigin(request);
      }

      let params = undefined as Params<TParams>;
      if (options.params) {
        const raw = (await context?.params) ?? {};
        const parsed = options.params.safeParse(raw);
        // A malformed dynamic segment is a bad URL, not a bad body: a
        // non-uuid session id can only ever address a session that does not
        // exist, so it reads better as a 404 than a 400.
        if (!parsed.success) {
          throw new AppError('NOT_FOUND', { message: 'That resource does not exist.' });
        }
        params = parsed.data as Params<TParams>;
      }

      let body = undefined as Body<TSchema>;
      if (options.schema) {
        const raw = await readJsonBody(request);
        const parsed = options.schema.safeParse(raw);
        if (!parsed.success) throw invalidInput(parsed.error);
        body = parsed.data as Body<TSchema>;
      }

      const response = await handler({
        request,
        requestId,
        body,
        params,
        query: new URL(request.url).searchParams,
        log,
      });
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    } catch (error) {
      if (isAppError(error)) {
        // Expected outcomes (401, 409, …) are information, not failures.
        log.info({ code: error.code, status: error.status }, 'request rejected');
        return jsonResponse(error.toEnvelope(), error.status, requestId);
      }

      log.error({ err: error }, 'unhandled error in route handler');
      Sentry.captureException(error, { tags: { route: options.name, request_id: requestId } });
      return jsonResponse(new AppError('INTERNAL_ERROR').toEnvelope(), 500, requestId);
    }
  };
}

/** A successful JSON response carrying the request id. */
export function ok(body: unknown, requestId: string, status = 200): Response {
  return jsonResponse(body, status, requestId);
}
