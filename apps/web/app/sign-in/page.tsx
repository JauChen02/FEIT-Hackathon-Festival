'use client';

import { useState } from 'react';
import { SignInForm } from '@/components/ui-app/SignInForm';
import type { ApiError } from '@/components/ui-app/StateBoundary';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Sign up / sign in (PLANNING.md §20 screen 1).
 *
 * The page owns the Supabase calls and the request state; `SignInForm` is
 * presentational (ADR-021).
 */
export default function SignInPage() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<ApiError | null>(null);

  const callbackUrl = () => `${window.location.origin}/auth/callback`;

  async function sendMagicLink(email: string) {
    setStatus('sending');
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });

    if (authError) {
      setStatus('idle');
      setError({
        // Supabase rate-limits magic links; surface that as the §16.1 code the
        // rest of the UI already knows how to render.
        code: authError.status === 429 ? 'RATE_LIMITED' : 'INVALID_INPUT',
        message: authError.message,
      });
      return;
    }
    setStatus('sent');
  }

  async function signInWithGoogle() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    });
    if (authError) {
      setError({ code: 'INTERNAL_ERROR', message: authError.message });
    }
  }

  return (
    <main className="auth-layout">
      <section className="space-y-7">
        <span className="feature-chip">
          <span className="size-2 rounded-full bg-primary" />
          Your next learning adventure
        </span>
        <h1 className="font-display text-5xl leading-[1.08] font-bold tracking-tight md:text-6xl">
          <span className="gradient-text">Small challenges.</span>
          <br />
          Extraordinary progress.
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
          Turn a little curiosity into a daily habit. Sharpen your skills, challenge your friends,
          and discover what you’re capable of.
        </p>
        <div className="flex flex-wrap gap-3">
          <span className="feature-chip">✦ Personal skill coaching</span>
          <span className="feature-chip">↯ Multiplayer battles</span>
          <span className="feature-chip">◈ Streaks &amp; rewards</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Quizzes · Speed math · Memory · Interactive stories
        </p>
      </section>
      <div className="auth-form-wrap">
        <SignInForm
          onSendMagicLink={sendMagicLink}
          onGoogleSignIn={signInWithGoogle}
          status={status}
          error={error}
        />
      </div>
    </main>
  );
}
