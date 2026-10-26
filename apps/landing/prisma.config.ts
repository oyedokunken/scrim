import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file. CI and Vercel provide real environment variables.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // The CLI connects with the direct connection or session pooler, never the transaction
    // pooler. `generate` does not connect, so an unset value gets an unreachable placeholder
    // that makes any command which does need a database fail loudly.
    url: process.env.DIRECT_URL ?? 'postgresql://unset:unset@unset.invalid:5432/unset',
  },
});
