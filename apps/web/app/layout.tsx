import { BreakReminder } from '@/components/ui-app/BreakReminder';
import { AppNavigation } from '@/components/ui-app/AppNavigation';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LearnArena',
  description: 'Short, game-like practice that finds your weak areas and rewards you for them.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <AppNavigation />
        <BreakReminder />
        {children}
        <footer className="border-t p-6 text-center text-sm text-muted-foreground">
          A little practice. A little progress. Every day.
        </footer>
      </body>
    </html>
  );
}
