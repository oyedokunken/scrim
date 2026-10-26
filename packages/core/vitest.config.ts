import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Barrels and type only files hold no logic to cover.
      exclude: ['src/**/index.ts', 'src/entry-*.ts', 'src/input/types.ts'],
      thresholds: { lines: 95, functions: 95, branches: 90 },
    },
  },
});
