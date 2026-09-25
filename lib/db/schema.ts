import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import type {
  Department,
  GradeLevel,
  MathPlacementOption,
  MustInclude,
  Policy,
  Preferences,
  SourceRef,
} from '../engine/types.ts'

/*
 * Two kinds of table.
 *
 * Reference data (schools and their catalogs) is the same for everyone and is
 * written only by the seed/ingest scripts.
 *
 * Student-owned data is private to one student. Every query for it goes
 * through lib/data, which takes the student from the verified session --
 * never from the request -- so one student can never read another's plan.
 */

export interface SchoolSettings {
  load: { min: number; max: number }
  totalCredits: number
  preHighSchoolCredit: boolean
  departments: Department[]
  policies: Policy[]
  mathPlacement: MathPlacementOption[]
}

// ---------------------------------------------------------------- reference

export const schools = pgTable('schools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  settings: jsonb('settings').$type<SchoolSettings>().notNull(),
  source: jsonb('source').$type<SourceRef>().notNull(),
  /** Changes whenever the catalog is re-seeded, so caches know to refresh. */
  catalogVersion: text('catalog_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const courses = pgTable(
  'courses',
  {
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    code: text('code'),
    name: text('name').notNull(),
    department: text('department').notNull(),
    description: text('description').notNull(),
    credits: real('credits').notNull(),
    durationTerms: integer('duration_terms').notNull(),
    grades: integer('grades').array().notNull(),
    seasons: text('seasons').array().notNull(),
    level: text('level').notNull(),
    workload: integer('workload').notNull(),
    /** The catalog doesn't state a workload; it was estimated from the level. */
    workloadEstimated: boolean('workload_estimated').notNull().default(false),
    lab: boolean('lab').notNull().default(false),
    tags: text('tags').array().notNull(),
    satisfies: text('satisfies').array().notNull(),
    sequenceId: text('sequence_id'),
    sequenceStep: integer('sequence_step'),
    equivalenceGroup: text('equivalence_group'),
    maxEnrollments: integer('max_enrollments'),
    satisfiesFromGrade: jsonb('satisfies_from_grade').$type<Partial<Record<string, GradeLevel>>>(),
    byPlacement: boolean('by_placement').notNull().default(false),
    expectsBackground: boolean('expects_background').notNull().default(false),
    notes: text('notes').array(),
    source: jsonb('source').$type<SourceRef>().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.id] }), index('courses_department_idx').on(t.schoolId, t.department)],
)

/**
 * Prerequisites as edges in conjunctive normal form: every `groupIndex` must
 * be satisfied; within a group any one prerequisite course does it.
 */
export const prerequisites = pgTable(
  'prerequisites',
  {
    schoolId: text('school_id').notNull(),
    courseId: text('course_id').notNull(),
    groupIndex: integer('group_index').notNull(),
    /** Catalog order within the group, kept so messages read as the catalog does. */
    optionIndex: integer('option_index').notNull(),
    prerequisiteCourseId: text('prerequisite_course_id').notNull(),
    /** before | before-or-concurrent | concurrent */
    timing: text('timing').notNull(),
    note: text('note'),
  },
  (t) => [
    primaryKey({ columns: [t.schoolId, t.courseId, t.groupIndex, t.prerequisiteCourseId] }),
    foreignKey({ columns: [t.schoolId, t.courseId], foreignColumns: [courses.schoolId, courses.id] }).onDelete('cascade'),
    foreignKey({
      columns: [t.schoolId, t.prerequisiteCourseId],
      foreignColumns: [courses.schoolId, courses.id],
    }).onDelete('cascade'),
  ],
)

export const requirements = pgTable(
  'requirements',
  {
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    credits: real('credits').notNull(),
    kind: text('kind').notNull(),
    sameSequence: boolean('same_sequence').notNull().default(false),
    mustInclude: jsonb('must_include').$type<MustInclude[]>(),
    sortOrder: integer('sort_order').notNull(),
    source: jsonb('source').$type<SourceRef>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.id] })],
)

/** Cached AI output for static content (course explainers). Never personal data. */
export const aiCache = pgTable('ai_cache', {
  key: text('key').primaryKey(),
  model: text('model').notNull(),
  value: jsonb('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ------------------------------------------------------------ student-owned

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Sessions store only a SHA-256 of the token; the token itself lives in an HttpOnly cookie. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const students = pgTable('students', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  schoolId: text('school_id').references(() => schools.id),
  firstName: text('first_name'),
  /** Grade the student is in, or about to start. */
  grade: integer('grade'),
  /** Whether that grade's school year has already begun. */
  yearStarted: boolean('year_started').notNull().default(false),
  /** Calendar year the current school year starts in (2026 for 2026-27). */
  academicYear: integer('academic_year'),
  graduationYear: integer('graduation_year'),
  /** First term Compass may plan: 0 (freshman fall) to 8 (nothing left). */
  startTerm: integer('start_term'),
  mathPlacement: text('math_placement'),
  mathPlacementNote: text('math_placement_note'),
  preferences: jsonb('preferences').$type<Preferences>(),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** The student's record: completed and in-progress courses. Plans never edit it. */
export const studentCourses = pgTable(
  'student_courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull(),
    /** -1 before high school, otherwise a term index. */
    term: integer('term').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('student_courses_unique').on(t.studentId, t.courseId, t.term), index('student_courses_student_idx').on(t.studentId)],
)

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** primary | alternative */
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('plans_student_idx').on(t.studentId)],
)

/** Every committed change is a new, immutable version. */
export const planVersions = pgTable(
  'plan_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    summary: text('summary').notNull(),
    /** Structured record of what changed (the edit, scenario, or generation). */
    change: jsonb('change').$type<Record<string, unknown>>().notNull(),
    /** valid | attention | invalid, as computed by the engine on the server. */
    validationStatus: text('validation_status').notNull(),
    /** Generator reasons keyed "courseId@term", for explanations. */
    reasons: jsonb('reasons').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('plan_versions_unique').on(t.planId, t.version)],
)

/** Planned placements of a version. History comes from student_courses. */
export const planCourses = pgTable(
  'plan_courses',
  {
    versionId: uuid('version_id')
      .notNull()
      .references(() => planVersions.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull(),
    term: integer('term').notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.courseId, t.term] })],
)

export const REFERENCE_TABLES = ['schools', 'courses', 'prerequisites', 'requirements', 'ai_cache'] as const
export const STUDENT_OWNED_TABLES = [
  'users',
  'sessions',
  'students',
  'student_courses',
  'plans',
  'plan_versions',
  'plan_courses',
] as const
