/** Checks every catalog without touching a database. */
import { validateCatalog } from '../lib/engine/catalog.ts'
import { allCatalogs } from './catalogs.ts'

let failed = false
for (const school of allCatalogs()) {
  const issues = validateCatalog(school)
  const errors = issues.filter((i) => i.severity === 'error')
  console.log(`${school.name}: ${school.courses.length} courses, ${errors.length} errors, ${issues.length - errors.length} warnings`)
  for (const i of issues) console.log(`  ${i.severity.padEnd(7)} ${i.path}: ${i.message}`)
  if (errors.length) failed = true
}
process.exit(failed ? 1 : 0)
