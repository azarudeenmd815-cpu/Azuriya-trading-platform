import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, digest] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(digest ?? '')) return false;
  const expected = Buffer.from(digest, 'hex');
  const candidate = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(expected, candidate);
}
export function newSecret(): string { return randomBytes(32).toString('base64url'); }
export function hashSecret(secret: string): string { return createHash('sha256').update(secret).digest('hex'); }
function encryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('A 32-byte encryption key is required.');
  return key;
}
export function encryptSecret(secret: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  const bytes = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), bytes.toString('base64url')].join('.');
}
export function decryptSecret(ciphertext: string, key: string): string {
  const [version, iv, tag, payload] = ciphertext.split('.');
  if (version !== 'v1' || !iv || !tag || !payload) throw new Error('Invalid encrypted credential.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf8');
}
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /password|secret|credential|token|authorization|cookie|private.?key/i.test(key) ? '[REDACTED]' : redact(item)]));
  }
  return value;
}
