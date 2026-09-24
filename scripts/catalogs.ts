import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DEMO_SCHOOL } from '../lib/catalog/demo-school.ts'
import type { SchoolConfig } from '../lib/engine/types.ts'

/** The demo catalog plus every built catalog under data/catalogs/. */
export function allCatalogs(): SchoolConfig[] {
  const dir = path.join('data', 'catalogs')
  const built = existsSync(dir)
    ? readdirSync(dir)
        .map((name) => path.join(dir, name, 'catalog.json'))
        .filter((file) => existsSync(file))
        .map((file) => JSON.parse(readFileSync(file, 'utf8')) as SchoolConfig)
    : []
  return [DEMO_SCHOOL, ...built]
}
