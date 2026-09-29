import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LearnArena',
  description: 'Short, game-like practice that finds your weak areas and rewards you for them.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
