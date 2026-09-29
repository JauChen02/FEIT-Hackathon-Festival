'use client';
import { DailyChallengeCard } from '@/components/ui-app/DailyChallengeCard';
import type { DailyChallengeResponse } from '@learnarena/core';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  uuidv7,
  type CreateSessionResponse,
  type RecommendationResponse,
  type SkillsResponse,
} from '@learnarena/core';
import { ActiveSessionPrompt } from '@/components/ui-app/ActiveSessionPrompt';
import { CategoryPicker, type CategoryOption } from '@/components/ui-app/CategoryPicker';
import { FocusCard } from '@/components/ui-app/FocusCard';
import type { ApiError } from '@/components/ui-app/StateBoundary';
import { apiFetch } from '@/hooks/useApi';

/**
 * Starting a quiz from Home (PLANNING.md §20 screen 3).
 *
 * ADR-021: this owns the calls and the state; `CategoryPicker` and
 * `ActiveSessionPrompt` only render.
 */

interface OpenSession {
  sessionId: string;
  status: 'CREATED' | 'ACTIVE';
}

export function HomeClient({ categories }: { categories: readonly CategoryOption[] }) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<DailyChallengeResponse['challenge']>(null);
  useEffect(() => {
    void apiFetch<DailyChallengeResponse>('/api/daily-challenge').then((result) => {
      if (result.ok) setChallenge(result.data.challenge);
    });
  }, []);
  const [startingSlug, setStartingSlug] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [busy, setBusy] = useState(false);

  // §11.5: the recommendation is generated lazily on the first GET of the
  // learner's local date, so simply loading Home is what creates it.
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [tiers, setTiers] = useState<Map<string, CategoryOption['tier']>>(new Map());

  useEffect(() => {
    void (async () => {
      // Sequential, not parallel: `/api/me/skills` is a pure read that reports
      // the RECOMMENDED tier only for a recommendation that already exists,
      // and `/api/me/recommendation` is what lazily creates it (§11.5). Racing
      // them would leave the picker showing ×1.25 on every category on a
      // learner's first visit of the day.
      const recommendationResult = await apiFetch<RecommendationResponse>('/api/me/recommendation');
      if (recommendationResult.ok) setRecommendation(recommendationResult.data);

      const skillsResult = await apiFetch<SkillsResponse>('/api/me/skills');
      if (skillsResult.ok) {
        setTiers(
          new Map(
            skillsResult.data.categories.map((category) => [category.categorySlug, category.tier]),
          ),
        );
      }
    })();
  }, [setRecommendation, setTiers]);

  async function start(slug: string, recommendationId?: string, dailyChallengeId?: string) {
    setStartingSlug(slug);
    setError(null);

    const result = await apiFetch<CreateSessionResponse>('/api/sessions', {
      method: 'POST',
      // §18.1: the key makes a retried POST return the same session rather
      // than opening a second one.
      headers: { 'idempotency-key': uuidv7() },
      body: JSON.stringify({
        gameType: slug === 'memory' ? 'memory_match' : 'quiz_solo',
        ...(dailyChallengeId ? { dailyChallengeId } : {}),
        categorySlug: slug,
        // §11.8: linking the session is what earns the ×1.5 tier.
        ...(recommendationId ? { recommendationId } : {}),
      }),
    });

    if (result.ok) {
      router.push(`/play/${result.data.sessionId}`);
      return;
    }

    setStartingSlug(null);

    // §8.1: "the client offers Resume or Abandon".
    if (result.error.code === 'ACTIVE_SESSION_EXISTS') {
      const details = result.error.details as
        { sessionId?: string; status?: 'CREATED' | 'ACTIVE' } | undefined;
      if (details?.sessionId && details.status) {
        setOpenSession({ sessionId: details.sessionId, status: details.status });
        return;
      }
    }
    setError(result.error);
  }

  async function discardOpenSession() {
    if (!openSession) return;
    setBusy(true);

    // §15.1 has no CREATED → ABANDONED edge, so which call to make depends on
    // whether anything was served (ADR-041).
    const action = openSession.status === 'ACTIVE' ? 'abandon' : 'cancel';
    await apiFetch(`/api/sessions/${openSession.sessionId}/${action}`, { method: 'POST' });

    setBusy(false);
    setOpenSession(null);
    router.refresh();
  }

  if (openSession) {
    return (
      <ActiveSessionPrompt
        sessionId={openSession.sessionId}
        status={openSession.status}
        busy={busy}
        onResume={() => router.push(`/play/${openSession.sessionId}`)}
        onDiscard={() => void discardOpenSession()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {challenge ? (
        <DailyChallengeCard
          challenge={challenge}
          busy={startingSlug !== null}
          onStart={() => void start(challenge.categorySlug, undefined, challenge.id)}
        />
      ) : null}
      {recommendation ? (
        <FocusCard
          recommendation={recommendation}
          starting={startingSlug === recommendation.categorySlug}
          onStart={() =>
            void start(
              recommendation.categorySlug,
              recommendation.claimable ? recommendation.recommendationId : undefined,
            )
          }
        />
      ) : null}

      <CategoryPicker
        categories={categories.map((category) => ({
          ...category,
          tier: tiers.get(category.slug) ?? 'NONE',
        }))}
        startingSlug={startingSlug}
        error={error}
        onStart={(slug) =>
          void start(
            slug,
            // Starting the recommended category from the picker earns the
            // bonus too — the learner should not have to use the card.
            recommendation?.claimable && recommendation.categorySlug === slug
              ? recommendation.recommendationId
              : undefined,
          )
        }
      />
    </div>
  );
}
