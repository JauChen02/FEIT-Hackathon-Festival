import type { ReactNode } from 'react';
import type { ErrorCode } from '@learnarena/core';
import { Button } from '@/components/ui/button';

/**
 * Loading / empty / error states for every screen (PLANNING.md §20: "Every
 * screen handles loading, empty and error states, and branches on error codes").
 *
 * Presentational only (ADR-021): it receives plain props and never fetches.
 */

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface StateBoundaryProps {
  loading: boolean;
  error: ApiError | null;
  /** When true (and not loading or errored), the empty slot is shown instead. */
  isEmpty?: boolean;
  emptyMessage?: string;
  onRetry?: (() => void) | undefined;
  children: ReactNode;
}

export function StateBoundary({
  loading,
  error,
  isEmpty = false,
  emptyMessage = 'Nothing here yet.',
  onRetry,
  children,
}: StateBoundaryProps) {
  if (loading) {
    return (
      <div role="status" aria-live="polite" className="p-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error) {
    return <ErrorNotice error={error} onRetry={onRetry} />;
  }

  if (isEmpty) {
    return (
      <div role="status" className="p-6 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Renders an API error. The copy is chosen from the error **code**, never the
 * message — §16.1 states the message is human-readable and may change, so the
 * code is the only part of the contract a client may depend on.
 */
export function ErrorNotice({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div
      role="alert"
      data-error-code={error.code}
      className="flex flex-col gap-3 rounded-md border border-destructive p-4"
    >
      <p className="text-sm text-destructive">{copyFor(error)}</p>
      {onRetry && isRetryable(error.code) ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="self-start">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function isRetryable(code: ErrorCode): boolean {
  return code === 'INTERNAL_ERROR' || code === 'RATE_LIMITED';
}

function copyFor(error: ApiError): string {
  switch (error.code) {
    case 'UNAUTHORIZED':
      return 'Your session has expired. Please sign in again.';
    case 'ONBOARDING_REQUIRED':
      return 'Finish setting up your profile to continue.';
    case 'USERNAME_TAKEN':
      return 'That username is already taken. Try another one.';
    case 'INVALID_INPUT':
      return error.message;
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a moment and try again.';
    case 'FORBIDDEN':
      return 'You do not have access to this.';
    case 'NOT_FOUND':
      return 'We could not find that.';
    case 'INTERNAL_ERROR':
      return 'Something went wrong on our side. Please try again.';
    default:
      return error.message;
  }
}
