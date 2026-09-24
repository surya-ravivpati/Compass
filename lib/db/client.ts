import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema.ts'

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

const MIGRATIONS = path.join(process.cwd(), 'lib', 'db', 'migrations')

interface Holder {
  db?: Promise<Database>
}
const holder = globalThis as typeof globalThis & { __compassDb?: Holder }
holder.__compassDb ??= {}

/**
 * The database for this process. With DATABASE_URL it is Postgres; without,
 * an embedded Postgres (PGlite) persisted to .data/pglite, migrated and
 * seeded on first use so `npm run dev` works with no setup.
 */
export function getDb(): Promise<Database> {
  holder.__compassDb!.db ??= connect()
  return holder.__compassDb!.db
}

async function connect(): Promise<Database> {
  const url = process.env.DATABASE_URL
  if (url) {
    const { Pool } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    return drizzle(new Pool({ connectionString: url, max: 10 }), { schema }) as unknown as Database
  }
  const dir = path.join(process.cwd(), '.data', 'pglite')
  mkdirSync(dir, { recursive: true })
  const db = await openPglite(dir)
  const { seedIfEmpty } = await import('./seed.ts')
  await seedIfEmpty(db)
  return db
}

/** An embedded Postgres, migrated. `dataDir` undefined means in-memory (tests). */
export async function openPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const client = dataDir ? new PGlite(dataDir) : new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  return db as unknown as Database
}

/** Applies migrations to the DATABASE_URL database. */
export async function migratePostgres(url: string): Promise<void> {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS })
  } finally {
    await pool.end()
  }
}

export { schema }
