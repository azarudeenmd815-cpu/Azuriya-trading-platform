import { randomUUID } from 'node:crypto';
import type { TenantContext, Row } from '../../shared/types.js';
import { permissions } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { AppError } from './errors.js';
import { hashSecret, newSecret } from '../security/crypto.js';
import { databaseVault } from './credential-storage.js';
import { resolvePublicWebhook } from '../security/webhook-http.js';
import { boundDatabase } from '../api/idempotency.js';

const accountColumns = 'id,organization_id,brand_id,environment_id,product_instance_id,name,status,scopes,application_id,prefix,expires_at,revoked_at,last_used_at,created_at,updated_at';
export class ActivationService {
  constructor(private db: Database, private key = process.env.SECRET_ENCRYPTION_KEY, private resolveEndpoint = resolvePublicWebhook) {}
  private scope(actor: TenantContext): unknown[] { return [actor.organizationId, actor.brandId, actor.environmentId, actor.productInstanceId]; }
  private async tenant<T>(actor: TenantContext, permission: string, work: (tx: Executor) => Promise<T>): Promise<T> {
    if (actor.core || !actor.permissions.includes(permission) || !actor.organizationId || !actor.brandId || !actor.environmentId || !actor.productInstanceId) throw new AppError(403, 'PERMISSION_DENIED', 'A tenant staff context with the required permission is required.');
    return this.db.transaction({ organizationId: actor.organizationId }, async tx => {
      const scope = await tx.query(`SELECT i.id FROM product_instances i JOIN organizations o ON o.id=i.organization_id JOIN brands b ON b.id=i.brand_id JOIN environments e ON e.id=i.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE i.organization_id=$1 AND i.brand_id=$2 AND i.environment_id=$3 AND i.id=$4 AND i.status='active' AND o.status='active' AND b.status='active' AND e.status='active' AND p.status='active' AND s.status='active'`, this.scope(actor));
      if (!scope.rows[0]) throw new AppError(403, 'TENANT_UNAVAILABLE', 'The tenant product scope is unavailable.');
      return work(tx);
    });
  }
  private validateScopes(actor: TenantContext, scopes: string[]) {
    if (!scopes.length || new Set(scopes).size !== scopes.length || scopes.some(scope => !permissions.includes(scope as typeof permissions[number]) || !actor.permissions.includes(scope))) throw new AppError(422, 'INVALID_SCOPES', 'Choose unique scopes that your account is authorized to grant.');
  }
  private async appScope(tx: Executor, actor: TenantContext, id?: string, scopes: string[] = []) {
    if (!id) return;
    const app = (await tx.query<{ scopes: string[] }>("SELECT scopes FROM api_applications WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND id=$5 AND status='active'", [...this.scope(actor), id])).rows[0];
    if (!app || scopes.some(scope => !app.scopes.includes(scope))) throw new AppError(422, 'INVALID_APPLICATION', 'The application must be active in this scope and authorize every requested scope.');
  }
  async audit(tx: Executor, actor: TenantContext, action: string, type: string, id: string) {
    const scope = { organization_id: actor.organizationId, brand_id: actor.brandId, environment_id: actor.environmentId, product_instance_id: actor.productInstanceId };
    await tx.query('INSERT INTO audit_events(id,organization_id,brand_id,environment_id,product_instance_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [randomUUID(), ...this.scope(actor), actor.userId, action, type, id, actor.requestId, '{}']);
    await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(), actor.organizationId, action, JSON.stringify({ resource_type: type, resource_id: id, scope })]);
  }
  async createApplication(actor: TenantContext, input: { name: string; scopes: string[] }) {
    this.validateScopes(actor, input.scopes);
    return this.tenant(actor, 'api.write', async tx => {
      const row = (await tx.query<Row>('INSERT INTO api_applications(id,organization_id,brand_id,environment_id,product_instance_id,name,scopes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,organization_id,brand_id,environment_id,product_instance_id,name,status,scopes,created_at', [randomUUID(), ...this.scope(actor), input.name, JSON.stringify(input.scopes), actor.userId])).rows[0];
      await this.audit(tx, actor, 'api_application.created', 'api_application', String(row.id)); return row;
    });
  }
  async updateApplication(actor: TenantContext, id: string, input: { name?: string; status?: string; scopes?: string[] }) {
    if (input.scopes) this.validateScopes(actor, input.scopes);
    return this.tenant(actor, 'api.write', async tx => {
      const row = (await tx.query<Row>('UPDATE api_applications SET name=COALESCE($6,name),status=COALESCE($7,status),scopes=COALESCE($8::jsonb,scopes),updated_at=now() WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND id=$5 RETURNING id,name,status,scopes,updated_at', [...this.scope(actor), id, input.name ?? null, input.status ?? null, input.scopes ? JSON.stringify(input.scopes) : null])).rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Application not found.');
      await this.audit(tx, actor, 'api_application.updated', 'api_application', id); return row;
    });
  }
  async createAccount(actor: TenantContext, input: { name: string; scopes: string[]; expires_at?: string; application_id?: string }) {
    if (actor.supportGrantId) throw new AppError(403, 'SUPPORT_DELEGATION_DENIED', 'Support access cannot create persistent credentials.');
    this.validateScopes(actor, input.scopes);
    if (input.expires_at && new Date(input.expires_at).getTime() <= Date.now()) throw new AppError(422, 'INVALID_EXPIRY', 'Choose a future credential expiry.');
    return this.tenant(actor, 'api.write', async tx => {
      await this.appScope(tx, actor, input.application_id, input.scopes);
      const secret = `azs_${newSecret()}`; const id = randomUUID();
      const account = (await tx.query<Row>(`INSERT INTO service_accounts(id,organization_id,brand_id,environment_id,product_instance_id,name,scopes,application_id,expires_at,secret_hash,prefix,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${accountColumns}`, [id, ...this.scope(actor), input.name, JSON.stringify(input.scopes), input.application_id ?? null, input.expires_at ?? null, hashSecret(secret), secret.slice(0, 12), actor.userId])).rows[0];
      await this.audit(tx, actor, 'service_account.created', 'service_account', id); return { account, secret };
    });
  }
  async rotateAccount(actor: TenantContext, id: string) {
    return this.tenant(actor, 'api.write', async tx => {
      const secret = `azs_${newSecret()}`;
      const account = (await tx.query<Row>(`UPDATE service_accounts SET secret_hash=$6,prefix=$7,updated_at=now() WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND id=$5 AND status='active' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>now()) RETURNING ${accountColumns}`, [...this.scope(actor), id, hashSecret(secret), secret.slice(0, 12)])).rows[0];
      if (!account) throw new AppError(404, 'NOT_FOUND', 'An active service account was not found.');
      await this.appScope(tx, actor, account.application_id ? String(account.application_id) : undefined, account.scopes as string[]);
      await this.audit(tx, actor, 'service_account.rotated', 'service_account', id); return { account, secret };
    });
  }
  async revokeAccount(actor: TenantContext, id: string) {
    return this.tenant(actor, 'api.write', async tx => {
      const row = (await tx.query<Row>(`UPDATE service_accounts SET status='disabled',revoked_at=COALESCE(revoked_at,now()),secret_hash=NULL,updated_at=now() WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND id=$5 RETURNING ${accountColumns}`, [...this.scope(actor), id])).rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Service account not found.');
      await this.audit(tx, actor, 'service_account.revoked', 'service_account', id); return row;
    });
  }
  async createWebhook(actor: TenantContext, input: { name: string; url: string; events: string[]; application_id?: string; disable_after_failures?: number }) {
    await this.resolveEndpoint(input.url);
    return this.tenant(actor, 'webhooks.write', async tx => {
      await this.appScope(tx, actor, input.application_id);
      const id = randomUUID(); const secret = `whsec_${newSecret()}`;
      const reference = await databaseVault(boundDatabase(tx, actor), this.key).store({ organizationId: actor.organizationId, productInstanceId: actor.productInstanceId, providerId: `webhook:${id}` }, { secret });
      const endpoint = (await tx.query<Row>('INSERT INTO webhook_endpoints(id,organization_id,brand_id,environment_id,product_instance_id,name,url,events,signing_secret_reference,application_id,disable_after_failures) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,name,url,events,status,secret_version,consecutive_failures,disable_after_failures,created_at', [id, ...this.scope(actor), input.name, input.url, JSON.stringify(input.events), reference, input.application_id ?? null, input.disable_after_failures ?? null])).rows[0];
      await this.audit(tx, actor, 'webhook.created', 'webhook', id); return { endpoint, secret };
    });
  }
  async updateWebhook(actor: TenantContext, id: string, status: 'active' | 'disabled', rotate = false) {
    return this.tenant(actor, 'webhooks.write', async tx => {
      const old = (await tx.query<Row>('SELECT id,signing_secret_reference,url FROM webhook_endpoints WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND id=$5 FOR UPDATE', [...this.scope(actor), id])).rows[0];
      if (!old) throw new AppError(404, 'NOT_FOUND', 'Webhook not found.');
      if (status === 'active') await this.resolveEndpoint(String(old.url));
      let secret: string | undefined; let reference = old.signing_secret_reference;
      if (rotate || !reference) { secret = `whsec_${newSecret()}`; reference = await databaseVault(boundDatabase(tx, actor), this.key).store({ organizationId: actor.organizationId, productInstanceId: actor.productInstanceId, providerId: `webhook:${id}` }, { secret }); }
      const endpoint = (await tx.query<Row>('UPDATE webhook_endpoints SET status=$1,signing_secret_reference=$2,secret_version=secret_version+CASE WHEN $3 THEN 1 ELSE 0 END,consecutive_failures=0,updated_at=now() WHERE id=$4 RETURNING id,name,url,events,status,secret_version,updated_at', [status, reference, rotate, id])).rows[0];
      if (secret && old.signing_secret_reference) await tx.query('DELETE FROM credential_envelopes WHERE id=$1', [old.signing_secret_reference]);
      await this.audit(tx, actor, rotate ? 'webhook.secret_rotated' : 'webhook.updated', 'webhook', id); return { endpoint, ...(secret ? { secret } : {}) };
    });
  }
  async replayDelivery(actor: TenantContext, id: string) {
    return this.tenant(actor, 'webhooks.write', async tx => {
      const row = (await tx.query<Row>("UPDATE webhook_deliveries SET status='pending',attempts=0,next_attempt_at=now(),error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND id=$5 AND status IN('failed','dead_letter','delivered') AND EXISTS(SELECT 1 FROM webhook_endpoints e WHERE e.id=webhook_endpoint_id AND e.status='active') RETURNING id,event_id,status", [...this.scope(actor), id])).rows[0];
      if (!row) throw new AppError(409, 'REPLAY_UNAVAILABLE', 'This delivery cannot be replayed in its current state.');
      await this.audit(tx, actor, 'webhook.delivery_replayed', 'webhook_delivery', id); return row;
    });
  }
  async grantSupport(actor: TenantContext, input: { user_id: string; reason: string; scopes: string[]; expires_at: string }) {
    if (actor.supportGrantId) throw new AppError(403, 'SUPPORT_DELEGATION_DENIED', 'Support access cannot grant additional support access.');
    this.validateScopes(actor, input.scopes);
    const expiry = new Date(input.expires_at).getTime();
    if (expiry <= Date.now() || expiry > Date.now() + 4 * 3600_000 || input.reason.trim().length < 10) throw new AppError(422, 'INVALID_SUPPORT_GRANT', 'Provide a reason of at least ten characters and an expiry within four hours.');
    return this.tenant(actor, 'staff.write', async tx => {
      if (!(await tx.query("SELECT id FROM users WHERE id=$1 AND core_role='super_admin' AND status='active'", [input.user_id])).rows[0]) throw new AppError(422, 'INVALID_SUPPORT_USER', 'Choose an active Core support identity.');
      const row = (await tx.query<Row>('INSERT INTO support_access_grants(id,organization_id,brand_id,environment_id,product_instance_id,user_id,granted_by,reason,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,user_id,reason,scopes,starts_at,expires_at,revoked_at,created_at', [randomUUID(), ...this.scope(actor), input.user_id, actor.userId, input.reason.trim(), JSON.stringify(input.scopes), input.expires_at])).rows[0];
      await this.audit(tx, actor, 'support.granted', 'support_grant', String(row.id)); return row;
    });
  }
  async revokeSupport(actor: TenantContext, id: string) {
    return this.tenant(actor, 'staff.write', async tx => {
      const row = (await tx.query<Row>('UPDATE support_access_grants SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND id=$5 RETURNING id,revoked_at', [...this.scope(actor), id])).rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Support grant not found.');
      await this.audit(tx, actor, 'support.revoked', 'support_grant', id); return row;
    });
  }
}
