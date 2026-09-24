import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describeGroup, type Catalog, type Course } from '../engine/index.ts'
import type { Database } from '../db/client.ts'
import { aiCache } from '../db/schema.ts'
import { aiModel } from './config.ts'
import { generateContent, type ClientOptions } from './gemini.ts'
import { COURSE_EXPLAINER_PROMPT, PROMPT_VERSION } from './prompts.ts'

export interface CourseExplainer {
  summary: string
  whatYouDo: string[]
  goodFitIf: string[]
  model: string
  cached: boolean
}

/**
 * A plain-language course guide written only from the catalog record, cached
 * per catalog version so each course costs one model call, ever.
 */
export async function explainCourse(
  db: Database,
  catalog: Catalog,
  catalogVersion: string,
  course: Course,
  options: ClientOptions = {},
): Promise<CourseExplainer> {
  const model = options.model ?? aiModel()
  const key = createHash('sha256')
    .update([PROMPT_VERSION, model, catalog.school.id, catalogVersion, course.id].join('|'))
    .digest('hex')
  const [hit] = await db.select().from(aiCache).where(eq(aiCache.key, key))
  if (hit) return { ...(hit.value as Omit<CourseExplainer, 'cached' | 'model'>), model: hit.model, cached: true }

  const record = {
    name: course.name,
    department: catalog.departments.get(course.department)?.name,
    level: course.level,
    credits: course.credits,
    length: course.durationTerms === 2 ? 'full year' : 'one semester',
    grades: course.grades,
    prerequisites: course.prerequisites.map((g) => describeGroup(catalog, g)),
    opens: (catalog.dependents.get(course.id) ?? []).map((id) => catalog.courses.get(id)?.name),
    workload_estimate: ['', 'light', 'moderate', 'heavy', 'intense'][course.workload],
    lab: !!course.lab,
    description: course.description,
    notes: course.notes ?? [],
  }
  const response = await generateContent(
    {
      system: COURSE_EXPLAINER_PROMPT,
      contents: [{ role: 'user', parts: [{ text: `Course record:\n${JSON.stringify(record, null, 2)}` }] }],
      json: {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING', description: 'Two sentences on what the course is.' },
          what_you_do: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Up to four concrete things students do.' },
          good_fit_if: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Up to three interests or goals of students who tend to enjoy it, like "You enjoy …". Never prerequisites or claims about what the reader has taken.',
          },
        },
        required: ['summary', 'what_you_do', 'good_fit_if'],
      },
      temperature: 0.4,
      // A rewrite of the catalog record needs no deliberation, and thinking
      // tokens count against the output budget.
      thinking: 'minimal',
      maxOutputTokens: 2048,
    },
    { ...options, model },
  )
  const parsed = JSON.parse(response.text) as { summary?: unknown; what_you_do?: unknown; good_fit_if?: unknown }
  const strings = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, n) : [])
  const value = {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 600) : '',
    whatYouDo: strings(parsed.what_you_do, 4),
    goodFitIf: strings(parsed.good_fit_if, 3),
  }
  if (!value.summary) throw new Error('Explainer returned no summary.')
  await db.insert(aiCache).values({ key, model, value }).onConflictDoNothing()
  return { ...value, model, cached: false }
}
