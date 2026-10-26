import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(import.meta.dirname, 'src'),
      // The real package throws outside a server bundle. Tests run in plain Node.
      'server-only': path.join(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
