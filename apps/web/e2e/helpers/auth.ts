import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

/**
 * Sign a brand-new user in through the real magic-link flow (ADR-033).
 *
 * `auth.admin.generateLink` asks the local Supabase stack for the exact URL it
 * would have emailed, and the test then navigates to it. That exercises the
 * genuine `/auth/callback` verification path without scraping HTML out of an
 * inbox, which is the flaky part of testing magic links.
 *
 * Uses the service-role key, which only exists on the local stack and in CI.
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ' +
        'Run `pnpm supabase start` and update .env.local.',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let counter = 0;

/** A fresh address per call, so every test starts from a clean account. */
export function uniqueEmail(): string {
  counter += 1;
  return `e2e-${Date.now()}-${counter}@example.com`;
}

/**
 * Create the account and land the browser on whatever page the app redirects a
 * freshly-verified user to (`/onboarding` for a new account).
 */
export async function signInViaMagicLink(page: Page, email: string): Promise<void> {
  const supabase = adminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });
  if (error) throw error;

  // Asking for a `magiclink` on an address that has never signed in creates the
  // user and hands back a **signup** token instead. Passing the type we asked
  // for rather than the type we got makes verifyOtp reject the token, so read
  // it from the response.
  const { hashed_token: tokenHash, verification_type: type } = data.properties;

  // Go straight to our own callback rather than following `action_link`, which
  // bounces via Supabase's /verify endpoint. One fewer hop, and no dependence
  // on the shape of that redirect.
  const url = new URL('/auth/callback', siteUrl);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);

  await page.goto(url.toString());
}

/** A username that fits the 3–20 char `[a-z0-9_]` rule and cannot collide. */
export function uniqueUsername(prefix = 'e2e'): string {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`.slice(-10);
  return `${prefix}_${suffix}`.slice(0, 20);
}
