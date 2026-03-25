import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // WHY GLOB PATTERN: Points at the entire schema directory so drizzle-kit
  // automatically picks up merchants.ts, payments.ts, and any future schema files.
  // Without this, new tables would be invisible to 'drizzle-kit generate'.
  schema: './src/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres.wcbqrnlevdorinobqtzo:5QnX_4dEein5$~d@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres",
  },
});
