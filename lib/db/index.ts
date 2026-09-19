import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * The application's connection, through the transaction pooler on 6543.
 *
 * Vercel opens a connection per serverless invocation, so the pooler is what
 * stops a busy minute exhausting the database. `prepare: false` is required:
 * the transaction pooler hands each statement to whichever backend is free, so
 * a prepared statement created on one is not there on the next.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = postgres(url, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
