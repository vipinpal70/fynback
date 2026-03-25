/**
 * packages/db/src/index.ts
 *
 * Public API for the @fynback/db package.
 *
 * WHY EXPORT EVERYTHING FROM ONE PLACE?
 * All consumers (apps/web, apps/worker) import from '@fynback/db' — one import,
 * all tables, enums, queries, and the createDb factory. This avoids deep import
 * paths like '@fynback/db/src/schema/payments' that would break on refactoring.
 *
 * WHY RE-EXPORT FROM 'drizzle-orm'?
 * Consumers need drizzle operators (eq, and, or, sql, etc.) to write queries.
 * Re-exporting them here means consumers import from ONE package, not two.
 * Without this: import { eq } from 'drizzle-orm' + import { users } from '@fynback/db'
 * With this:    import { eq, users } from '@fynback/db' ✓
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as merchantSchema from './schema/merchants';
import * as paymentSchema from './schema/payments';

// ── Schema exports ────────────────────────────────────────────────────────────

// Core business identity (merchants, users, teams)
export * from './schema/merchants';

// Payment recovery engine (gateway connections, failed payments, jobs, analytics)
export * from './schema/payments';

// ── Query exports ─────────────────────────────────────────────────────────────
export * from './queries/onboarding';
export * from './queries/payments';

// ── Drizzle ORM operators ─────────────────────────────────────────────────────
// Re-exported so consumers don't need 'drizzle-orm' as a direct dependency
export * from 'drizzle-orm';

// ── Database factory ──────────────────────────────────────────────────────────

/**
 * Creates and returns a typed Drizzle database client.
 *
 * WHY A FACTORY (not a singleton)?
 * Next.js runs in a serverless/edge environment where module-level singletons
 * can cause connection pool exhaustion. A factory lets each request create and
 * close connections cleanly.
 *
 * WHY { prepare: false }?
 * Supabase uses PgBouncer in transaction pooling mode, which does NOT support
 * prepared statements. Without this, Drizzle would attempt to use prepared
 * statements and get "prepared statement does not exist" errors.
 *
 * @param connectionString - PostgreSQL connection string (from DATABASE_URL env var)
 */
export const createDb = (connectionString: string) => {
  // Merge all schema tables into one schema object for full type inference
  const schema = {
    ...merchantSchema,
    ...paymentSchema,
  };

  const client = postgres(connectionString, {
    prepare: false, // Required for Supabase PgBouncer / transaction pooling
  });

  return drizzle(client, { schema });
};

// Convenience type: the return type of createDb, used for type annotations
export type Database = ReturnType<typeof createDb>;
