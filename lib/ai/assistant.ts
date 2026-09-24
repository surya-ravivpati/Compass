import { AiError, generateContent, type ClientOptions, type Content, type Part } from './gemini.ts'
import { systemPrompt, type StudentContext } from './prompts.ts'
import { executeTool, TOOL_DECLARATIONS, type Fact, type Proposal, type ToolContext } from './tools.ts'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface AssistantReply {
  status: 'ok' | 'offline' | 'error'
  text: string
  /** Database-backed facts the answer used. */
  facts: Fact[]
  /** Previews the student can open. Never applied by the AI. */
  proposals: Proposal[]
  toolsUsed: string[]
}

const MAX_TOOL_ROUNDS = 5
const MAX_HISTORY = 12

/**
 * One turn of Compass AI: the model may call engine tools (several rounds),
 * then answers from what they returned. Tool results, not the model, are the
 * source of every academic fact.
 */
export async function askCompass(
  tools: ToolContext,
  student: StudentContext,
  messages: ChatMessage[],
  options: ClientOptions = {},
): Promise<AssistantReply> {
  const facts: Fact[] = []
  const proposals: Proposal[] = []
  const toolsUsed: string[] = []
  const contents: Content[] = messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text.slice(0, 2000) }],
  }))
  if (contents.length === 0 || contents[contents.length - 1]!.role !== 'user') {
    return { status: 'error', text: 'Ask Compass a question about your plan.', facts, proposals, toolsUsed }
  }

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await generateContent(
        { system: systemPrompt(student), contents, tools: round < MAX_TOOL_ROUNDS ? TOOL_DECLARATIONS : [] },
        options,
      )
      if (response.calls.length === 0) {
        const text = response.text || 'I couldn’t put together an answer from your plan. Try asking another way.'
        return { status: 'ok', text, facts: dedupe(facts), proposals: dedupeProposals(proposals), toolsUsed }
      }
      // Echo the model turn verbatim (it carries thought signatures), then answer every call.
      contents.push(response.content)
      const answers: Part[] = []
      for (const call of response.calls) {
        const out = executeTool(tools, call.name, call.args)
        toolsUsed.push(call.name)
        facts.push(...out.facts)
        if (out.proposal) proposals.push(out.proposal)
        answers.push({ functionResponse: { name: call.name, response: out.result } })
      }
      contents.push({ role: 'user', parts: answers })
    }
    return {
      status: 'error',
      text: 'Compass AI needed too many steps to answer that. Try a narrower question.',
      facts: dedupe(facts),
      proposals: dedupeProposals(proposals),
      toolsUsed,
    }
  } catch (err) {
    if (err instanceof AiError && err.kind === 'not-configured') {
      return { status: 'offline', text: '', facts: [], proposals: [], toolsUsed: [] }
    }
    console.error('Compass AI failed', err instanceof AiError ? `${err.kind} ${err.status ?? ''}` : err)
    return {
      status: 'error',
      text: 'Compass AI is unavailable right now. Your plan hasn’t changed, and everything else in Compass still works.',
      facts: [],
      proposals: [],
      toolsUsed,
    }
  }
}

function dedupe(facts: Fact[]): Fact[] {
  const seen = new Set<string>()
  return facts.filter((f) => (seen.has(f.text) ? false : (seen.add(f.text), true)))
}

function dedupeProposals(proposals: Proposal[]): Proposal[] {
  const seen = new Set<string>()
  return proposals.filter((p) => (seen.has(p.title) ? false : (seen.add(p.title), true))).slice(0, 3)
}
