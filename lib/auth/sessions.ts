import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { sessions } from '../db/schema.ts'

export const SESSION_COOKIE = 'compass_session'
export const SESSION_DAYS = 30

const digest = (token: string) => createHash('sha256').update(token).digest('hex')

/** Issues a session and returns the raw token. Only its hash is stored. */
export async function issueSession(db: Database, userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({ id: digest(token), userId, expiresAt })
  // Opportunistic cleanup of this user's expired sessions.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)))
  return { token, expiresAt }
}

export async function resolveSession(db: Database, token: string | undefined, now = new Date()): Promise<string | null> {
  if (!token || token.length > 128) return null
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, digest(token)), gt(sessions.expiresAt, now)))
  return row?.userId ?? null
}

export async function revokeSession(db: Database, token: string | undefined): Promise<void> {
  if (!token) return
  await db.delete(sessions).where(eq(sessions.id, digest(token)))
}
