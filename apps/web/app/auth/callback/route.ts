import { NextResponse } from 'next/server';
import { findUserById } from '@learnarena/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Auth callback (PLANNING.md §20 screen 1).
 *
 * Handles both flows that land here:
 *   - Google OAuth and PKCE magic links arrive with `?code=`
 *   - email OTP links arrive with `?token_hash=&type=`
 *
 * Either way the session cookie is set, then the user is sent to onboarding or
 * Home depending on whether their `users` row exists (ADR-022).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectTo(url, '/sign-in?error=auth_failed');
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'magiclink' | 'signup' | 'recovery' | 'invite',
      token_hash: tokenHash,
    });
    if (error) return redirectTo(url, '/sign-in?error=link_expired');
  } else {
    return redirectTo(url, '/sign-in?error=missing_code');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectTo(url, '/sign-in?error=no_session');

  const profile = await findUserById(db(), user.id);
  return redirectTo(url, profile ? '/home' : '/onboarding');
}

function redirectTo(base: URL, path: string): Response {
  return NextResponse.redirect(new URL(path, base.origin));
}
