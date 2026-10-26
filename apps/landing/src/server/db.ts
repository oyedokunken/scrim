import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getServerEnv } from './env';

const holder = globalThis as unknown as { scrimPrisma?: PrismaClient };

/**
 * One database client per process. It connects through the pooled `DATABASE_URL`. In development
 * the client is kept on `globalThis`, so hot reloads do not open a new pool every time.
 */
export function getDb(): PrismaClient {
  holder.scrimPrisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: getServerEnv().DATABASE_URL }),
  });
  return holder.scrimPrisma;
}
