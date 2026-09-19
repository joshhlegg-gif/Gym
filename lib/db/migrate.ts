import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Applied by `npm run build`, which Vercel runs. Merging a migration to main
 * therefore changes production on the next deploy, with no dry run and no
 * approval step — treat every file in drizzle/ as a production change.
 *
 * Runs against DIRECT_URL (session pooler, 5432) because the transaction
 * pooler cannot hold the advisory lock the migrator takes.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error('Neither DIRECT_URL nor DATABASE_URL is set; refusing to guess.');
  process.exit(1);
}

// max: 1 because the migrator's advisory lock has to be held by one connection
// for the whole run.
const sql = postgres(url, { max: 1 });

try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log('migrations: up to date');
} finally {
  await sql.end();
}
