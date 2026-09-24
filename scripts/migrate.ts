/** Applies migrations to DATABASE_URL. Local development migrates PGlite automatically. */
import { migratePostgres } from '../lib/db/client.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. (Without it, `npm run dev` uses an embedded database and migrates it for you.)')
  process.exit(1)
}
await migratePostgres(url)
console.log('Migrations applied.')
