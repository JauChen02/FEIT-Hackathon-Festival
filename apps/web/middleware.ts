import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

/**
 * Session refresh and the signed-in gate (PLANNING.md §19.1).
 *
 * This runs on the edge runtime, so it deliberately does no database work: the
 * onboarding check needs Postgres and lives in `requireOnboarded()` and the
 * page-level guards instead (ADR-022). All this does is keep the Supabase
 * cookie fresh and bounce anonymous visitors to sign-in.
 */
const PROTECTED_PREFIXES = ['/home', '/onboarding'];

export async function middleware(request: NextRequest) {
  const { response, userId } = await updateSupabaseSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !userId) {
    const signIn = new URL('/sign-in', request.url);
    return NextResponse.redirect(signIn);
  }

  if (pathname === '/sign-in' && userId) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation. API routes do
     * their own auth through `route()` + the guards, but they still benefit
     * from the cookie refresh.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
