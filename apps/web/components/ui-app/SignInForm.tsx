'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice, type ApiError } from './StateBoundary';

/**
 * Sign up / sign in (PLANNING.md §20 screen 1: "Email magic link + Google OAuth").
 *
 * Presentational (ADR-021): it owns only the email text box. Sending the link
 * and starting the OAuth redirect are passed in by the page, which is where the
 * Supabase client lives.
 */

export interface SignInFormProps {
  onSendMagicLink: (email: string) => void;
  onGoogleSignIn: () => void;
  status: 'idle' | 'sending' | 'sent';
  error: ApiError | null;
}

export function SignInForm({ onSendMagicLink, onGoogleSignIn, status, error }: SignInFormProps) {
  const [email, setEmail] = useState('');

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="px-8 pt-8 pb-6">
        <CardTitle className="text-2xl">Sign in to LearnArena</CardTitle>
        <CardDescription>We will email you a link. No password to remember.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 px-8 pb-8">
        {error ? <ErrorNotice error={error} /> : null}

        {status === 'sent' ? (
          <p role="status" data-testid="magic-link-sent" className="text-sm">
            Check your inbox — we sent a sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSendMagicLink(email.trim());
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <Button type="submit" disabled={status === 'sending' || email.trim() === ''}>
              {status === 'sending' ? 'Sending…' : 'Email me a link'}
            </Button>
          </form>
        )}

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" onClick={onGoogleSignIn}>
          Continue with Google
        </Button>
      </CardContent>
    </Card>
  );
}
