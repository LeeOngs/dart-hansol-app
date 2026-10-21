import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { redis } from './redis.js';

// The shared admin password can be changed from the site (admin mode), so it
// lives in Redis as a salted scrypt hash. Until it has been changed once —
// or if that key is deleted to recover a forgotten password — the
// ADMIN_PASSWORD env var set in Vercel is used instead.
const PASSWORD_KEY = 'admin_password';
export const MIN_ADMIN_PASSWORD_LENGTH = 8;

interface StoredPassword {
  salt: string;
  hash: string;
}

function hashPassword(password: string, salt: string): Buffer {
  return scryptSync(password, salt, 32);
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isValidAdminPassword(password: unknown): Promise<boolean> {
  if (typeof password !== 'string' || password.length === 0) return false;

  const stored = await redis().get<StoredPassword>(PASSWORD_KEY);
  if (stored?.salt && stored.hash) {
    return safeEqual(hashPassword(password, stored.salt), Buffer.from(stored.hash, 'hex'));
  }

  const expected = process.env.ADMIN_PASSWORD;
  return typeof expected === 'string' && expected.length > 0 && safeEqual(Buffer.from(password), Buffer.from(expected));
}

export async function setAdminPassword(newPassword: string): Promise<void> {
  const salt = randomBytes(16).toString('hex');
  const stored: StoredPassword = { salt, hash: hashPassword(newPassword, salt).toString('hex') };
  await redis().set(PASSWORD_KEY, stored);
}
