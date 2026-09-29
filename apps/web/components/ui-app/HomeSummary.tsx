import Link from 'next/link';
import { Button } from '@/components/ui/button';
export interface HomeSummaryProps {
  displayName: string;
  username: string;
  timezone: string;
  totalPoints: number;
}
export function HomeSummary({ displayName, username, timezone, totalPoints }: HomeSummaryProps) {
  return (
    <section className="hero-panel grid items-center gap-8 md:grid-cols-[1fr_auto]">
      <div className="space-y-5">
        <span className="eyebrow">Your daily dose of discovery</span>
        <h1 data-testid="home-greeting" className="text-4xl leading-tight font-bold md:text-5xl">
          Welcome, {displayName}
          <br />
          <span className="gradient-text">Let curiosity lead.</span>
        </h1>
        <p className="max-w-lg leading-relaxed text-muted-foreground">
          A quick challenge, a new discovery, a little more confidence. Make your next move.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/games">
              Explore games <span aria-hidden="true">↗</span>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/lobbies">Challenge friends</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          @{username} · {timezone}
        </p>
      </div>
      <div className="soft-card rounded-xl border bg-card p-7 text-center md:min-w-48 md:rotate-3">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-secondary text-2xl text-primary"
        >
          ✦
        </span>
        <p className="text-xs tracking-widest text-muted-foreground uppercase">Your progress</p>
        <p data-testid="total-points" className="my-2 font-display text-4xl font-bold">
          {totalPoints.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground">Total points earned</p>
        <div className="mt-4 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
          One challenge at a time
        </div>
      </div>
    </section>
  );
}
