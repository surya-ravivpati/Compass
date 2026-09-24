import { describe, expect, it, vi } from 'vitest'
import { askCompass } from '../../lib/ai/assistant.ts'
import { explainCourse } from '../../lib/ai/explainer.ts'
import { generateContent } from '../../lib/ai/gemini.ts'
import { interpretGoals } from '../../lib/ai/goals.ts'
import { systemPrompt, type StudentContext } from '../../lib/ai/prompts.ts'
import { executeTool, parseTerm, resolveCourse, type ToolContext } from '../../lib/ai/tools.ts'
import { openPglite } from '../../lib/db/client.ts'
import { seedSchool } from '../../lib/db/seed.ts'
import { DEMO_SCHOOL } from '../../lib/catalog/demo-school.ts'
import { demo, generateFor, prefs } from '../engine/helpers.ts'

const preferences = prefs({ rigor: 'very-rigorous', goals: ['engineering'] })
const generated = generateFor('geometry', preferences)
const tools: ToolContext = {
  catalog: demo,
  student: { startTerm: 0 },
  placements: generated.plan.placements,
  preferences,
  reasons: generated.reasons,
}
const student: StudentContext = {
  firstName: 'Maya',
  grade: 9,
  graduationYear: 2030,
  schoolName: 'Compass Demo High School',
  isDemoCatalog: true,
  preferences,
}

/** A fake Gemini endpoint that replays scripted model turns and records requests. */
function fakeGemini(turns: object[][]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- request bodies are loosely shaped JSON
  const requests: { contents: { role: string; parts: Record<string, any>[] }[] }[] = []
  let i = 0
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)))
    const parts = turns[Math.min(i++, turns.length - 1)]
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] }), { status: 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, requests }
}

describe('Gemini client', () => {
  const request = { system: 's', contents: [{ role: 'user' as const, parts: [{ text: 'q' }] }] }
  const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status })
  const answer = (text: string, finishReason = 'STOP') => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }] })

  it('refuses an answer the output budget cut off, instead of passing on broken JSON', async () => {
    const fetchImpl = vi.fn(async () => reply(answer('{"summary": "AP Calcul', 'MAX_TOKENS'))) as unknown as typeof fetch
    await expect(generateContent({ ...request, json: { type: 'OBJECT' } }, { apiKey: 'k', fetchImpl })).rejects.toMatchObject({ kind: 'incomplete' })
  })

  it('asks for a thinking level, and drops it for a model that does not offer it', async () => {
    const bodies: { generationConfig: { thinkingConfig?: unknown } }[] = []
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      bodies.push(body)
      return body.generationConfig.thinkingConfig
        ? reply({ error: { code: 400, message: 'Thinking level is not supported for this model.' } }, 400)
        : reply(answer('OK'))
    }) as unknown as typeof fetch
    const options = { apiKey: 'k', model: 'test-model-without-levels', fetchImpl }
    expect((await generateContent({ ...request, thinking: 'minimal' }, options)).text).toBe('OK')
    expect(bodies.map((b) => b.generationConfig.thinkingConfig)).toEqual([{ thinkingLevel: 'minimal' }, undefined])
    // Remembered: the next request skips the level straight away.
    await generateContent({ ...request, thinking: 'minimal' }, options)
    expect(bodies).toHaveLength(3)
    expect(bodies[2]!.generationConfig.thinkingConfig).toBeUndefined()
  })

  it('does not retry other bad requests', async () => {
    const fetchImpl = vi.fn(async () => reply({ error: { code: 400, message: 'Invalid schema.' } }, 400)) as unknown as typeof fetch
    await expect(generateContent({ ...request, thinking: 'low' }, { apiKey: 'k', model: 'other-model', fetchImpl })).rejects.toMatchObject({ kind: 'http', status: 400 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('Compass AI', () => {
  it('reports itself offline when no key is configured', async () => {
    const reply = await askCompass(tools, student, [{ role: 'user', text: 'Hi' }], { apiKey: '' })
    expect(reply.status).toBe('offline')
  })

  it('answers from engine tools and cites what it used', async () => {
    const { fetchImpl, requests } = fakeGemini([
      [{ functionCall: { name: 'get_course', args: { course: 'AP Calc BC' } }, thoughtSignature: 'sig-1' }],
      [{ text: 'Your school’s catalog lists AP Precalculus as the prerequisite for AP Calculus BC.' }],
    ])
    const reply = await askCompass(tools, student, [{ role: 'user', text: 'What do I need before AP Calculus BC?' }], { apiKey: 'k', fetchImpl })
    expect(reply.status).toBe('ok')
    expect(reply.toolsUsed).toEqual(['get_course'])
    expect(reply.facts).toContainEqual({ text: 'AP Calculus BC requires AP Precalculus.', source: 'Compass demo catalog (development data)' })
    // The model turn is echoed back verbatim, thought signature included.
    const second = requests[1]!
    expect(second.contents[1]).toEqual({ role: 'model', parts: [{ functionCall: { name: 'get_course', args: { course: 'AP Calc BC' } }, thoughtSignature: 'sig-1' }] })
    const response = second.contents[2]!.parts[0]!.functionResponse
    expect(response.name).toBe('get_course')
    expect(response.response.prerequisites).toEqual(['AP Precalculus'])
    // The key travels in a header, never in the URL.
    expect(String(vi.mocked(fetchImpl).mock.calls[0]![0])).not.toContain('k')
  })

  it('proposes changes but never applies them', async () => {
    const before = JSON.stringify(tools.placements)
    const precalc = tools.placements.find((p) => p.courseId === 'ap-precalculus')!
    const target = precalc.term === 2 ? 'junior year' : 'senior year'
    const { fetchImpl } = fakeGemini([
      [{ functionCall: { name: 'preview_move', args: { course: 'AP Precalculus', term: target } } }],
      [{ text: 'Moving it would push AP Calculus BC later. You can preview it in your plan.' }],
    ])
    const reply = await askCompass(tools, student, [{ role: 'user', text: 'Can I take AP Precalculus later?' }], { apiKey: 'k', fetchImpl })
    expect(reply.proposals).toHaveLength(1)
    expect(reply.proposals[0]).toMatchObject({ kind: 'move', courseId: 'ap-precalculus' })
    expect(JSON.stringify(tools.placements)).toBe(before)
  })

  it('fails safely when the model is unavailable', async () => {
    const fetchImpl = vi.fn(async () => new Response('oops', { status: 500 })) as unknown as typeof fetch
    const reply = await askCompass(tools, student, [{ role: 'user', text: 'Why am I taking Chemistry?' }], { apiKey: 'k', fetchImpl })
    expect(reply.status).toBe('error')
    expect(reply.text).toBe('Compass AI is unavailable right now. Your plan hasn’t changed, and everything else in Compass still works.')
  })

  it('states its rules in the system prompt', () => {
    const prompt = systemPrompt(student)
    expect(prompt).toContain('must come from a tool result')
    expect(prompt).toContain('You cannot change the plan')
    expect(prompt).toContain('Show consequences, not rankings')
    expect(prompt).toContain('Never predict admissions outcomes')
  })
})

describe('AI tools', () => {
  it('resolves course names and abbreviations', () => {
    expect(resolveCourse(demo, 'ap-calculus-bc').map((c) => c.id)).toEqual(['ap-calculus-bc'])
    expect(resolveCourse(demo, 'AP Calc BC').map((c) => c.id)).toEqual(['ap-calculus-bc'])
    expect(resolveCourse(demo, 'chem').map((c) => c.id)).toContain('chemistry')
    expect(resolveCourse(demo, 'Underwater Basket Weaving')).toEqual([])
  })

  it('parses terms', () => {
    expect(parseTerm('Junior Fall')).toBe(4)
    expect(parseTerm('senior spring')).toBe(7)
    expect(parseTerm('11th grade')).toBe(4)
    expect(parseTerm('sophomore year')).toBe(2)
    expect(parseTerm('someday')).toBeNull()
  })

  it('refuses to invent a course', () => {
    const out = executeTool(tools, 'get_course', { course: 'Quantum Cooking' })
    expect(out.result).toEqual({ error: 'No course named "Quantum Cooking" is in this school\'s catalog.' })
    expect(out.facts).toEqual([])
  })

  it('compares dropping a language without ranking it', () => {
    const out = executeTool(tools, 'compare_scenario', { kind: 'drop', course: 'Spanish 1' })
    // Another language the school offers still covers the requirement.
    expect(out.result.valid_schedule_exists).toBe(true)
    expect(out.result.courses_removed).toContain('Spanish 1')
    expect(String(out.result.courses_added)).toMatch(/French 1|Mandarin Chinese 1/)
    expect(JSON.stringify(out.result)).not.toMatch(/\b(better|best|worse|recommend)\b/i)
    expect(out.proposal).toMatchObject({ kind: 'scenario' })
  })

  it('explains why a course is out of reach', () => {
    const out = executeTool({ ...tools, student: { startTerm: 6 } }, 'why_not', { course: 'Differential Equations' })
    expect(out.result.course).toBe('Differential Equations')
  })
})

describe('cached course explainer', () => {
  it('calls the model once per course and catalog version', async () => {
    const db = await openPglite()
    await seedSchool(db, DEMO_SCHOOL)
    const { fetchImpl } = fakeGemini([
      [{ text: JSON.stringify({ summary: 'A course about change.', what_you_do: ['Derivatives'], good_fit_if: ['You like puzzles'] }) }],
    ])
    const course = demo.courses.get('ap-calculus-ab')!
    const first = await explainCourse(db, demo, 'v1', course, { apiKey: 'k', fetchImpl, model: 'test-model' })
    const second = await explainCourse(db, demo, 'v1', course, { apiKey: 'k', fetchImpl, model: 'test-model' })
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.summary).toBe('A course about change.')
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(1)
  })
})

describe('goal interpretation', () => {
  it('keeps only known goal ids and tags', async () => {
    const { fetchImpl } = fakeGemini([[{ text: JSON.stringify({ goals: ['engineering', 'astronaut'], interests: ['design', 'rockets'] }) }]])
    const out = await interpretGoals('I want to design bridges', ['design', 'engineering'], { apiKey: 'k', fetchImpl })
    expect(out).toEqual({ goals: ['engineering'], interests: ['design'] })
  })
})
