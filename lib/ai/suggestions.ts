import { GOAL_LABELS, placementPhrase, type Catalog, type Placement, type Preferences } from '../engine/index.ts'

/** Starter questions drawn from the student's own plan, so they are always answerable. */
export function suggestedQuestions(catalog: Catalog, placements: Placement[], prefs: Preferences): string[] {
  const planned = placements.filter((p) => p.status === 'planned')
  const out: string[] = []
  const advanced = planned.find((p) => {
    const c = catalog.courses.get(p.courseId)
    return c && (c.level === 'ap' || c.level === 'honors') && c.prerequisites.length > 0
  })
  if (advanced) {
    const c = catalog.courses.get(advanced.courseId)!
    out.push(`Why is ${c.name} in ${placementPhrase(advanced.term, c.durationTerms)}?`)
  }
  const science = planned.filter((p) => catalog.courses.get(p.courseId)?.department === 'science').sort((a, b) => b.term - a.term)[0]
  if (science) out.push(`Can I take ${catalog.courses.get(science.courseId)!.name} earlier?`)
  const language = planned.find((p) => catalog.courses.get(p.courseId)?.sequence)
  if (language) {
    const name = catalog.courses.get(language.courseId)!.name.replace(/\s+\d+$|^Honors\s+|\s+Language and Culture$/g, '').replace(/^AP\s+/, '')
    out.push(`What happens if I drop ${name}?`)
  }
  out.push('Show me a more rigorous math path.')
  const sport = prefs.activities.find((a) => a.kind === 'sport')
  out.push(sport ? `I want more room for ${sport.name.toLowerCase()}.` : 'I want more room for sports.')
  const goal = prefs.goals.find((g) => ['engineering', 'medicine', 'business', 'computer-science', 'stem', 'humanities', 'arts'].includes(g))
  out.push(`What classes prepare me for ${goal ? GOAL_LABELS[goal] : 'engineering'}?`)
  return out.slice(0, 6)
}
