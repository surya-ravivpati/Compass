import { describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { openPglite } from '../../lib/db/client.ts'
import * as schema from '../../lib/db/schema.ts'
import { seedSchool } from '../../lib/db/seed.ts'
import { loadSchool } from '../../lib/db/schools.ts'
import { DEMO_SCHOOL } from '../../lib/catalog/demo-school.ts'
import { tinySchool } from '../engine/helpers.ts'

describe('catalog storage', () => {
  it('round-trips the demo school through the database unchanged', async () => {
    const db = await openPglite()
    await seedSchool(db, DEMO_SCHOOL)
    const loaded = await loadSchool(db, DEMO_SCHOOL.id)
    expect(loaded).toEqual(DEMO_SCHOOL)
  })

  it('refuses to seed an invalid catalog', async () => {
    const db = await openPglite()
    const broken = tinySchool()
    broken.courses[0]!.prerequisites = [{ anyOf: [{ courseId: 'd', timing: 'before' }] }]
    await expect(seedSchool(db, broken)).rejects.toThrow(/Prerequisite cycle: A → D → C → B → A/)
  })

  it('classifies every table as reference or student-owned', () => {
    const tables = Object.values(schema)
      .filter((v): v is typeof schema.users => typeof v === 'object' && v !== null && Symbol.for('drizzle:IsDrizzleTable') in v)
      .map((t) => getTableConfig(t).name)
      .sort()
    const classified = [...schema.REFERENCE_TABLES, ...schema.STUDENT_OWNED_TABLES].sort()
    expect(tables).toEqual(classified)
  })
})
