'use client';

import { useEffect, useState } from 'react';
import type { SessionStateResponse, SkillDelta } from '@learnarena/core';
import { SkillDeltaList } from '@/components/ui-app/SkillDeltaList';
import { apiFetch } from '@/hooks/useApi';

/**
 * Skill deltas on the results screen (PLANNING.md §20 screen 6, §18.3).
 *
 * `coach/process-session` runs after the completion transaction commits, so
 * the numbers arrive a moment after the page does. Rather than blocking the
 * points breakdown behind them, this shows the pending state and polls for a
 * short while.
 *
 * ADR-021: fetching lives here; `SkillDeltaList` only renders.
 */

/** Roughly ten seconds, which is far longer than the job normally takes. */
const MAX_ATTEMPTS = 10;
const INTERVAL_MS = 1_000;

export function SkillDeltasClient({ sessionId }: { sessionId: string }) {
  const [deltas, setDeltas] = useState<SkillDelta[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      if (cancelled) return;
      attempts += 1;

      const result = await apiFetch<SessionStateResponse>(`/api/sessions/${sessionId}`);

      if (!cancelled && result.ok && result.data.skillDeltas !== null) {
        setDeltas(result.data.skillDeltas);
        return;
      }
      // Give up quietly: the deltas are a nicety, and the Skills page shows
      // the same movement once the job has run.
      if (!cancelled && attempts < MAX_ATTEMPTS) {
        setTimeout(() => void poll(), INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return <SkillDeltaList deltas={deltas} />;
}
