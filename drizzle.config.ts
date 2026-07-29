import type { Config } from 'drizzle-kit';
import { loadEnvConfig } from '@next/env';

// drizzle-kit runs outside Next, so .env.local is not loaded automatically.
loadEnvConfig(process.cwd());

export default {
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
