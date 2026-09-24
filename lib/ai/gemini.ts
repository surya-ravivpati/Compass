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
  /** Includes the model's thinking: a thinking model spends part of it before answering. */
  maxOutputTokens?: number
  /**
   * How much to think first. Small structured tasks ask for little, so the
   * answer isn't crowded out; a model that doesn't offer the level uses its
   * default instead.
   */
  thinking?: ThinkingLevel
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'

export interface GenerateResponse {
  /** The model turn, verbatim -- echo it back unchanged to keep thought signatures. */
  content: Content
  text: string
  calls: { name: string; args: Record<string, unknown> }[]
  finishReason?: string
}

export type AiErrorKind = 'not-configured' | 'http' | 'timeout' | 'blocked' | 'empty' | 'incomplete' | 'network'

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

/** Thinking levels a model has refused, so each is only tried once per server. */
const unsupportedThinking = new Set<string>()

export async function generateContent(req: GenerateRequest, options: ClientOptions = {}): Promise<GenerateResponse> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new AiError('not-configured', 'Compass AI is not configured on this server.')
  const model = options.model ?? aiModel()
  const doFetch = options.fetchImpl ?? fetch
  const thinkingKey = req.thinking ? `${model}:${req.thinking}` : ''
  const body = (withThinking: boolean): string =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.contents,
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxOutputTokens ?? 4096,
        ...(req.json ? { responseMimeType: 'application/json', responseSchema: req.json } : {}),
        ...(withThinking && req.thinking ? { thinkingConfig: { thinkingLevel: req.thinking } } : {}),
      },
      ...(req.tools?.length
        ? { tools: [{ functionDeclarations: req.tools }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } }
        : {}),
    })
  const send = async (withThinking: boolean): Promise<Response> => {
    try {
      return await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: body(withThinking),
        signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
      })
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new AiError('timeout', 'Compass AI took too long to respond.')
      }
      throw new AiError('network', 'Compass AI could not be reached.')
    }
  }

  const tryThinking = !!req.thinking && !unsupportedThinking.has(thinkingKey)
  let res = await send(tryThinking)
  if (tryThinking && res.status === 400) {
    // Models differ in which thinking levels they offer (Gemini 2.5 has none).
    const detail = await res.text().catch(() => '')
    if (/thinking/i.test(detail)) {
      unsupportedThinking.add(thinkingKey)
      res = await send(false)
    } else {
      throw new AiError('http', `Compass AI returned an error (${res.status}).`, res.status)
    }
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
  // A cut-off answer is broken JSON or a half sentence: never pass it on.
  if (candidate?.finishReason === 'MAX_TOKENS') throw new AiError('incomplete', 'Compass AI’s answer was cut off.')
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
