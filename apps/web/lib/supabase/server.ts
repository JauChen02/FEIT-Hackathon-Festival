import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseUrl } from '../publicEnv';

/**
 * Supabase client for server components and route handlers (§21.1, §20 screen 1).
 *
 * Reads and refreshes the auth cookies through Next's cookie store. Server
 * components cannot set cookies, hence the swallowed error in `setAll` — the
 * middleware refreshes the session for those requests instead.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only.
          // middleware.ts performs the refresh, so this is safe to ignore.
        }
      },
    },
  });
}
