import 'server-only';
import { AppError } from '@learnarena/core';
import { createSupabaseServerClient } from '../supabase/server';

/**
 * Who is making this request.
 *
 * Deliberately narrow: the rest of the app needs the Supabase user id and
 * nothing else. Email stays here and is never returned by an API or written to
 * a log (§19.4).
 */
export interface SessionUser {
  id: string;
}

export type SessionResolver = (request: Request) => Promise<SessionUser | null>;

/**
 * The real resolver: validates the auth cookie against Supabase.
 *
 * `getUser()` rather than `getSession()`, because the latter trusts the cookie
 * contents, which a client controls.
 */
const supabaseResolver: SessionResolver = async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
};

let resolver: SessionResolver = supabaseResolver;

/**
 * Replace the session resolver.
 *
 * This is the seam that lets the integration tests (§22.2) call route handlers
 * directly against a real database while faking only the identity. Everything
 * else on the request path — Zod parsing, the error envelope, every database
 * constraint and transaction — stays real.
 *
 * Returns a function that restores the previous resolver.
 */
export function setSessionResolver(next: SessionResolver): () => void {
  const previous = resolver;
  resolver = next;
  return () => {
    resolver = previous;
  };
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  return resolver(request);
}

/** The signed-in user, or `401 UNAUTHORIZED` (§16.1). */
export async function requireSessionUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new AppError('UNAUTHORIZED');
  return user;
}
