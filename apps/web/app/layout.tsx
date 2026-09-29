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
    <html lang="en" data-theme="light">
      <body className="min-h-dvh">
        <AppNavigation />
        <BreakReminder />
        {children}
        <footer className="border-t bg-secondary/40 px-6 py-8 text-center text-sm text-muted-foreground">
          LearnArena · Build your skills. Find your people. Enjoy the progress.
        </footer>
      </body>
    </html>
  );
}
