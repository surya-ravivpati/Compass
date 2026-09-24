import type { ActivitySeason, GoalId, Rigor } from './engine/index.ts'

export const GOALS: { id: GoalId; label: string; hint: string }[] = [
  { id: 'college', label: 'Prepare for college', hint: 'Strong core academics every year' },
  { id: 'stem', label: 'STEM', hint: 'Math, science, and computing' },
  { id: 'engineering', label: 'Engineering', hint: 'Physics, advanced math, design' },
  { id: 'medicine', label: 'Medicine', hint: 'Biology, chemistry, health sciences' },
  { id: 'computer-science', label: 'Computer science', hint: 'Programming and discrete math' },
  { id: 'business', label: 'Business', hint: 'Economics, finance, entrepreneurship' },
  { id: 'humanities', label: 'Humanities', hint: 'Writing, history, languages' },
  { id: 'arts', label: 'The arts', hint: 'Visual and performing arts' },
  { id: 'explore', label: 'Explore broadly', hint: 'Try many different subjects' },
  { id: 'maximize-rigor', label: 'Maximize rigor', hint: 'The most challenging path available' },
  { id: 'max-ap', label: 'Maximize AP courses', hint: 'AP wherever it fits' },
  { id: 'balanced', label: 'Balanced workload', hint: 'Sustainable over rigorous' },
  { id: 'athletics', label: 'Time for athletics', hint: 'Protect time for sports' },
  { id: 'extracurricular', label: 'Time for activities', hint: 'Clubs, jobs, commitments' },
]

export const GOAL_IDS = GOALS.map((g) => g.id) as [GoalId, ...GoalId[]]

export const RIGOR_OPTIONS: { id: Rigor; label: string; hint: string }[] = [
  { id: 'balanced', label: 'Balanced', hint: 'A manageable load with room for life outside class.' },
  { id: 'challenging', label: 'Challenging', hint: 'Honors where it fits and some AP.' },
  { id: 'very-rigorous', label: 'Very rigorous', hint: 'Honors and AP in most core subjects.' },
  { id: 'maximum', label: 'Maximum rigor', hint: 'The hardest schedule available, with seven courses a semester.' },
]

export const SEASONS: { id: ActivitySeason; label: string }[] = [
  { id: 'fall', label: 'Fall' },
  { id: 'winter', label: 'Winter' },
  { id: 'spring', label: 'Spring' },
  { id: 'year-round', label: 'Year-round' },
]

export function goalLabel(id: GoalId): string {
  return GOALS.find((g) => g.id === id)?.label ?? id
}
