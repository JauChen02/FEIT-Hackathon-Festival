/**
 * Configuration that is safe in the browser bundle.
 *
 * The Supabase URL and anon key are public by design — row level security is
 * deny-all (§14.1), so the anon key grants nothing. Everything secret lives in
 * lib/env.ts behind `server-only`.
 *
 * These are read as literal `process.env.X` expressions rather than through a
 * helper, because Next.js inlines NEXT_PUBLIC_* only when it can see the
 * property access statically.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function assertSupabaseConfigured(): void {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. ' +
        'Run `pnpm supabase start` and copy the values into .env.local (see .env.example).',
    );
  }
}
