import type { Config } from 'drizzle-kit';

/**
 * Migrations run against DIRECT_URL, the session pooler on 5432. The
 * transaction pooler on 6543 cannot hold the advisory locks a migration needs,
 * and direct connections are IPv6-only, which fails on Vercel.
 */
export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
  strict: true,
} satisfies Config;
