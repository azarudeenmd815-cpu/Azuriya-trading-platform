import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Row, TenantContext } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { serializable } from '../domain/utils.js';
import { BrokerageAccountsService } from '../brokerage/accounts.js';
import { scopeValues } from '../brokerage/common.js';
import { hashSecret } from '../security/crypto.js';
import type { ExternalScope } from './auth.js';

export const externalCredentialInput = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.literal('accounts:read')).min(1).max(1),
  expires_at: z.iso.datetime().optional(),
}).strict();
export const externalCredentialListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();

export interface ExternalCredentialInput { name: string; scopes: ExternalScope[]; expires_at?: string }

const credentialFields = 'id,organization_id,brand_id,environment_id,product_instance_id,name,prefix,scopes,expires_at,revoked_at,last_used_at,created_by,created_at,updated_at';
const externalCredentialWhere = `(scopes @> '["accounts:read"]'::jsonb)`;

function scopeWhere(alias = '') { const p = alias ? `${alias}.` : ''; return ['organization_id', 'brand_id', 'environment_id', 'product_instance_id'].map((field, i) => `${p}${field}=$${i + 1}`).join(' AND '); }

export class ExternalApiService {
  constructor(private db: Database) {}

  private audit(tx: Executor, scope: TenantContext, action: string, id: string): Promise<unknown> {
    return tx.query('INSERT INTO audit_events(id,organization_id,brand_id,environment_id,product_instance_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [randomUUID(), ...scopeValues(scope), scope.userId, action, 'api_key', id, scope.requestId, JSON.stringify({})]).then(async () => {
      await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(), scope.organizationId, action, JSON.stringify({ resource_type: 'api_key', resource_id: id, request_id: scope.requestId, scope: { organization_id: scope.organizationId, brand_id: scope.brandId, environment_id: scope.environmentId, product_instance_id: scope.productInstanceId } })]);
    });
  }

  async createCredential(scope: TenantContext, input: ExternalCredentialInput): Promise<{ credential: Row; secret: string }> {
    if (scope.supportGrantId) throw new AppError(403, 'SUPPORT_DELEGATION_DENIED', 'Support access cannot create persistent credentials.');
    if (scope.productSlug !== 'brokerage-crm') throw new AppError(404, 'PRODUCT_UNAVAILABLE', 'External credentials are available in a Brokerage CRM workspace.');
    if (input.expires_at && new Date(input.expires_at).getTime() <= Date.now()) throw new AppError(422, 'INVALID_EXPIRY', 'Choose a future credential expiry.');
    const secret = `azk_${randomBytes(32).toString('base64url')}`;
    const id = randomUUID();
    const row = await this.db.transaction({ organizationId: scope.organizationId, brandId: scope.brandId, environmentId: scope.environmentId, productInstanceId: scope.productInstanceId }, async tx => {
      const result = await tx.query<Row>(`INSERT INTO api_keys(id,organization_id,brand_id,environment_id,product_instance_id,name,prefix,secret_hash,scopes,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING ${credentialFields}`, [id, ...scopeValues(scope), input.name.trim(), secret.slice(0, 12), hashSecret(secret), JSON.stringify(input.scopes), input.expires_at ?? null, scope.userId]);
      await this.audit(tx, scope, 'api_key.created', id);
      return result.rows[0];
    });
    return { credential: serializable({ ...row, status: 'active' }), secret };
  }

  async listCredentials(scope: TenantContext, query: { limit: number; offset: number }): Promise<{ data: Row[]; pagination: { total: number; limit: number; offset: number } }> {
    return this.db.transaction({ organizationId: scope.organizationId, brandId: scope.brandId, environmentId: scope.environmentId, productInstanceId: scope.productInstanceId }, async tx => {
      const total = Number((await tx.query<{ total: string }>(`SELECT count(*) AS total FROM api_keys WHERE ${scopeWhere()} AND ${externalCredentialWhere}`, scopeValues(scope))).rows[0].total);
      const rows = (await tx.query<Row>(`SELECT ${credentialFields},CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN expires_at IS NOT NULL AND expires_at<=now() THEN 'expired' ELSE 'active' END AS status FROM api_keys WHERE ${scopeWhere()} AND ${externalCredentialWhere} ORDER BY created_at DESC,id DESC LIMIT $5 OFFSET $6`, [...scopeValues(scope), query.limit, query.offset])).rows;
      return { data: serializable(rows), pagination: { total, limit: query.limit, offset: query.offset } };
    });
  }

  async revokeCredential(scope: TenantContext, id: string): Promise<Row> {
    return this.db.transaction({ organizationId: scope.organizationId, brandId: scope.brandId, environmentId: scope.environmentId, productInstanceId: scope.productInstanceId }, async tx => {
      const row = (await tx.query<Row>(`UPDATE api_keys SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE ${scopeWhere()} AND ${externalCredentialWhere} AND id=$5 RETURNING ${credentialFields}`, [...scopeValues(scope), id])).rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'The credential does not exist in this scope.');
      await this.audit(tx, scope, 'api_key.revoked', id);
      return serializable({ ...row, status: 'revoked' });
    });
  }

  async listAccounts(context: TenantContext, query: unknown) {
    const page = await new BrokerageAccountsService(this.db).listAccounts(context, query);
    return { ...page, data: page.data.map(row => this.accountProjection(row, context.productInstanceId)) };
  }
  async getAccount(context: TenantContext, id: string) {
    return this.accountProjection(await new BrokerageAccountsService(this.db).getAccount(context, id), context.productInstanceId);
  }
  private accountProjection(row: Row, productInstanceId: string): Row {
    return serializable({
      id: row.id,
      account_number: row.account_number,
      account_type: row.account_type,
      currency: row.currency,
      leverage: row.leverage,
      status: row.status,
      sync_status: row.sync_status,
      synchronized_at: row.synchronized_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      product_instance_id: productInstanceId,
    });
  }
}
