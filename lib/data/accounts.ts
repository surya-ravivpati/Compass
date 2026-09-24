import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { dummyHash, hashPassword, verifyPassword } from '../auth/password.ts'
import type { Database } from '../db/client.ts'
import { students, users } from '../db/schema.ts'

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ message: 'Enter a valid email address.' })).pipe(z.string().max(254)),
  password: z
    .string()
    .min(10, { message: 'Use at least 10 characters.' })
    .max(200, { message: 'That password is too long.' }),
})

export type SignUpResult = { ok: true; userId: string } | { ok: false; error: string }

export async function createAccount(db: Database, email: string, password: string): Promise<SignUpResult> {
  const parsed = credentialsSchema.safeParse({ email, password })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your email and password.' }
  const passwordHash = await hashPassword(parsed.data.password)
  try {
    const userId = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email: parsed.data.email, passwordHash }).returning({ id: users.id })
      await tx.insert(students).values({ userId: user!.id })
      return user!.id
    })
    return { ok: true, userId }
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: 'An account with that email already exists. Try signing in.' }
    throw err
  }
}

export async function authenticate(db: Database, email: string, password: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  const [user] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.email, normalized))
  if (!user) {
    await verifyPassword(password, await dummyHash())
    return null
  }
  return (await verifyPassword(password, user.passwordHash)) ? user.id : null
}

/** Deletes the account and, by cascade, every row the student owns. */
export async function deleteAccount(db: Database, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId))
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
  return code === '23505'
}
