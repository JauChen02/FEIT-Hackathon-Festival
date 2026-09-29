'use client';
import Link from 'next/link';
import { SignOutButton } from './SignOutButton';
import { usePathname } from 'next/navigation';
const links = [
  ['/home', 'Practice'],
  ['/games', 'Games'],
  ['/lobbies', 'Battle arena'],
  ['/skills', 'My skills'],
  ['/leaderboard', 'Rankings'],
  ['/friends', 'Friends'],
  ['/achievements', 'Achievements'],
  ['/history', 'History'],
  ['/feed', 'Feed'],
  ['/settings', 'Settings'],
];
export function AppNavigation() {
  const pathname = usePathname();
  const publicPage = pathname === '/sign-in' || pathname === '/onboarding';
  return (
    <header className="border-b border-border/60 bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:block focus:p-3">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-(--container-shell) flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-10">
        <Link
          href="/home"
          className="flex items-center gap-3 font-display text-xl font-bold tracking-tight"
        >
          <span aria-hidden="true" className="brand-mark">
            ↯
          </span>
          LearnArena
        </Link>
        <span className="hidden text-sm text-muted-foreground md:block">
          A little practice. A little more possibility.
        </span>
        <div className="flex items-center gap-3">
          {pathname !== '/sign-in' && <SignOutButton />}
          <Link
            href={publicPage ? '/sign-in' : '/lobbies'}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary"
          >
            {publicPage ? 'Get started' : 'Enter battle'} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      {!publicPage && (
        <nav
          aria-label="Main navigation"
          className="site-nav mx-auto max-w-(--container-shell) px-4 pb-3 md:px-8"
        >
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href!}
              aria-current={
                pathname === href || pathname.startsWith(href + '/') ? 'page' : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <div id="main-content" tabIndex={-1} />
    </header>
  );
}
