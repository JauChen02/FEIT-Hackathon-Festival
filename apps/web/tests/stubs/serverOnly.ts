/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * In a Next.js build, importing `server-only` from a client component is a hard
 * error — that is what stops a secret leaking into the browser bundle. Vitest
 * runs everything in Node with no such boundary, so the import must simply
 * succeed. The real protection is still verified by `next build`.
 */
export {};
