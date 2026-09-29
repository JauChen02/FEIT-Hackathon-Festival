import Link from 'next/link';
export function AppNavigation() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-(--container-shell) flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link href="/home" className="flex items-center gap-3 text-xl font-bold tracking-tight">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          >
            L
          </span>
          LearnArena
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap gap-5 text-sm font-medium">
          <Link href="/home">Practice</Link>
          <Link href="/games">Games</Link>
          <Link href="/lobbies">Arena</Link>
          <Link href="/skills">My skills</Link>
          <Link href="/history">History</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/friends">Friends</Link>
          <Link href="/achievements">Achievements</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </div>
    </header>
  );
}
