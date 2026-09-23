import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const token = (): string => randomBytes(32).toString('base64url');
export const digest = (value: string, key: string): string => createHmac('sha256', key).update(value).digest('hex');
export function equalSecret(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  return equalSecret((await derive(password, salt)).toString('hex'), expected);
}
