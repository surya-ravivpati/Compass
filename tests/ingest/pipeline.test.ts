import { describe, expect, it, vi } from 'vitest'
import { buildSchool } from '../../lib/ingest/build.ts'
import { extractCatalog, extractPdfPages } from '../../lib/ingest/extract.ts'
import { courseCodes, mergeRawCourses } from '../../lib/ingest/normalize.ts'
import type { CatalogOverrides, DraftCatalog } from '../../lib/ingest/types.ts'
import { buildCatalog, generatePlan, DEFAULT_PREFERENCES } from '../../lib/engine/index.ts'

const DOC = 'coursed.pdf'

function draft(): DraftCatalog {
  return {
    document: DOC,
    extractedAt: '2026-09-24T00:00:00.000Z',
    model: 'test',
    pages: 4,
    requirements: [{ name: 'Mathematics', credits: 2, text: 'Two credits of mathematics.', page: 1 }],
    courses: mergeRawCourses(
      [
        { name: 'Algebra 1', department: 'Mathematics', description: 'Linear equations.', credits: 1, length: 'year', grades: [9, 10], quote: 'Algebra 1 (1 credit, full year)', page: 3 },
        { name: 'Geometry', department: 'Mathematics', description: 'Proof.', credits: 1, length: 'year', grades: [9, 10, 11], prerequisites: [['Algebra 1']], prerequisite_text: 'Prerequisite: Algebra 1', quote: 'Geometry (1 credit)', page: 3 },
        { name: 'Statistics', department: 'Mathematics', description: 'Data.', credits: 0.5, length: 'semester', grades: [11, 12], quote: 'Statistics (semester)', page: 4 },
        { name: 'AP Calculus', department: 'Math', description: 'Limits.', length: 'year', grades: [12], prerequisites: [['Geometry']], quote: 'AP Calculus', page: 4 },
      ],
      DOC,
    ),
  }
}

const overrides = (): CatalogOverrides => ({
  school: { id: 'real-high', name: 'Real High School', load: { min: 1, max: 3 }, totalCredits: 2, preHighSchoolCredit: false },
  departments: [{ id: 'math', name: 'Mathematics', shortName: 'math', order: 0, lane: true, match: ['Mathematics', 'Math'] }],
  requirements: [{ id: 'math', name: 'Mathematics', description: 'Two credits of math.', credits: 2, kind: 'category', departments: ['math'] }],
})

describe('draft merging', () => {
  it('flags missing fields and conflicts instead of guessing', () => {
    const merged = mergeRawCourses(
      [
        { name: 'Chemistry', credits: 1, page: 5 },
        { name: 'Chemistry', credits: 0.5, length: 'year', page: 9 },
      ],
      DOC,
    )
    expect(merged).toHaveLength(1)
    const chem = merged[0]!
    expect(chem.credits).toBe(1)
    expect(chem.length).toBe('year')
    expect(chem.source).toEqual({ kind: 'catalog', document: DOC, page: 5 })
    expect(chem.flags).toContain('credits differs between page 5 (1) and page 9 (0.5)')
    expect(chem.flags).toContain('Grade levels not stated')
  })

  it('reads course codes in their usual spellings', () => {
    expect(courseCodes('ART101–Semester 1 ART102–Semester 2')).toEqual(['ART101', 'ART102'])
    expect(courseCodes('SPA511/SPA512')).toEqual(['SPA511', 'SPA512'])
    expect(courseCodes('— BUS252')).toEqual(['BUS252'])
    expect(courseCodes('MATH 101, MATH 102')).toEqual(['MATH101', 'MATH102'])
    expect(courseCodes(null)).toEqual([])
  })

  it('treats records that share a course code as one course, whatever their names', () => {
    const merged = mergeRawCourses(
      [
        { name: 'Art and Design', code: 'ART101–Semester 1 ART102–Semester 2', length: 'semester', grades: [9, 10, 11, 12], page: 48 },
        { name: 'ART AND DESIGN (CP)', code: 'ART101 ART102', department: 'ART', page: 115 },
      ],
      DOC,
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'art-and-design', code: 'ART101 ART102', length: 'semester', department: 'ART' })
    expect(merged[0]!.flags.some((f) => f.startsWith('code differs'))).toBe(false)
  })

  it('keeps same-named courses with different codes apart, and flags a mention that could be either', () => {
    const merged = mergeRawCourses(
      [
        { name: 'American Studies', code: 'ENG341/ENG342', department: 'English', page: 30 },
        { name: 'American Studies', code: 'SOC581/SOC582', department: 'Social Studies', page: 101 },
        { name: 'American Studies', page: 117 },
      ],
      DOC,
    )
    expect(merged.map((c) => [c.id, c.code, c.department])).toEqual([
      ['american-studies', 'ENG341 ENG342', 'English'],
      ['american-studies-soc581', 'SOC581 SOC582', 'Social Studies'],
    ])
    expect(merged[0]!.flags).toContain('Page 117 names "American Studies" without a code, and 2 courses share that name: check which one it means')
  })
})

describe('catalog build', () => {
  it('refuses to build while required facts are missing, and names each one', () => {
    const result = buildSchool(draft(), overrides())
    expect(result.school).toBeNull()
    expect(result.errors).toContain(
      'Statistics (page 4): semester course with no stated semester. Add "seasons" (fall, spring, or both).',
    )
    expect(result.errors).toContain('AP Calculus (page 4): credits aren\'t stated. Add "credits" in overrides.json.')
  })

  it('builds once a reviewer supplies them, keeping every source', () => {
    const o = overrides()
    o.courses = { statistics: { seasons: ['spring'] }, 'ap-calculus': { credits: 1 } }
    const result = buildSchool(draft(), o)
    expect(result.errors).toEqual([])
    const school = result.school!
    const geometry = school.courses.find((c) => c.id === 'geometry')!
    expect(geometry.prerequisites).toEqual([{ anyOf: [{ courseId: 'algebra-1', timing: 'before' }] }])
    expect(geometry.source).toEqual({ kind: 'catalog', document: DOC, page: 3, quote: 'Geometry (1 credit)' })
    expect(geometry.satisfies).toEqual(['math'])
    const calc = school.courses.find((c) => c.id === 'ap-calculus')!
    expect(calc.level).toBe('ap')
    expect(calc.workloadEstimated).toBe(true)
    expect(school.requirements[0]!.source.kind).toBe('school-config')
    expect(result.warnings.some((w) => w.includes('The PDF lists graduation requirements (Mathematics 2)'))).toBe(true)
    // The engine accepts and plans against it.
    const plan = generatePlan({ catalog: buildCatalog(school), student: { startTerm: 0 }, history: [], preferences: DEFAULT_PREFERENCES })
    expect(plan.plan.placements.map((p) => p.courseId)).toContain('geometry')
  })

  it('reports a prerequisite that names no course', () => {
    const d = draft()
    d.courses.find((c) => c.id === 'geometry')!.prerequisites = [['Math 8A']]
    const o = overrides()
    o.courses = { statistics: { seasons: ['spring'] }, 'ap-calculus': { credits: 1 } }
    const result = buildSchool(d, o)
    expect(result.errors).toContain(
      'Geometry (page 3): prerequisite "Math 8A" isn\'t a course in this catalog. Fix the name or set "prerequisites" in overrides.json.',
    )
  })
})

describe('extraction', () => {
  it('sends pages with markers and merges what comes back', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body))
      const payload = { courses: [{ name: 'Biology', credits: 1, length: 'year', grades: [9, 10], department: 'Science', quote: 'Biology', page: 2 }], requirements: [] }
      return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 })
    }) as unknown as typeof fetch
    const result = await extractCatalog(['Cover page', 'Biology — 1 credit'], DOC, { apiKey: 'k', fetchImpl, model: 'test' })
    expect(bodies[0]).toContain('=== Page 2 ===')
    expect(result.courses.map((c) => [c.id, c.source.page])).toEqual([['biology', 2]])
  })

  it('reads text out of a real PDF', async () => {
    const pages = await extractPdfPages(minimalPdf('Honors Chemistry 1 credit'))
    expect(pages.join(' ')).toContain('Honors Chemistry 1 credit')
  })
})

/** A one-page PDF with a line of text, assembled byte-for-byte with a valid xref table. */
function minimalPdf(text: string): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
