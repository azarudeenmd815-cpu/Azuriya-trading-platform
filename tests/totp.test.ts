import { describe, expect, it } from 'vitest';
import { newTotpSecret, totp, totpCounter } from '../src/server/security/totp.js';
describe('RFC6238 SHA1 TOTP', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  it('matches all six RFC test vectors', () => {
    for (const [seconds, code] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']] as const) expect(totp(secret, Math.floor(seconds / 30), 8)).toBe(code);
  });
  it('rejects replayed counters and outside-window codes', () => {
    expect(totpCounter(secret, totp(secret, 100), 99, 3000_000)).toBe(100);
    expect(totpCounter(secret, totp(secret, 100), 100, 3000_000)).toBeNull();
    expect(totpCounter(secret, totp(secret, 90), -1, 3000_000)).toBeNull();
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });
});
