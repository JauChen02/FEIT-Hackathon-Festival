import { redirect } from 'next/navigation';
import { findUserById } from '@learnarena/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Root: send the visitor wherever they actually belong.
 *
 * ADR-022: the presence of a `users` row is the onboarding state, so the
 * three-way decision is made here in one place rather than being duplicated
 * across the auth callbacks.
 */
export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  const profile = await findUserById(db(), user.id);
  redirect(profile ? '/home' : '/onboarding');
}
