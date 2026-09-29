'use client';

import { useState } from 'react';
import {
  DISPLAY_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@learnarena/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ErrorNotice, type ApiError } from './StateBoundary';

/**
 * Onboarding (PLANNING.md §20 screen 2: "Username, display name, timezone
 * (auto-detected, editable), age confirmation (16+)").
 *
 * Presentational (ADR-021): no fetching, no Supabase, no business rules. The
 * page detects the timezone and performs the POST; this component collects the
 * four fields and surfaces whatever the API said.
 */

export interface OnboardingValues {
  username: string;
  displayName: string;
  timezone: string;
  ageConfirmed: boolean;
}

export interface OnboardingFormProps {
  timezones: readonly string[];
  detectedTimezone: string;
  submitting: boolean;
  error: ApiError | null;
  onSubmit: (values: OnboardingValues) => void;
}

/** Pull the field-level message Zod reported, so it can sit under that input. */
function fieldMessage(error: ApiError | null, field: string): string | null {
  if (!error) return null;
  if (error.code === 'USERNAME_TAKEN' && field === 'username') {
    return 'That username is already taken.';
  }
  if (error.code !== 'INVALID_INPUT') return null;

  const issues = error.details?.issues;
  if (!Array.isArray(issues)) return null;

  const match = issues.find(
    (issue): issue is { path: string; message: string } =>
      typeof issue === 'object' && issue !== null && (issue as { path?: unknown }).path === field,
  );
  return match?.message ?? null;
}

export function OnboardingForm({
  timezones,
  detectedTimezone,
  submitting,
  error,
  onSubmit,
}: OnboardingFormProps) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const usernameError = fieldMessage(error, 'username');
  const displayNameError = fieldMessage(error, 'displayName');
  const timezoneError = fieldMessage(error, 'timezone');

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Set up your profile</CardTitle>
        <CardDescription>Four quick things, then you can start playing.</CardDescription>
      </CardHeader>

      <CardContent>
        {/* Only show the whole-form error when it is not already on a field. */}
        {error && !usernameError && !displayNameError && !timezoneError ? (
          <div className="mb-4">
            <ErrorNotice error={error} />
          </div>
        ) : null}

        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ username, displayName, timezone, ageConfirmed });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={USERNAME_MIN_LENGTH}
              maxLength={USERNAME_MAX_LENGTH}
              autoComplete="username"
              required
              aria-describedby="username-hint"
              aria-invalid={usernameError ? true : undefined}
            />
            <p id="username-hint" className="text-xs text-muted-foreground">
              {USERNAME_MIN_LENGTH}–{USERNAME_MAX_LENGTH} characters: lowercase letters, numbers and
              underscores.
            </p>
            {usernameError ? (
              <p role="alert" data-testid="username-error" className="text-xs text-destructive">
                {usernameError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              autoComplete="nickname"
              required
              aria-invalid={displayNameError ? true : undefined}
            />
            {displayNameError ? (
              <p role="alert" className="text-xs text-destructive">
                {displayNameError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              id="timezone"
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              aria-describedby="timezone-hint"
            >
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
            <p id="timezone-hint" className="text-xs text-muted-foreground">
              Your streak day rolls over at midnight here.
            </p>
            {timezoneError ? (
              <p role="alert" className="text-xs text-destructive">
                {timezoneError}
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="ageConfirmed"
              name="ageConfirmed"
              className="mt-1"
              checked={ageConfirmed}
              onChange={(event) => setAgeConfirmed(event.target.checked)}
              required
            />
            <Label htmlFor="ageConfirmed" className="leading-snug">
              I confirm I am 16 or older.
            </Label>
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Start learning'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
