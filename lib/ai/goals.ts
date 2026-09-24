import { GOAL_TAGS, type GoalId } from '../engine/index.ts'
import { generateContent, type ClientOptions } from './gemini.ts'
import { GOAL_INTERPRETER_PROMPT } from './prompts.ts'

const GOAL_IDS = Object.keys(GOAL_TAGS) as GoalId[]

/** The interest tags the catalog uses; the model may only pick from these. */
export function allowedInterestTags(courseTags: string[]): string[] {
  return [...new Set(courseTags)].sort()
}

/**
 * Turns a student's own words into suggested goals and interest tags. The
 * output is a suggestion the student confirms, restricted to known ids.
 */
export async function interpretGoals(
  text: string,
  tags: string[],
  options: ClientOptions = {},
): Promise<{ goals: GoalId[]; interests: string[] }> {
  const response = await generateContent(
    {
      system: GOAL_INTERPRETER_PROMPT,
      contents: [
        {
          role: 'user',
          parts: [{ text: `Allowed goal ids: ${GOAL_IDS.join(', ')}\nAllowed interest tags: ${tags.join(', ')}\n\nStudent wrote: "${text.slice(0, 500)}"` }],
        },
      ],
      json: {
        type: 'OBJECT',
        properties: {
          goals: { type: 'ARRAY', items: { type: 'STRING', enum: GOAL_IDS } },
          interests: { type: 'ARRAY', items: { type: 'STRING', enum: tags } },
        },
        required: ['goals', 'interests'],
      },
      temperature: 0,
      maxOutputTokens: 300,
    },
    options,
  )
  const parsed = JSON.parse(response.text) as { goals?: unknown; interests?: unknown }
  const goals = Array.isArray(parsed.goals) ? parsed.goals.filter((g): g is GoalId => GOAL_IDS.includes(g as GoalId)) : []
  const interests = Array.isArray(parsed.interests) ? parsed.interests.filter((t): t is string => typeof t === 'string' && tags.includes(t)) : []
  return { goals: [...new Set(goals)].slice(0, 6), interests: [...new Set(interests)].slice(0, 8) }
}
