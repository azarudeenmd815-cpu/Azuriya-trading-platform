export interface CredentialScope { organizationId: string; providerId: string; productInstanceId: string }
export interface EncryptedCredential { version: 1; iv: string; tag: string; ciphertext: string }
export interface CredentialStore {
  put(reference: string, envelope: EncryptedCredential, scope: CredentialScope): Promise<void>;
  get(reference: string, scope: CredentialScope): Promise<EncryptedCredential | undefined>;
}
export interface CredentialVault {
  store(scope: CredentialScope, credential: Record<string, string>): Promise<string>;
  read(scope: CredentialScope, reference: string): Promise<Record<string, string>>;
}
export class AesCredentialVault implements CredentialVault {
  constructor(private readonly storage: CredentialStore, private readonly encryptionKey?: Uint8Array) {}
  private key(): Buffer {
    if (!this.encryptionKey || this.encryptionKey.byteLength !== 32) {
      throw new AppError(503, 'CREDENTIAL_VAULT_UNAVAILABLE', 'A 256-bit encryption key and credential storage must be configured before connections can be created.');
    }
    return Buffer.from(this.encryptionKey);
  }
  private binding(scope: CredentialScope, reference: string): Buffer {
    return Buffer.from(JSON.stringify([1, scope.organizationId, scope.providerId, scope.productInstanceId, reference]));
  }
  async store(scope: CredentialScope, credential: Record<string, string>): Promise<string> {
    const key = this.key();
    const reference = randomUUID();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.binding(scope, reference));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credential), 'utf8'), cipher.final()]);
    await this.storage.put(reference, { version: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') }, scope);
    return reference;
  }
  async read(scope: CredentialScope, reference: string): Promise<Record<string, string>> {
    const key = this.key();
    const envelope = await this.storage.get(reference, scope);
    if (!envelope) throw new AppError(404, 'CREDENTIAL_NOT_FOUND', 'The credential reference does not exist in this scope.');
    try {
      if (envelope.version !== 1) throw new Error('Unsupported credential version');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
      decipher.setAAD(this.binding(scope, reference));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
      const value: unknown = JSON.parse(plaintext);
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some((field) => typeof field !== 'string')) throw new Error('Invalid credential payload');
      return value as Record<string, string>;
    } catch {
      throw new AppError(422, 'CREDENTIAL_AUTHENTICATION_FAILED', 'Credential decryption failed; the encrypted credential or scope is invalid.');
    }
  }
}
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
