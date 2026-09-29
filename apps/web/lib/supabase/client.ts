'use client';

import { createBrowserClient } from '@supabase/ssr';
import { assertSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '../publicEnv';

/**
 * Supabase client for the browser (§20 screen 1: email magic link + Google).
 *
 * Only used to start an auth flow. Every read of application data goes through
 * `/api/*`, because RLS denies the anon role everything (§14.1).
 */
export function createSupabaseBrowserClient() {
  assertSupabaseConfigured();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
