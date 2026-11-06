import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    // Many of these tests write and read real files through the recording engine. On a hosted
    // runner, with the virus scanner reading every new file, one of them can take longer than the
    // default 5 seconds without anything being wrong.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
