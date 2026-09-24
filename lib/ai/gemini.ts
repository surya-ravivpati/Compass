import { aiModel } from './config.ts'

/*
 * A minimal Gemini REST client (generateContent). Server-side only: the key
 * is read from the environment here and never sent to the browser.
 */

export type SchemaType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT'

export interface Schema {
  type: SchemaType
  description?: string
  enum?: string[]
  items?: Schema
  properties?: Record<string, Schema>
  required?: string[]
  nullable?: boolean
}

export interface FunctionDeclaration {
  name: string
  description: string
  parameters?: Schema
}

export type Part =
  | { text: string; thought?: boolean; thoughtSignature?: string }
  | { functionCall: { name: string; args?: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

export interface Content {
  role: 'user' | 'model'
  parts: Part[]
}

export interface GenerateRequest {
  system: string
  contents: Content[]
  tools?: FunctionDeclaration[]
  /** Ask for JSON matching this schema instead of free text. */
  json?: Schema
  temperature?: number
  maxOutputTokens?: number
}

export interface GenerateResponse {
  /** The model turn, verbatim -- echo it back unchanged to keep thought signatures. */
  content: Content
  text: string
  calls: { name: string; args: Record<string, unknown> }[]
  finishReason?: string
}

export type AiErrorKind = 'not-configured' | 'http' | 'timeout' | 'blocked' | 'empty' | 'network'

export class AiError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
  }
}

export interface ClientOptions {
  apiKey?: string
  model?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function generateContent(req: GenerateRequest, options: ClientOptions = {}): Promise<GenerateResponse> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new AiError('not-configured', 'Compass AI is not configured on this server.')
  const model = options.model ?? aiModel()
  const doFetch = options.fetchImpl ?? fetch
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    generationConfig: {
      temperature: req.temperature ?? 0.3,
      maxOutputTokens: req.maxOutputTokens ?? 1200,
      ...(req.json ? { responseMimeType: 'application/json', responseSchema: req.json } : {}),
    },
  }
  if (req.tools?.length) {
    body.tools = [{ functionDeclarations: req.tools }]
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
  }

  let res: Response
  try {
    res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
    })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiError('timeout', 'Compass AI took too long to respond.')
    }
    throw new AiError('network', 'Compass AI could not be reached.')
  }
  if (!res.ok) {
    throw new AiError('http', `Compass AI returned an error (${res.status}).`, res.status)
  }
  const data = (await res.json()) as {
    candidates?: { content?: Content; finishReason?: string }[]
    promptFeedback?: { blockReason?: string }
  }
  if (data.promptFeedback?.blockReason) throw new AiError('blocked', 'Compass AI could not answer that request.')
  const candidate = data.candidates?.[0]
  const content = candidate?.content
  if (!content?.parts?.length) {
    if (candidate?.finishReason === 'SAFETY') throw new AiError('blocked', 'Compass AI could not answer that request.')
    throw new AiError('empty', 'Compass AI returned an empty answer.')
  }
  const text = content.parts
    .filter((p): p is { text: string; thought?: boolean } => 'text' in p && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim()
  const calls = content.parts
    .filter((p): p is Extract<Part, { functionCall: unknown }> => 'functionCall' in p)
    .map((p) => ({ name: p.functionCall.name, args: p.functionCall.args ?? {} }))
  return { content: { role: 'model', parts: content.parts }, text, calls, ...(candidate?.finishReason ? { finishReason: candidate.finishReason } : {}) }
}
