'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import type { CategorySkill } from '@learnarena/core';

/**
 * The skills radar (PLANNING.md §20 screen 7).
 *
 * "Radar chart (one axis per launch category, **opacity by confidence**),
 *  strengths/weaknesses list, per-category rating history."
 *
 * Recharts draws one polygon per series, so a per-axis opacity is not
 * expressible without a custom shape renderer — and ADR-021 defers exactly
 * that kind of work to the Stitch pass. The polygon's opacity therefore
 * tracks **mean** confidence, and `SkillList` shows each category's own
 * confidence beside it, so nothing is lost.
 *
 * Presentational (ADR-021). Colours come from the theme tokens in globals.css.
 */

export interface SkillRadarProps {
  categories: readonly CategorySkill[];
}

export function SkillRadar({ categories }: SkillRadarProps) {
  if (categories.length === 0) return null;

  const meanConfidence =
    categories.reduce((total, category) => total + category.confidence, 0) / categories.length;

  // Floor it so a brand-new learner still sees the shape of their profile
  // rather than an invisible polygon.
  const fillOpacity = 0.15 + meanConfidence * 0.45;

  const data = categories.map((category) => ({
    category: category.categoryName,
    proficiency: Math.round(category.proficiency),
  }));

  return (
    <div className="h-64 w-full" data-testid="skill-radar">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Proficiency"
            dataKey="proficiency"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={fillOpacity}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
