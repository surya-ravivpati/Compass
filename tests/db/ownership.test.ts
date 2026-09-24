import { beforeAll, describe, expect, it } from 'vitest'
import { openPglite, type Database } from '../../lib/db/client.ts'
import { seedSchool } from '../../lib/db/seed.ts'
import { DEMO_SCHOOL } from '../../lib/catalog/demo-school.ts'
import { authenticate, createAccount, deleteAccount } from '../../lib/data/accounts.ts'
import { getStudentByUser } from '../../lib/data/students.ts'
import { issueSession, resolveSession, revokeSession } from '../../lib/auth/sessions.ts'
import {
  commitVersion,
  createPlan,
  deleteAlternative,
  getLatestVersion,
  getVersion,
  listPlans,
  listVersions,
  makePrimary,
  PlanConflictError,
  renamePlan,
} from '../../lib/data/plans.ts'
import { planned } from '../engine/helpers.ts'
import { plans } from '../../lib/db/schema.ts'

let db: Database
let alice: { userId: string; studentId: string }
let bob: { userId: string; studentId: string }

const version = (placements = [planned('english-9', 0)]) => ({
  summary: 'Generated plan',
  change: { kind: 'generated' },
  validationStatus: 'valid',
  placements,
})

beforeAll(async () => {
  db = await openPglite()
  await seedSchool(db, DEMO_SCHOOL)
  const a = await createAccount(db, 'alice@example.com', 'correct horse battery')
  const b = await createAccount(db, 'bob@example.com', 'another long password')
  if (!a.ok || !b.ok) throw new Error('setup failed')
  alice = { userId: a.userId, studentId: (await getStudentByUser(db, a.userId))!.id }
  bob = { userId: b.userId, studentId: (await getStudentByUser(db, b.userId))!.id }
})

describe('accounts', () => {
  it('rejects weak passwords and duplicate emails', async () => {
    expect(await createAccount(db, 'carol@example.com', 'short')).toEqual({ ok: false, error: 'Use at least 10 characters.' })
    expect(await createAccount(db, 'ALICE@example.com', 'correct horse battery')).toEqual({
      ok: false,
      error: 'An account with that email already exists. Try signing in.',
    })
  })

  it('authenticates with the right password only', async () => {
    expect(await authenticate(db, ' Alice@Example.com ', 'correct horse battery')).toBe(alice.userId)
    expect(await authenticate(db, 'alice@example.com', 'wrong password!!')).toBeNull()
    expect(await authenticate(db, 'nobody@example.com', 'correct horse battery')).toBeNull()
  })

  it('stores only a hash of the session token and honors expiry and revocation', async () => {
    const now = new Date('2026-09-01T00:00:00Z')
    const { token } = await issueSession(db, alice.userId, now)
    expect(await resolveSession(db, token, now)).toBe(alice.userId)
    expect(await resolveSession(db, token, new Date('2026-12-01T00:00:00Z'))).toBeNull()
    expect(await resolveSession(db, 'forged-token', now)).toBeNull()
    await revokeSession(db, token)
    expect(await resolveSession(db, token, now)).toBeNull()
  })
})

describe('plan ownership', () => {
  it("keeps one student's plans invisible to another", async () => {
    const { planId, versionId } = await createPlan(db, alice.studentId, { name: 'My plan', kind: 'primary' }, version())
    expect((await listPlans(db, alice.studentId)).map((p) => p.id)).toContain(planId)
    expect(await listPlans(db, bob.studentId)).toEqual([])
    expect(await getLatestVersion(db, bob.studentId, planId)).toBeNull()
    expect(await getVersion(db, bob.studentId, versionId)).toBeNull()
    expect(await listVersions(db, bob.studentId, planId)).toEqual([])
    await expect(commitVersion(db, bob.studentId, planId, 1, version())).rejects.toThrow('Plan not found.')
    expect(await renamePlan(db, bob.studentId, planId, 'hacked')).toBe(false)
    expect(await makePrimary(db, bob.studentId, planId)).toBe(false)
    expect(await deleteAlternative(db, bob.studentId, planId)).toBe(false)
    expect((await getLatestVersion(db, alice.studentId, planId))?.version).toBe(1)
  })

  it('versions every change and detects concurrent edits', async () => {
    const { planId } = await createPlan(db, alice.studentId, { name: 'Versioned', kind: 'alternative' }, version())
    const v2 = await commitVersion(db, alice.studentId, planId, 1, { ...version([planned('english-9', 0), planned('biology', 0)]), summary: 'Added Biology' })
    expect(v2.version).toBe(2)
    await expect(commitVersion(db, alice.studentId, planId, 1, version())).rejects.toBeInstanceOf(PlanConflictError)
    const history = await listVersions(db, alice.studentId, planId)
    expect(history.map((v) => [v.version, v.summary])).toEqual([
      [2, 'Added Biology'],
      [1, 'Generated plan'],
    ])
    const latest = await getLatestVersion(db, alice.studentId, planId)
    expect(latest?.placements.map((p) => p.courseId)).toEqual(['biology', 'english-9'])
  })

  it('keeps exactly one primary plan', async () => {
    const all = await listPlans(db, alice.studentId)
    const alt = all.find((p) => p.kind === 'alternative')!
    expect(await makePrimary(db, alice.studentId, alt.id)).toBe(true)
    const after = await listPlans(db, alice.studentId)
    expect(after.filter((p) => p.kind === 'primary').map((p) => p.id)).toEqual([alt.id])
  })

  it('deletes everything a student owns with their account', async () => {
    await createPlan(db, bob.studentId, { name: 'Bob plan', kind: 'primary' }, version())
    await deleteAccount(db, bob.userId)
    expect(await getStudentByUser(db, bob.userId)).toBeNull()
    const leftovers = (await db.select().from(plans)).filter((p) => p.studentId === bob.studentId)
    expect(leftovers).toEqual([])
  })
})
