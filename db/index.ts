/**
 * The Drizzle client.
 *
 * This connection uses DATABASE_URL, which is a privileged, RLS-bypassing
 * connection. It is therefore used for exactly two things:
 *
 *   - reading reference data (the course catalog, clubs, pathways,
 *     requirements), which is public to every signed-in student anyway
 *   - migrations and seeding
 *
 * **Student-owned rows are never read or written through this client.** Those
 * go through the Supabase client carrying the student's own access token, so
 * that row-level security is enforced by Postgres against a real identity
 * rather than by application code remembering to add a WHERE clause. An ORM
 * query that forgets its filter is a data breach; a missing RLS policy is
 * caught by the tests in tests/db.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (database === undefined) {
    // `prepare: false` is required by Supabase's transaction-mode connection
    // pooler, which does not support prepared statements.
    client = postgres(serverEnv().DATABASE_URL, { prepare: false });
    database = drizzle(client, { schema });
  }
  return database;
}

/** Close the pool. For scripts and tests; the server keeps its connection. */
export async function closeDb(): Promise<void> {
  await client?.end();
  client = undefined;
  database = undefined;
}

export { schema };
