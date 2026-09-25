/** Loads every valid catalog into the database (DATABASE_URL, or the local embedded one). */
import path from 'node:path'
import { openPglite, type Database } from '../lib/db/client.ts'
import { seedSchool } from '../lib/db/seed.ts'
import { allCatalogs } from './catalogs.ts'

let db: Database
let close: () => Promise<void> = async () => {}
if (process.env.DATABASE_URL) {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await import('../lib/db/schema.ts')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  db = drizzle(pool, { schema }) as unknown as Database
  close = () => pool.end()
} else {
  db = await openPglite(path.join(process.cwd(), '.data', 'pglite'))
  // An open embedded database keeps the process alive after seeding.
  const client = (db as unknown as { $client: { close(): Promise<void> } }).$client
  close = () => client.close()
}
for (const school of allCatalogs()) {
  await seedSchool(db, school)
  console.log(`Seeded ${school.name} (${school.courses.length} courses).`)
}
await close()
