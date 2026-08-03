import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  // `npm run db:generate` only needs the schema; applying migrations goes
  // through wrangler (see db:migrate:* scripts), which handles D1 auth.
  verbose: true,
  strict: true,
});
