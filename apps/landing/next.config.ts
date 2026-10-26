import path from 'node:path';
import type { NextConfig } from 'next';
import { securityHeaders } from './src/security-headers';

const monorepoRoot = path.join(import.meta.dirname, '../..');

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@scrim/tokens', '@scrim/core'],
  // The workspace packages live outside this folder, so tracing and bundling start at the root.
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  images: { formats: ['image/avif', 'image/webp'] },
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') },
    ]);
  },
};

export default config;
