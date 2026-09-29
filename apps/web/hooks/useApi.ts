'use client';

import { useCallback, useState } from 'react';
import type { ErrorCode } from '@learnarena/core';
import type { ApiError } from '@/components/ui-app/StateBoundary';

/**
 * The client's single entry point to `/api/*` (ADR-021: hooks fetch, components
 * render).
 *
 * Every response — success or failure — comes back as the §16.1 envelope, so
 * this normalises failures into an `ApiError` carrying the `code` the UI
 * branches on. A network failure or a non-JSON body becomes `INTERNAL_ERROR`,
 * because the UI should not need to distinguish "server said 500" from "server
 * never answered".
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'We could not reach the server.' },
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'The server sent an unreadable response.' },
    };
  }

  if (response.ok) return { ok: true, data: payload as T };

  const envelope = (payload as { error?: { code?: string; message?: string; details?: unknown } })
    .error;
  return {
    ok: false,
    error: {
      code: (envelope?.code as ErrorCode | undefined) ?? 'INTERNAL_ERROR',
      message: envelope?.message ?? 'Something went wrong.',
      ...(envelope?.details ? { details: envelope.details as Record<string, unknown> } : {}),
    },
  };
}

export interface MutationState {
  submitting: boolean;
  error: ApiError | null;
}

/** A POST/PATCH helper that tracks submitting + error for a form. */
export function useMutation<TInput, TOutput>(send: (input: TInput) => Promise<ApiResult<TOutput>>) {
  const [state, setState] = useState<MutationState>({ submitting: false, error: null });

  const mutate = useCallback(
    async (input: TInput): Promise<ApiResult<TOutput>> => {
      setState({ submitting: true, error: null });
      const result = await send(input);
      setState({ submitting: false, error: result.ok ? null : result.error });
      return result;
    },
    [send],
  );

  return { ...state, mutate };
}
