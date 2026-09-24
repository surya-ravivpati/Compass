/**
 * A small in-memory sliding-window limiter for sign-in attempts. Per server
 * instance only -- enough to slow down guessing on one box; put a shared
 * limiter (Redis, the platform's WAF) in front for multi-instance deploys.
 */
const attempts = new Map<string, number[]>()

export function allowAttempt(key: string, limit = 8, windowMs = 15 * 60 * 1000, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    attempts.set(key, recent)
    return false
  }
  recent.push(now)
  attempts.set(key, recent)
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (v.every((t) => now - t >= windowMs)) attempts.delete(k)
  }
  return true
}

export function clearAttempts(key: string): void {
  attempts.delete(key)
}
