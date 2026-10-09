import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, hashSecret, newSecret, encryptSecret, decryptSecret, redact } from '../src/server/security/crypto.js';

describe('security primitives', () => {
  it('salts password hashes and rejects wrong or malformed passwords', async () => {
    const one = await hashPassword('a-secure-test-password');
    const two = await hashPassword('a-secure-test-password');
    expect(one).not.toBe(two);
    expect(one).not.toContain('a-secure-test-password');
    expect(await verifyPassword('a-secure-test-password', one)).toBe(true);
    expect(await verifyPassword('wrong-password', one)).toBe(false);
    expect(await verifyPassword('anything', 'invalid')).toBe(false);
  });
  it('generates independent high entropy secrets and one-way digests', () => {
    const secret = newSecret();
    expect(secret.length).toBeGreaterThanOrEqual(43);
    expect(newSecret()).not.toBe(secret);
    expect(hashSecret(secret)).toHaveLength(64);
    expect(hashSecret(secret)).not.toContain(secret);
  });
  it('authenticates encrypted credentials and fails closed on missing key', () => {
    const key = Buffer.alloc(32, 17).toString('base64');
    const encrypted = encryptSecret('provider-secret', key);
    expect(encrypted).not.toContain('provider-secret');
    expect(decryptSecret(encrypted, key)).toBe('provider-secret');
    expect(() => decryptSecret(encrypted, Buffer.alloc(32, 18).toString('base64'))).toThrow();
    expect(() => encryptSecret('secret', '')).toThrow();
  });
  it('recursively redacts sensitive metadata while retaining resource context', () => {
    expect(redact({ organization_id: 'org', password: 'p', nested: { access_token: 't', provider_credentials: 'c', action: 'connected' }, secret_hash: 'h' })).toEqual({ organization_id: 'org', password: '[REDACTED]', nested: { access_token: '[REDACTED]', provider_credentials: '[REDACTED]', action: 'connected' }, secret_hash: '[REDACTED]' });
  });
});
