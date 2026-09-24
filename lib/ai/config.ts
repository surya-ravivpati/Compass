/** Compass AI runs only when a Gemini key is configured server-side. */
export function isAiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY
}

export function aiModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-3.5-flash'
}
