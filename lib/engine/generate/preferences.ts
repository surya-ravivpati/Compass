import type { Course, GoalId, Level, Preferences, SchoolConfig, TermIndex } from '../types.ts'
import { seasonOfTerm } from '../terms.ts'

/**
 * Interest tags each goal leans toward. Goals only ever raise or lower a
 * course's score; they never make a course allowed or forbidden.
 */
export const GOAL_TAGS: Record<GoalId, string[]> = {
  'maximize-rigor': [],
  stem: ['math', 'science', 'computer-science', 'engineering'],
  medicine: ['biology', 'chemistry', 'medicine', 'health-science'],
  engineering: ['engineering', 'physics', 'math', 'computer-science'],
  'computer-science': ['computer-science', 'math', 'engineering'],
  business: ['business', 'economics', 'finance'],
  humanities: ['humanities', 'writing', 'history', 'language', 'philosophy'],
  arts: ['arts', 'music', 'design', 'performing-arts'],
  explore: [],
  athletics: ['athletics'],
  extracurricular: ['leadership'],
  balanced: [],
  'max-ap': [],
  college: [],
}

export const GOAL_LABELS: Record<GoalId, string> = {
  'maximize-rigor': 'maximum rigor',
  stem: 'STEM',
  medicine: 'medicine',
  engineering: 'engineering',
  'computer-science': 'computer science',
  business: 'business',
  humanities: 'the humanities',
  arts: 'the arts',
  explore: 'exploring broadly',
  athletics: 'time for athletics',
  extracurricular: 'time for activities',
  balanced: 'a balanced workload',
  'max-ap': 'AP coursework',
  college: 'college preparation',
}

const LEVEL_INDEX: Record<Level, number> = { standard: 0, honors: 1, ap: 2, 'post-ap': 3 }

export function levelIndex(level: Level): number {
  return LEVEL_INDEX[level]
}

export interface PreferenceModel {
  /** tag -> weight */
  interests: Map<string, number>
  /** Which goal each interest tag came from, for explanations. */
  tagGoals: Map<string, GoalId | 'interest'>
  /** Preferred rigor on a 0 (standard) to 3 (post-AP) scale. */
  desiredLevel: number
  /** Courses per term the generator fills to. */
  targetLoad: number
  protectTime: boolean
  balanceFirst: boolean
  maxAp: boolean
  explore: boolean
  college: boolean
  /** Terms (by season) that carry a major activity. */
  busySeasons: Set<'fall' | 'spring'>
  targets: Set<string>
  avoid: Set<string>
  language?: string
  raw: Preferences
}

export function buildPreferenceModel(prefs: Preferences, school: SchoolConfig): PreferenceModel {
  const goals = new Set(prefs.goals)
  const interests = new Map<string, number>()
  const tagGoals = new Map<string, GoalId | 'interest'>()
  for (const goal of prefs.goals) {
    for (const tag of GOAL_TAGS[goal]) {
      interests.set(tag, (interests.get(tag) ?? 0) + 1)
      if (!tagGoals.has(tag)) tagGoals.set(tag, goal)
    }
  }
  for (const tag of prefs.interests) {
    interests.set(tag, (interests.get(tag) ?? 0) + 1)
    if (!tagGoals.has(tag)) tagGoals.set(tag, 'interest')
  }

  const base: Record<Preferences['rigor'], number> = {
    balanced: 0.4,
    challenging: 1.1,
    'very-rigorous': 1.9,
    maximum: 2.6,
  }
  let desiredLevel = base[prefs.rigor]
  if (goals.has('maximize-rigor')) desiredLevel = Math.max(desiredLevel, 2.3)
  if (goals.has('max-ap')) desiredLevel += 0.3
  if (prefs.balanceFirst) desiredLevel -= 0.5
  if (goals.has('balanced')) desiredLevel -= 0.4
  desiredLevel = Math.min(3, Math.max(0, desiredLevel))

  const protectTime = goals.has('athletics') || goals.has('extracurricular') || prefs.activities.length > 0
  const balanceFirst = prefs.balanceFirst || goals.has('balanced')

  const { min, max } = school.load
  let targetLoad = min
  if (prefs.rigor === 'maximum' || goals.has('maximize-rigor')) targetLoad = max
  else if (prefs.rigor === 'very-rigorous' && !protectTime && !balanceFirst) targetLoad = max
  targetLoad = Math.min(max, Math.max(min, targetLoad))

  const busySeasons = new Set<'fall' | 'spring'>()
  for (const activity of prefs.activities) {
    if (activity.hoursPerWeek < 6) continue
    for (const season of activity.seasons) {
      if (season === 'fall' || season === 'winter' || season === 'year-round') busySeasons.add('fall')
      if (season === 'spring' || season === 'winter' || season === 'year-round') busySeasons.add('spring')
    }
  }

  return {
    interests,
    tagGoals,
    desiredLevel,
    targetLoad,
    protectTime,
    balanceFirst,
    maxAp: goals.has('max-ap'),
    explore: goals.has('explore'),
    college: goals.has('college'),
    busySeasons,
    targets: new Set(prefs.targetCourses),
    avoid: new Set(prefs.avoidCourses),
    ...(prefs.language ? { language: prefs.language } : {}),
    raw: prefs,
  }
}

/** Interest match, capped so one course can't dominate on tags alone. */
export function interestScore(model: PreferenceModel, course: Course): number {
  let score = 0
  for (const tag of course.tags) score += model.interests.get(tag) ?? 0
  return Math.min(score, 3)
}

/** The goals a course speaks to, for "Fits your interest in engineering". */
export function matchedGoals(model: PreferenceModel, course: Course): string[] {
  const out = new Set<string>()
  for (const tag of course.tags) {
    const goal = model.tagGoals.get(tag)
    if (goal && goal !== 'interest') out.add(GOAL_LABELS[goal])
    else if (goal === 'interest') out.add(tag.replace(/-/g, ' '))
  }
  return [...out]
}

/**
 * How close a course's rigor is to what the student asked for. Subjects the
 * student cares about get pushed half a step harder.
 */
export function rigorScore(model: PreferenceModel, course: Course, weight: number): number {
  const interested = interestScore(model, course) > 0
  const desired = Math.min(3, model.desiredLevel + (interested ? 0.5 : 0))
  let score = -Math.abs(levelIndex(course.level) - desired) * weight
  if (model.maxAp && course.level === 'ap') score += 2
  return score
}

/** Heavier courses cost more for students protecting time. */
export function workloadScore(model: PreferenceModel, course: Course, term: TermIndex): number {
  let score = 0
  if (model.balanceFirst && course.workload > 2) score -= (course.workload - 2) * 2
  if (model.protectTime && model.busySeasons.has(seasonOfTerm(term))) {
    if (course.lab) score -= 1.5
    if (course.workload >= 3) score -= course.workload - 2
  }
  return score
}
