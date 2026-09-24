import { and, eq, sql } from 'drizzle-orm'
import { DEFAULT_PREFERENCES, type Placement, type Preferences } from '../engine/types.ts'
import type { Database } from '../db/client.ts'
import { studentCourses, students } from '../db/schema.ts'

export interface StudentProfile {
  id: string
  userId: string
  schoolId: string | null
  firstName: string | null
  grade: number | null
  yearStarted: boolean
  academicYear: number | null
  graduationYear: number | null
  startTerm: number | null
  mathPlacement: string | null
  mathPlacementNote: string | null
  preferences: Preferences
  onboarded: boolean
}

type Row = typeof students.$inferSelect

function toProfile(row: Row): StudentProfile {
  return {
    id: row.id,
    userId: row.userId,
    schoolId: row.schoolId,
    firstName: row.firstName,
    grade: row.grade,
    yearStarted: row.yearStarted,
    academicYear: row.academicYear,
    graduationYear: row.graduationYear,
    startTerm: row.startTerm,
    mathPlacement: row.mathPlacement,
    mathPlacementNote: row.mathPlacementNote,
    preferences: { ...DEFAULT_PREFERENCES, ...(row.preferences ?? {}) },
    onboarded: row.onboardedAt !== null,
  }
}

export async function getStudentByUser(db: Database, userId: string): Promise<StudentProfile | null> {
  const [row] = await db.select().from(students).where(eq(students.userId, userId))
  return row ? toProfile(row) : null
}

/** The student's own record: completed and in-progress courses. */
export async function getHistory(db: Database, studentId: string): Promise<Placement[]> {
  const rows = await db
    .select({ courseId: studentCourses.courseId, term: studentCourses.term, status: studentCourses.status })
    .from(studentCourses)
    .where(eq(studentCourses.studentId, studentId))
  return rows
    .map((r) => ({ courseId: r.courseId, term: r.term, status: r.status as Placement['status'] }))
    .sort((a, b) => a.term - b.term || a.courseId.localeCompare(b.courseId))
}

export interface ProfileUpdate {
  schoolId: string
  firstName: string | null
  grade: number
  yearStarted: boolean
  academicYear: number
  graduationYear: number
  startTerm: number
  mathPlacement: string
  mathPlacementNote: string | null
  preferences: Preferences
}

/** Replaces the profile and the course record together, so they never disagree. */
export async function saveProfileAndHistory(
  db: Database,
  studentId: string,
  profile: ProfileUpdate,
  history: Placement[],
  options: { markOnboarded?: boolean } = {},
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(students)
      .set({
        ...profile,
        updatedAt: sql`now()`,
        ...(options.markOnboarded ? { onboardedAt: sql`now()` } : {}),
      })
      .where(eq(students.id, studentId))
    await tx.delete(studentCourses).where(eq(studentCourses.studentId, studentId))
    if (history.length) {
      await tx.insert(studentCourses).values(
        history.map((p) => ({ studentId, courseId: p.courseId, term: p.term, status: p.status })),
      )
    }
  })
}

export async function savePreferences(db: Database, studentId: string, preferences: Preferences): Promise<void> {
  await db.update(students).set({ preferences, updatedAt: sql`now()` }).where(eq(students.id, studentId))
}

export async function setFirstName(db: Database, studentId: string, firstName: string | null): Promise<void> {
  await db.update(students).set({ firstName, updatedAt: sql`now()` }).where(and(eq(students.id, studentId)))
}
