import type { Config } from 'tailwindcss';

/**
 * Tailwind v4 is CSS-first: the design tokens live in `app/globals.css` under
 * `@theme`, which is the single theme file ADR-021 asks for. This file exists
 * only for content globbing and plugins, and deliberately defines no tokens —
 * adding scales here would give the Google Stitch pass two places to edit.
 */
export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  plugins: [],
} satisfies Config;
