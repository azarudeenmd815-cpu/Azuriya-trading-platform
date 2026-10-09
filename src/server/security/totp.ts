import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(): string {
  let bits = 0; let value = 0; let result = '';
  for (const byte of randomBytes(20)) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return result;
}
function decode(secret: string): Buffer {
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const char of secret) { const index = alphabet.indexOf(char); if (index < 0) throw new Error('Invalid TOTP seed'); value = (value << 5) | index; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}
export function totp(secret: string, counter = Math.floor(Date.now() / 30_000), digits = 6): string {
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', decode(secret)).update(bytes).digest(); const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function totpCounter(secret: string, code: string, after: number, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const counter of [current, current - 1, current + 1]) if (counter > after && counter >= 0 && timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))) return counter;
  return null;
}
