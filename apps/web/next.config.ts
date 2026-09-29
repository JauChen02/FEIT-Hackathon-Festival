import '@learnarena/db/loadEnv';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source, not build output.
  transpilePackages: ['@learnarena/core', '@learnarena/db'],
  typedRoutes: true,
  eslint: {
    // CI runs `pnpm lint` across the whole workspace with one shared flat
    // config (§22.5). Letting `next build` run a second, different ESLint pass
    // would mean two sets of rules disagreeing about the same files.
    ignoreDuringBuilds: true,
  },
  // `postgres` and `pino` are Node-only; keep them out of the bundle graph.
  serverExternalPackages: ['postgres', 'pino'],
};

export default nextConfig;
