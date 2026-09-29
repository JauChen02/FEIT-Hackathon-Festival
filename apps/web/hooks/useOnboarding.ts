'use client';

import { useCallback } from 'react';
import type { UserProfile } from '@learnarena/core';
import type { OnboardingValues } from '@/components/ui-app/OnboardingForm';
import { apiFetch, useMutation, type ApiResult } from './useApi';

/**
 * Submits onboarding (PLANNING.md §16.2).
 *
 * ADR-021 keeps data access in hooks; `OnboardingForm` stays a pure
 * presentational component that takes `submitting`, `error` and `onSubmit`.
 */

export interface OnboardingResponse {
  profile: UserProfile;
  created: boolean;
}

export function useOnboarding() {
  const send = useCallback(
    (values: OnboardingValues): Promise<ApiResult<OnboardingResponse>> =>
      apiFetch<OnboardingResponse>('/api/me/onboarding', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    [],
  );

  return useMutation(send);
}
