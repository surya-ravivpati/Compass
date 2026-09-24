import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const N = 32768
const R = 8
const P = 1
const KEY_LENGTH = 64

function derive(password: string, salt: Buffer, options: ScryptOptions, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, length, options, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/** scrypt with a random salt. Parameters are stored with the hash so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, KEY_LENGTH)
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const key = await derive(
    password,
    Buffer.from(saltB64, 'base64'),
    { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024 },
    expected.length,
  )
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** A hash to verify against when the account doesn't exist, so timing doesn't reveal which emails are registered. */
let dummy: Promise<string> | undefined
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'))
  return dummy
}
