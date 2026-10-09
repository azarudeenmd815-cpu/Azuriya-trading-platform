import { randomUUID } from 'node:crypto';
import type { Database, Executor } from '../db/database.js';
import type { TenantContext } from '../../shared/types.js';
import { AppError } from './errors.js';
import { encryptSecret, decryptSecret, hashSecret, hashPassword, verifyPassword, newSecret } from '../security/crypto.js';
import { boundDatabase } from '../api/idempotency.js';
import { ActivationService } from './activation-service.js';
import type { OutboxEvent } from './outbox-worker.js';
interface Invite { id: string; organization_id: string; brand_id: string; environment_id: string; product_instance_id: string; email: string; kind: 'staff' | 'client'; role_id: string | null; created_by: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }
export interface InvitationEmail { to: string; subject: string; text: string; business_name: string; return_url: string }
export interface EmailProvider { send(message: InvitationEmail, idempotencyKey: string): Promise<void> }
export class ResendEmailProvider implements EmailProvider {
  constructor(private apiKey = process.env.EMAIL_API_KEY, private from = process.env.EMAIL_FROM) {}
  async send(message: InvitationEmail, idempotencyKey: string): Promise<void> {
    if (!this.apiKey || !this.from) throw new AppError(503, 'EMAIL_UNAVAILABLE', 'The email provider is not configured.');
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }) });
    if (!response.ok) throw new Error('EMAIL_PROVIDER_FAILED');
  }
}
export function invitationEmailHandler(db: Database, provider: EmailProvider = new ResendEmailProvider(), key = process.env.SECRET_ENCRYPTION_KEY) {
  return async (event: OutboxEvent) => {
    if (!key || typeof event.payload.encrypted_message !== 'string') throw new Error('EMAIL_JOB_UNAVAILABLE');
    const message = JSON.parse(decryptSecret(event.payload.encrypted_message, key)) as InvitationEmail & { invitation_id: string; token_hash: string; organization_id: string };
    if (event.organization_id !== message.organization_id) throw new Error('EMAIL_SCOPE_MISMATCH');
    const current = await db.transaction({ organizationId: message.organization_id }, async tx => (await tx.query('SELECT id FROM invitations WHERE id=$1 AND token_hash=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()', [message.invitation_id, message.token_hash])).rows[0]);
    if (!current) return;
    await provider.send(message, event.id);
  };
}
export class InvitationService {
  constructor(private db: Database, private origin: string, private production: boolean, private key = process.env.SECRET_ENCRYPTION_KEY) {}
  private scope(actor: TenantContext): unknown[] { return [actor.organizationId, actor.brandId, actor.environmentId, actor.productInstanceId]; }
  private requireActor(actor: TenantContext) { if (actor.core || actor.supportGrantId || !actor.permissions.includes('staff.write')) throw new AppError(403, 'PERMISSION_DENIED', 'An authorized tenant administrator must manage invitations.'); }
  private async validate(tx: Executor, actor: TenantContext, roleId?: string) {
    const row = await tx.query("SELECT i.id FROM product_instances i JOIN organizations o ON o.id=i.organization_id JOIN brands b ON b.id=i.brand_id JOIN environments e ON e.id=i.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE i.organization_id=$1 AND i.brand_id=$2 AND i.environment_id=$3 AND i.id=$4 AND i.status='active' AND o.status='active' AND b.status='active' AND e.status='active' AND p.status='active' AND s.status='active'", this.scope(actor));
    if (!row.rows[0]) throw new AppError(403, 'TENANT_UNAVAILABLE', 'The product scope is unavailable.');
    if (roleId) {
      const role = (await tx.query('SELECT id FROM roles WHERE organization_id=$1 AND id=$2', [actor.organizationId, roleId])).rows[0];
      const codes = (await tx.query<{ permission_code: string }>('SELECT permission_code FROM role_permissions WHERE organization_id=$1 AND role_id=$2', [actor.organizationId, roleId])).rows.map(value => value.permission_code);
      if (!role || !codes.length || codes.some(code => !actor.permissions.includes(code))) throw new AppError(403, 'ROLE_ESCALATION_DENIED', 'You cannot invite a user into a role with greater access.');
    }
  }
  private async enqueue(tx: Executor, invite: Invite, token: string) {
    if (!this.key || Buffer.from(this.key, 'base64').length !== 32) throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Configure the encrypted invitation job key before inviting users.');
    const domain = (await tx.query<{ hostname: string }>("SELECT hostname FROM domains WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND application_type=$5 AND status='active' AND ssl_status='active' AND edge_status='active' AND verified_at IS NOT NULL ORDER BY is_primary DESC,created_at LIMIT 1", [invite.organization_id, invite.brand_id, invite.environment_id, invite.product_instance_id, invite.kind === 'staff' ? 'admin_portal' : 'client_portal'])).rows[0];
    if (this.production && !domain) throw new AppError(409, 'INVITATION_DOMAIN_REQUIRED', 'Activate a branded HTTPS application domain before sending invitations.');
    const brand = (await tx.query<{ name: string; config: { business_name?: string } }>('SELECT name,config FROM brands WHERE id=$1 AND organization_id=$2', [invite.brand_id, invite.organization_id])).rows[0];
    const business = brand.config.business_name ?? brand.name;
    const url = `${domain ? `https://${domain.hostname}` : this.origin}/accept-invitation#token=${token}`;
    const message = { to: invite.email, business_name: business, subject: `${business}: your ${invite.kind} invitation`, return_url: url, text: `${business} invited you to its ${invite.kind === 'staff' ? 'administration workspace' : 'client portal'}.\n\nAccept this invitation: ${url}\n\nThis link expires at ${new Date(invite.expires_at).toISOString()}.`, invitation_id: invite.id, token_hash: hashSecret(token), organization_id: invite.organization_id };
    await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(), invite.organization_id, 'invitation.email', JSON.stringify({ encrypted_message: encryptSecret(JSON.stringify(message), this.key) })]);
  }
  async create(actor: TenantContext, input: { email: string; kind: 'staff' | 'client'; role_id?: string; expires_in_hours?: number }) {
    this.requireActor(actor);
    if ((input.kind === 'staff') !== Boolean(input.role_id)) throw new AppError(422, 'INVITATION_ROLE_REQUIRED', 'Staff invitations require a tenant role; client invitations have no staff role.');
    return this.db.transaction({ organizationId: actor.organizationId }, async tx => {
      await this.validate(tx, actor, input.role_id);
      if ((await tx.query<{ core_role: string | null }>('SELECT core_role FROM users WHERE email=$1', [input.email])).rows[0]?.core_role) throw new AppError(422, 'CORE_IDENTITY_NOT_TENANT_STAFF', 'Use a separate customer identity.');
      const token = newSecret();
      const invite = (await tx.query<Invite>('INSERT INTO invitations(id,organization_id,brand_id,environment_id,product_instance_id,email,kind,role_id,created_by,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,organization_id,brand_id,environment_id,product_instance_id,email,kind,role_id,created_by,expires_at,accepted_at,revoked_at', [randomUUID(), ...this.scope(actor), input.email, input.kind, input.role_id ?? null, actor.userId, hashSecret(token), new Date(Date.now() + (input.expires_in_hours ?? 24) * 3600_000).toISOString()])).rows[0];
      await this.enqueue(tx, invite, token); await new ActivationService(boundDatabase(tx, actor)).audit(tx, actor, 'invitation.created', 'invitation', invite.id); return invite;
    });
  }
  async change(actor: TenantContext, id: string, rotate: boolean) {
    this.requireActor(actor);
    return this.db.transaction({ organizationId: actor.organizationId }, async tx => {
      const old = (await tx.query<Invite>('SELECT * FROM invitations WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND id=$5 AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE', [...this.scope(actor), id])).rows[0];
      if (!old) throw new AppError(404, 'NOT_FOUND', 'An outstanding invitation was not found.');
      await this.validate(tx, actor, old.role_id ?? undefined);
      if (rotate) { const token = newSecret(); await tx.query("UPDATE invitations SET token_hash=$1,expires_at=now()+interval '24 hours',updated_at=now() WHERE id=$2", [hashSecret(token), id]); old.expires_at = new Date(Date.now() + 86400_000).toISOString(); await this.enqueue(tx, old, token); }
      else await tx.query('UPDATE invitations SET revoked_at=now(),updated_at=now() WHERE id=$1', [id]);
      await new ActivationService(boundDatabase(tx, actor)).audit(tx, actor, rotate ? 'invitation.rotated' : 'invitation.revoked', 'invitation', id); return { id, rotated: rotate, revoked: !rotate };
    });
  }
  async inspect(token: string, instanceId?: string, applicationType?: string) {
    return this.db.transaction({ core: true }, async tx => {
      const invite = (await tx.query<Invite>('SELECT * FROM invitations WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL', [hashSecret(token)])).rows[0];
      if (!invite || (instanceId && instanceId !== invite.product_instance_id) || (applicationType && applicationType !== (invite.kind === 'staff' ? 'admin_portal' : 'client_portal'))) throw new AppError(401, 'INVITATION_INVALID', 'The invitation is expired or unavailable.');
      const brand = (await tx.query('SELECT name,config FROM brands WHERE id=$1', [invite.brand_id])).rows[0];
      return { kind: invite.kind, email: invite.email, expires_at: invite.expires_at, brand };
    });
  }
  async accept(token: string, input: { password: string; display_name: string }, requestId: string, instanceId?: string, applicationType?: string) {
    return this.db.transaction({ core: true }, async tx => {
      const invite = (await tx.query<Invite>('SELECT * FROM invitations WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE', [hashSecret(token)])).rows[0];
      if (!invite || (instanceId && instanceId !== invite.product_instance_id) || (applicationType && applicationType !== (invite.kind === 'staff' ? 'admin_portal' : 'client_portal'))) throw new AppError(401, 'INVITATION_INVALID', 'The invitation is expired or unavailable.');
      // Different invitations for the same new identity must serialize across application processes.
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('invitation-identity:' || $1,0))", [invite.email]);
      const current = (await tx.query<{ id: string; password_hash: string; status: string; core_role: string | null }>('SELECT id,password_hash,status,core_role FROM users WHERE email=$1 FOR UPDATE', [invite.email])).rows[0];
      if (current && (current.core_role || current.status !== 'active' || !await verifyPassword(input.password, current.password_hash))) throw new AppError(401, 'INVITATION_AUTHENTICATION_FAILED', 'Sign in with the existing identity password to accept this invitation.');
      const creator = (await tx.query<{ status: string }>('SELECT status FROM users WHERE id=$1', [invite.created_by])).rows[0];
      if (creator?.status !== 'active') throw new AppError(401, 'INVITATION_INVALID', 'The invitation issuer is unavailable.');
      const issuerCodes = (await tx.query<{ permission_code: string }>('SELECT DISTINCT rp.permission_code FROM staff_memberships m JOIN role_permissions rp ON rp.role_id=m.role_id AND rp.organization_id=m.organization_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.status=\'active\' AND(m.environment_id IS NULL OR m.environment_id=$3) AND(m.product_instance_id IS NULL OR m.product_instance_id=$4)', [invite.created_by, invite.organization_id, invite.environment_id, invite.product_instance_id])).rows.map(row => row.permission_code);
      if (!issuerCodes.includes('staff.write')) throw new AppError(401, 'INVITATION_INVALID', 'The invitation issuer no longer has permission.');
      const actor: TenantContext = { userId: invite.created_by, requestId, core: false, organizationId: invite.organization_id, brandId: invite.brand_id, environmentId: invite.environment_id, productInstanceId: invite.product_instance_id, productSlug: '', permissions: issuerCodes };
      await this.validate(tx, actor, invite.role_id ?? undefined);
      const id = current?.id ?? randomUUID();
      if (!current) await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [id, invite.email, await hashPassword(input.password), input.display_name]);
      if (invite.kind === 'staff') {
        const updated = await tx.query("UPDATE staff_memberships SET role_id=$4,status='active',updated_at=now() WHERE organization_id=$1 AND user_id=$2 AND environment_id=$3 AND product_instance_id=$5 RETURNING id", [invite.organization_id, id, invite.environment_id, invite.role_id, invite.product_instance_id]);
        if (!updated.rows.length) await tx.query('INSERT INTO staff_memberships(id,organization_id,user_id,role_id,environment_id,product_instance_id) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), invite.organization_id, id, invite.role_id, invite.environment_id, invite.product_instance_id]);
      } else await tx.query("INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,product_instance_id) DO UPDATE SET status='active',updated_at=now()", [randomUUID(), invite.organization_id, id, invite.product_instance_id]);
      await tx.query('UPDATE invitations SET accepted_at=now(),updated_at=now() WHERE id=$1', [invite.id]);
      await new ActivationService(boundDatabase(tx, { ...actor, core: true })).audit(tx, actor, 'invitation.accepted', 'invitation', invite.id);
      return { accepted: true, sign_in_required: true, product_instance_id: invite.product_instance_id, kind: invite.kind };
    });
  }
}
