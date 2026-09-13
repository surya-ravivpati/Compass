/**
 * Harness for the live row-level-security proof.
 *
 * Connects as an administrator to set the database up, then hands out
 * connections that behave exactly like a signed-in student's: the
 * `authenticated` role, with `request.jwt.claims` carrying their id -- which
 * is precisely what Supabase's PostgREST does with a real JWT.
 *
 * Nothing about the policies is relaxed for the test. The policies exercised
 * here are the ones in db/migrations/0001_rls.sql, unmodified.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Sql } from "postgres";

/**
 * Deliberately a separate variable from DATABASE_URL. Pointing a test that
 * creates and deletes users at a production database should take an explicit
 * act, not a shared default.
 */
export function testDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  return url !== undefined && url.length > 0 ? url : undefined;
}

export function connectAdmin(url: string): Sql {
  return postgres(url, { max: 2, prepare: false, onnotice: () => {} });
}

function readSql(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

async function runScript(sql: Sql, text: string): Promise<void> {
  for (const statement of text.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed.length === 0) continue;
    await sql.unsafe(trimmed);
  }
}

/**
 * Bring the database to a state the policies can be tested against.
 *
 * Each step is skipped if it has already been done, so this is safe to run
 * against a fresh Postgres or an existing Supabase project alike.
 */
export async function prepareDatabase(sql: Sql): Promise<void> {
  const authUidRows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'auth' AND p.proname = 'uid'
    ) AS exists
  `;
  const hasAuthUid = authUidRows[0]?.exists ?? false;

  // Present on Supabase; needs standing up on a bare Postgres.
  if (!hasAuthUid) {
    await runScript(sql, readSql("db/test-harness/supabase-stub.sql"));
  }

  const tableRows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'courses'
    ) AS exists
  `;
  const hasTables = tableRows[0]?.exists ?? false;

  if (!hasTables) {
    await runScript(sql, readSql("db/migrations/0000_schema.sql"));
    await runScript(sql, readSql("db/migrations/0001_rls.sql"));
  }
}

/** Create a user in auth.users and return their id. */
export async function createUser(sql: Sql): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id
  `;
  if (row === undefined) throw new Error("Could not create a test user.");
  return row.id;
}

export async function deleteUser(sql: Sql, userId: string): Promise<void> {
  await sql`DELETE FROM auth.users WHERE id = ${userId}`;
}

/**
 * Run a query the way the application would for a given signed-in student.
 *
 * `SET LOCAL` confines both the role and the claims to this transaction, so
 * one student's session cannot leak into the next.
 */
export async function asUser<T>(
  sql: Sql,
  userId: string,
  work: (tx: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`SET LOCAL ROLE authenticated`;
    return work(tx as unknown as Sql);
  }) as Promise<T>;
}

/** Run a query as a signed-out visitor. */
export async function asAnon<T>(sql: Sql, work: (tx: Sql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', '', true)`;
    await tx`SET LOCAL ROLE anon`;
    return work(tx as unknown as Sql);
  }) as Promise<T>;
}

/** True when the work throws a Postgres permission or policy error. */
export async function isRejected(work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return false;
  } catch {
    return true;
  }
}
