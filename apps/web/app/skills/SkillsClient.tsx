'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { SkillsResponse } from '@learnarena/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RatingHistoryChart } from '@/components/ui-app/RatingHistoryChart';
import { SkillList } from '@/components/ui-app/SkillList';
import { SkillRadar } from '@/components/ui-app/SkillRadar';
import { StateBoundary, type ApiError } from '@/components/ui-app/StateBoundary';
import { apiFetch } from '@/hooks/useApi';

/**
 * The Skills screen (PLANNING.md §20 screen 7).
 *
 * ADR-021: this owns the fetch; the radar, list and chart are presentational.
 */
export function SkillsClient() {
  const [skills, setSkills] = useState<SkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const result = await apiFetch<SkillsResponse>('/api/me/skills');
    if (result.ok) {
      setSkills(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  return (
    <StateBoundary loading={loading} error={error} onRetry={() => void load()}>
      {skills ? (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your skills</CardTitle>
            </CardHeader>
            <CardContent>
              <SkillRadar categories={skills.categories} />
            </CardContent>
          </Card>

          <SkillList
            categories={skills.categories}
            strengths={skills.strengths}
            weaknesses={skills.weaknesses}
          />

          <RatingHistoryChart histories={skills.histories} />

          <Button asChild variant="outline" className="self-start" data-testid="skills-home-link">
            <Link href="/home">Back to home</Link>
          </Button>
        </div>
      ) : null}
    </StateBoundary>
  );
}
