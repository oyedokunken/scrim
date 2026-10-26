import 'server-only';
import { z } from 'zod';

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// connection string');

/** The few values pages need, including at build time. */
const siteSchema = z.object({
  SITE_URL: z
    .url()
    .refine((value) => /^https?:\/\//.test(value), 'must start with http:// or https://')
    .transform((value) => value.replace(/\/+$/, '')),
  GITHUB_REPO: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must look like owner/name'),
});

/** Everything the running server needs. */
const serverSchema = siteSchema.extend({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: z.enum(['true', 'false']).transform((value) => value === 'true'),
  // Mail catchers such as Mailpit need no login, so these may be empty.
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().min(3),
  IP_HASH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  GITHUB_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value)),
});

export type SiteEnv = z.infer<typeof siteSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

/** Names of every variable the app reads. `.env.example` must list exactly these. */
export const envKeys = Object.keys(serverSchema.shape);

const PLACEHOLDER_SECRET = /^change-me/i;

/**
 * Describes what is wrong without echoing any value, so a bad secret never reaches a log.
 */
function describeProblems(error: z.ZodError): string {
  const lines = error.issues.map(
    (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  return [
    'Invalid environment configuration:',
    ...lines,
    'Copy apps/landing/.env.example to apps/landing/.env and fill in the values.',
  ].join('\n');
}

export function parseSiteEnv(source: Record<string, string | undefined>): SiteEnv {
  const result = siteSchema.safeParse(source);
  if (!result.success) {
    throw new Error(describeProblems(result.error));
  }
  return result.data;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    throw new Error(describeProblems(result.error));
  }
  if (source.NODE_ENV === 'production' && PLACEHOLDER_SECRET.test(result.data.IP_HASH_SECRET)) {
    throw new Error(
      'Invalid environment configuration:\n  IP_HASH_SECRET: still the placeholder from .env.example. Generate a random value.',
    );
  }
  return result.data;
}

let cachedSite: SiteEnv | undefined;
let cachedServer: ServerEnv | undefined;

/** Validated site values. Safe to call during the build. */
export function getSiteEnv(): SiteEnv {
  cachedSite ??= parseSiteEnv(process.env);
  return cachedSite;
}

/** Validated server values. Throws a readable error when anything is missing. */
export function getServerEnv(): ServerEnv {
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}
