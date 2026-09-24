/**
 * Step 3 of the catalog pipeline: turn a reviewed draft into a catalog the
 * engine accepts. Refuses -- and says exactly why -- until nothing required
 * is missing.
 *
 *   npm run catalog:build -- my-school
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildSchool } from '../lib/ingest/build.ts'
import type { CatalogOverrides, DraftCatalog } from '../lib/ingest/types.ts'

const school = process.argv[2]
if (!school) {
  console.error('Usage: npm run catalog:build -- <school-id>')
  process.exit(1)
}
const dir = path.join('data', 'catalogs', school)
const draft = JSON.parse(readFileSync(path.join(dir, 'extracted.json'), 'utf8')) as DraftCatalog
const overrides = JSON.parse(readFileSync(path.join(dir, 'overrides.json'), 'utf8')) as CatalogOverrides
const result = buildSchool(draft, overrides)
for (const w of result.warnings) console.warn(`warning  ${w}`)
if (!result.school) {
  for (const e of result.errors) console.error(`error    ${e}`)
  console.error(`\n${result.errors.length} problem(s). Nothing was written.`)
  process.exit(1)
}
writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(result.school, null, 2) + '\n')
console.log(`Wrote ${path.join(dir, 'catalog.json')}: ${result.school.courses.length} courses. Load it with npm run db:seed.`)
