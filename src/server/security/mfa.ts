import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { encryptSecret, decryptSecret, hashSecret, newSecret } from './crypto.js';
import { newTotpSecret, totpCounter } from './totp.js';
interface MfaRow { user_id: string; secret_encrypted: string; enabled: boolean; last_counter: string | number; recovery_hashes: string[] }
export class MfaService {
  constructor(private db: Database, private key = process.env.SECRET_ENCRYPTION_KEY) {}
  private encryptionKey(): string { if (!this.key || Buffer.from(this.key, 'base64').length !== 32) throw new AppError(503, 'MFA_UNAVAILABLE', 'The identity encryption key is not configured.'); return this.key; }
  private secret(row: MfaRow): string {
    try { const value = JSON.parse(decryptSecret(row.secret_encrypted, this.encryptionKey())) as { user_id: string; secret: string }; if (value.user_id !== row.user_id) throw new Error('scope'); return value.secret; }
    catch { throw new AppError(503, 'MFA_UNAVAILABLE', 'The MFA credential could not be read.'); }
  }
  async enrolled(userId: string): Promise<boolean> { return this.db.transaction({ core: true }, async tx => Boolean((await tx.query<{ enabled: boolean }>('SELECT enabled FROM mfa_accounts WHERE user_id=$1', [userId])).rows[0]?.enabled)); }
  async challenge(userId: string, hostname: string, purpose: 'enroll' | 'login') {
    this.encryptionKey(); const token = newSecret();
    await this.db.transaction({ core: true }, async tx => {
      await tx.query('DELETE FROM mfa_challenges WHERE user_id=$1 AND consumed_at IS NULL', [userId]);
      await tx.query('INSERT INTO mfa_challenges(id,user_id,token_hash,purpose,origin_host,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), userId, hashSecret(token), purpose, hostname, new Date(Date.now() + 5 * 60_000).toISOString()]);
    });
    return { challenge_token: token, enrollment_required: purpose === 'enroll', expires_in: 300 };
  }
  private async challengeRow(tx: Executor, token: string, hostname: string) {
    const row = (await tx.query<{ id: string; user_id: string; purpose: string }>('SELECT id,user_id,purpose FROM mfa_challenges WHERE token_hash=$1 AND origin_host=$2 AND expires_at>now() AND consumed_at IS NULL AND attempts<8 AND EXISTS(SELECT 1 FROM users WHERE users.id=user_id AND users.status=\'active\') FOR UPDATE', [hashSecret(token), hostname])).rows[0];
    if (!row) throw new AppError(401, 'MFA_CHALLENGE_INVALID', 'The MFA challenge has expired or is unavailable.'); return row;
  }
  async setup(token: string, hostname: string) {
    const secret = newTotpSecret();
    const email = await this.db.transaction({ core: true }, async tx => {
      const challenge = await this.challengeRow(tx, token, hostname);
      if (challenge.purpose !== 'enroll' || (await tx.query<{ enabled: boolean }>('SELECT enabled FROM mfa_accounts WHERE user_id=$1', [challenge.user_id])).rows[0]?.enabled) throw new AppError(409, 'MFA_ALREADY_ENABLED', 'MFA is already enabled for this identity.');
      const encrypted = encryptSecret(JSON.stringify({ user_id: challenge.user_id, secret }), this.encryptionKey());
      await tx.query('INSERT INTO mfa_accounts(user_id,secret_encrypted) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET secret_encrypted=$2,last_counter=-1,updated_at=now()', [challenge.user_id, encrypted]);
      return (await tx.query<{ email: string }>('SELECT email FROM users WHERE id=$1 AND status=\'active\'', [challenge.user_id])).rows[0]?.email;
    });
    if (!email) throw new AppError(401, 'MFA_CHALLENGE_INVALID', 'The identity is unavailable.');
    const uri = `otpauth://totp/${encodeURIComponent(`Azuriya:${email}`)}?secret=${secret}&issuer=Azuriya&algorithm=SHA1&digits=6&period=30`;
    return { secret, provisioning_uri: uri, qr_data_url: await QRCode.toDataURL(uri), expires_in: 300 };
  }
  private async verifyCode(tx: Executor, row: MfaRow, code: string, allowRecovery: boolean): Promise<boolean> {
    const counter = totpCounter(this.secret(row), code, Number(row.last_counter));
    if (counter !== null) { await tx.query('UPDATE mfa_accounts SET last_counter=$1,updated_at=now() WHERE user_id=$2', [counter, row.user_id]); return true; }
    const index = allowRecovery ? row.recovery_hashes.indexOf(hashSecret(code)) : -1;
    if (index < 0) return false;
    await tx.query('UPDATE mfa_accounts SET recovery_hashes=recovery_hashes-$1::integer,updated_at=now() WHERE user_id=$2', [index, row.user_id]); return true;
  }
  private codes() { const recovery_codes = Array.from({ length: 10 }, () => newSecret().slice(0, 20)); return { recovery_codes, hashes: recovery_codes.map(hashSecret) }; }
  async verifyChallenge(token: string, hostname: string, code: string, requestId: string) {
    const result = await this.db.transaction({ core: true }, async tx => {
      const challenge = await this.challengeRow(tx, token, hostname);
      await tx.query('UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
      const row = (await tx.query<MfaRow>('SELECT * FROM mfa_accounts WHERE user_id=$1 FOR UPDATE', [challenge.user_id])).rows[0];
      if (!row || (challenge.purpose === 'login' && !row.enabled) || !await this.verifyCode(tx, row, code, challenge.purpose === 'login')) {
        await tx.query('INSERT INTO audit_events(id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), challenge.user_id, 'mfa.verification_failed', 'identity', challenge.user_id, requestId, '{}']); return null;
      }
      let recovery_codes: string[] | undefined;
      if (challenge.purpose === 'enroll') { const codes = this.codes(); recovery_codes = codes.recovery_codes; await tx.query('UPDATE mfa_accounts SET enabled=true,recovery_hashes=$1,updated_at=now() WHERE user_id=$2', [JSON.stringify(codes.hashes), row.user_id]); await tx.query('DELETE FROM sessions WHERE user_id=$1', [row.user_id]); }
      await tx.query('UPDATE mfa_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
      await tx.query('INSERT INTO audit_events(id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), row.user_id, challenge.purpose === 'enroll' ? 'mfa.enrolled' : 'mfa.verified', 'identity', row.user_id, requestId, '{}']);
      return { userId: row.user_id, recovery_codes };
    });
    if (!result) throw new AppError(401, 'MFA_INVALID_CODE', 'The code is incorrect, expired, or already used.'); return result;
  }
  async manage(userId: string, code: string, disable: boolean, requestId: string) {
    const result = await this.db.transaction({ core: true }, async tx => {
      const row = (await tx.query<MfaRow>('SELECT * FROM mfa_accounts WHERE user_id=$1 AND enabled=true FOR UPDATE', [userId])).rows[0];
      if (!row || !await this.verifyCode(tx, row, code, true)) return null;
      const codes = this.codes();
      if (disable) await tx.query('DELETE FROM mfa_accounts WHERE user_id=$1', [userId]);
      else await tx.query('UPDATE mfa_accounts SET recovery_hashes=$1,updated_at=now() WHERE user_id=$2', [JSON.stringify(codes.hashes), userId]);
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
      await tx.query('INSERT INTO audit_events(id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), userId, disable ? 'mfa.disabled' : 'mfa.recovery_regenerated', 'identity', userId, requestId, '{}']);
      return disable ? { disabled: true } : { recovery_codes: codes.recovery_codes };
    });
    if (!result) throw new AppError(401, 'MFA_INVALID_CODE', 'A valid current authenticator or recovery code is required.'); return result;
  }
}
