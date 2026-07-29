// lib/db.ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
}

// Supabase connection. Use the *Transaction pooler* URI (port 6543) in
// serverless environments; prepared statements must be disabled for it.
const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
});

export const db = drizzle(client, { schema });
