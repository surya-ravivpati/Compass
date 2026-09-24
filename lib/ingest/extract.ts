import { aiModel } from '../ai/config.ts'
import { AiError, generateContent, type ClientOptions, type Schema } from '../ai/gemini.ts'
import { mergeRawCourses, type RawCourse } from './normalize.ts'
import type { DraftCatalog, DraftRequirement } from './types.ts'

/** Plain text of each PDF page, in order. */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: false })
  return Array.isArray(text) ? text : [text]
}

const PROMPT = [
  'You extract course records from a high school course catalog.',
  'Record ONLY what the text states. Use null for anything it does not state. Never infer a prerequisite, credit value, grade level, or semester from course order, names, or general knowledge.',
  'prerequisites: a list of groups; every group must be met, and any one course in a group meets it. Name courses exactly as the text names them. If the prerequisite wording is not about specific courses (for example "teacher recommendation"), leave prerequisites null and copy the wording into prerequisite_text.',
  'length: "year" or "semester" only if stated (for example "1 credit, full year" or "semester course").',
  'quote: the exact words describing the course, at most 300 characters.',
  'page: the number in the "=== Page N ===" marker above the course.',
  'Also list any graduation requirements the pages state (subject, credits, the exact wording).',
  'Skip tables of contents and course lists or indexes that only give names, codes and page numbers: record a course from the page that describes it.',
].join('\n')

const SCHEMA: Schema = {
  type: 'OBJECT',
  properties: {
    courses: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          code: { type: 'STRING', nullable: true },
          department: { type: 'STRING', nullable: true },
          description: { type: 'STRING', nullable: true },
          credits: { type: 'NUMBER', nullable: true },
          length: { type: 'STRING', enum: ['year', 'semester'], nullable: true },
          grades: { type: 'ARRAY', items: { type: 'INTEGER' }, nullable: true },
          semesters: { type: 'ARRAY', items: { type: 'STRING', enum: ['fall', 'spring'] }, nullable: true },
          prerequisites: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'STRING' } }, nullable: true },
          prerequisite_text: { type: 'STRING', nullable: true },
          notes: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
          quote: { type: 'STRING', nullable: true },
          page: { type: 'INTEGER' },
        },
        required: ['name', 'page'],
      },
    },
    requirements: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          credits: { type: 'NUMBER', nullable: true },
          text: { type: 'STRING' },
          page: { type: 'INTEGER' },
        },
        required: ['name', 'text', 'page'],
      },
    },
  },
  required: ['courses', 'requirements'],
}

/** What the model read, page by page, before any merging. Kept so a merge can be redone without the model. */
export interface CatalogReading {
  document: string
  extractedAt: string
  model: string
  pages: number
  raw: RawCourse[]
  requirements: DraftRequirement[]
}

type ReadOptions = ClientOptions & { pagesPerChunk?: number; onProgress?: (done: number, total: number) => void }

/**
 * Reads course records out of catalog pages with Gemini, then merges them
 * deterministically. The result is a draft for human review -- it is never
 * loaded directly.
 */
export async function extractCatalog(pages: string[], document: string, options: ReadOptions = {}): Promise<DraftCatalog> {
  return draftFromReading(await readCatalog(pages, document, options))
}

/** The deterministic half: one draft per course from everything the model read. */
export function draftFromReading(reading: CatalogReading): DraftCatalog {
  return {
    document: reading.document,
    extractedAt: reading.extractedAt,
    model: reading.model,
    pages: reading.pages,
    courses: mergeRawCourses(reading.raw, reading.document),
    requirements: reading.requirements,
  }
}

/** The model half: course records exactly as read, a few pages at a time. */
export async function readCatalog(pages: string[], document: string, options: ReadOptions = {}): Promise<CatalogReading> {
  const size = options.pagesPerChunk ?? 3
  const raw: RawCourse[] = []
  const requirements: DraftRequirement[] = []
  const chunks = Math.ceil(pages.length / size)
  const read = async (start: number, count: number): Promise<void> => {
    const text = pages
      .slice(start, start + count)
      .map((t, i) => `=== Page ${start + i + 1} ===\n${t}`)
      .join('\n\n')
    try {
      const response = await withRetry(() =>
        generateContent(
          { system: PROMPT, contents: [{ role: 'user', parts: [{ text }] }], json: SCHEMA, temperature: 0, thinking: 'low', maxOutputTokens: 32768 },
          { ...options, timeoutMs: options.timeoutMs ?? 180_000 },
        ),
      )
      const parsed = JSON.parse(response.text) as { courses?: RawCourse[]; requirements?: DraftRequirement[] }
      raw.push(...(parsed.courses ?? []))
      requirements.push(...(parsed.requirements ?? []))
    } catch (err) {
      // A dense chunk can outgrow one answer: read its pages one at a time.
      if (err instanceof AiError && err.kind === 'incomplete' && count > 1) {
        for (let i = 0; i < count; i++) await read(start + i, 1)
        return
      }
      throw err
    }
  }
  for (let c = 0; c < chunks; c++) {
    const start = c * size
    await read(start, Math.min(size, pages.length - start))
    options.onProgress?.(c + 1, chunks)
  }
  return { document, extractedAt: new Date().toISOString(), model: options.model ?? aiModel(), pages: pages.length, raw, requirements }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (err) {
      const retryable = err instanceof AiError && (err.kind === 'timeout' || err.kind === 'network' || (err.status ?? 0) >= 429)
      if (!retryable || i >= attempts - 1) throw err
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i))
    }
  }
}
