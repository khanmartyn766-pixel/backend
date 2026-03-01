import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const digest = scryptSync(password, salt, KEY_BYTES).toString('hex');
  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, hashed: string): boolean {
  const [salt, digestHex] = hashed.split(':');
  if (!salt || !digestHex) {
    return false;
  }
  const digest = Buffer.from(digestHex, 'hex');
  const check = scryptSync(password, salt, KEY_BYTES);
  if (digest.length !== check.length) {
    return false;
  }
  return timingSafeEqual(digest, check);
}
