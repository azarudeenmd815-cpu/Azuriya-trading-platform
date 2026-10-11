import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Row, TenantContext } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { serializable } from '../domain/utils.js';
import { accountStates } from '../brokerage/accounts.js';
import { orderStatuses } from '../brokerage/orders.js';
import { BrokerageOrdersService } from '../brokerage/orders.js';
import { scopeValues } from '../brokerage/common.js';
import { hashSecret } from '../security/crypto.js';
import { EXTERNAL_SCOPES, type ExternalScope } from './auth.js';

export const externalCredentialInput = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(EXTERNAL_SCOPES)).min(1).max(EXTERNAL_SCOPES.length).refine(values => new Set(values).size === values.length, 'Scopes must be unique.'),
  expires_at: z.iso.datetime().optional(),
}).strict();
export const externalCredentialListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();
export const externalAccountListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  status: z.string().trim().min(1).max(40).optional(),
  client_id: z.uuid().optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(40).default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
}).strict();
export const externalOrderListSchema = z.object({
  status: z.enum(orderStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();
export const externalPositionListSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();

export interface ExternalCredentialInput { name: string; scopes: ExternalScope[]; expires_at?: string }

const credentialFields = 'id,organization_id,brand_id,environment_id,product_instance_id,name,prefix,scopes,expires_at,revoked_at,last_used_at,created_by,created_at,updated_at';
const externalCredentialWhere = `(scopes <@ '["accounts:read","orders:read","positions:read"]'::jsonb AND scopes ?| ARRAY['accounts:read','orders:read','positions:read'])`;

function scopeWhere(alias = '') { const p = alias ? `${alias}.` : ''; return ['organization_id', 'brand_id', 'environment_id', 'product_instance_id'].map((field, i) => `${p}${field}=$${i + 1}`).join(' AND '); }
function requireUuid(value: string, code: string, message: string): void {
  if (!z.uuid().safeParse(value).success) throw new AppError(404, code, message);
}
function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
const externalScopePermissions: Record<ExternalScope, string> = {
  'accounts:read': 'brokerage.accounts.read',
  'orders:read': 'brokerage.orders.read',
  'positions:read': 'brokerage.accounts.read',
};
interface ExternalPosition {
  id: string;
  account_id: string;
  instrument: string;
  side: 'buy' | 'sell';
  status: 'open';
  volume: string;
  open_price: string;
  current_price?: string;
  unrealized_pnl?: string;
  stop_loss?: string;
  take_profit?: string;
  opened_at: string;
}

export class ExternalApiService {
  constructor(private db: Database) {}

  private audit(tx: Executor, scope: TenantContext, action: string, id: string): Promise<unknown> {
    return tx.query('INSERT INTO audit_events(id,organization_id,brand_id,environment_id,product_instance_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [randomUUID(), ...scopeValues(scope), scope.userId, action, 'api_key', id, scope.requestId, JSON.stringify({})]).then(async () => {
      await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(), scope.organizationId, action, JSON.stringify({ resource_type: 'api_key', resource_id: id, request_id: scope.requestId, scope: { organization_id: scope.organizationId, brand_id: scope.brandId, environment_id: scope.environmentId, product_instance_id: scope.productInstanceId } })]);
    });
  }

  async createCredential(scope: TenantContext, input: ExternalCredentialInput): Promise<{ credential: Row; secret: string }> {
    const parsedInput = externalCredentialInput.parse(input);
    if (scope.supportGrantId) throw new AppError(403, 'SUPPORT_DELEGATION_DENIED', 'Support access cannot create persistent credentials.');
    if (scope.productSlug !== 'brokerage-crm') throw new AppError(404, 'PRODUCT_UNAVAILABLE', 'External credentials are available in a Brokerage CRM workspace.');
    if (scope.core || !scope.permissions?.includes('api.write')) throw new AppError(403, 'PERMISSION_DENIED', 'The api.write permission is required.');
    if (parsedInput.scopes.some(value => !scope.permissions.includes(externalScopePermissions[value]))) throw new AppError(403, 'PERMISSION_DENIED', 'Credentials may grant only read permissions already held by the acting user.');
    if (parsedInput.expires_at && new Date(parsedInput.expires_at).getTime() <= Date.now()) throw new AppError(422, 'INVALID_EXPIRY', 'Choose a future credential expiry.');
    const secret = `azk_${randomBytes(32).toString('base64url')}`;
    const id = randomUUID();
    const row = await this.db.transaction({ organizationId: scope.organizationId, brandId: scope.brandId, environmentId: scope.environmentId, productInstanceId: scope.productInstanceId }, async tx => {
      const result = await tx.query<Row>(`INSERT INTO api_keys(id,organization_id,brand_id,environment_id,product_instance_id,name,prefix,secret_hash,scopes,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING ${credentialFields}`, [id, ...scopeValues(scope), parsedInput.name.trim(), secret.slice(0, 12), hashSecret(secret), JSON.stringify(parsedInput.scopes), parsedInput.expires_at ?? null, scope.userId]);
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
    await this.assertExternalRead(context, 'accounts:read');
    const parsed = externalAccountListSchema.parse(query);
    const statusValue = parsed.status;
    return this.db.transaction(context, async tx => {
      if (statusValue && !accountStates.includes(statusValue as typeof accountStates[number])) throw new AppError(400, 'VALIDATION_ERROR', 'The account status filter is invalid.');
      const values: unknown[] = [...scopeValues(context)];
      let where = scopeWhere('a');
      if (statusValue) { values.push(statusValue); where += ` AND a.status=$${values.length}`; }
      if (parsed.client_id) { values.push(parsed.client_id); where += ` AND a.client_id=$${values.length}`; }
      if (parsed.search) { values.push(`%${parsed.search}%`); where += ` AND (a.account_number ILIKE $${values.length} OR a.external_login ILIKE $${values.length} OR c.full_name ILIKE $${values.length})`; }
      const joins = 'FROM brokerage_accounts a JOIN brokerage_offerings o ON o.id=a.offering_id AND o.organization_id=a.organization_id AND o.brand_id=a.brand_id AND o.environment_id=a.environment_id AND o.product_instance_id=a.product_instance_id JOIN brokerage_clients c ON c.id=a.client_id AND c.organization_id=a.organization_id AND c.brand_id=a.brand_id AND c.environment_id=a.environment_id AND c.product_instance_id=a.product_instance_id';
      const total = Number((await tx.query<{ total: string }>(`SELECT count(*) AS total ${joins} WHERE ${where}`, values)).rows[0].total);
      values.push(parsed.limit, parsed.offset);
      const orderColumns = { account_number: 'a.account_number', account_type: 'a.account_type', currency: 'a.currency', leverage: 'a.leverage', status: 'a.status', created_at: 'a.created_at' } as Record<string, string>;
      const orderColumn = Object.prototype.hasOwnProperty.call(orderColumns, parsed.sort) ? orderColumns[parsed.sort] : 'a.created_at';
      const direction = parsed.direction === 'asc' ? 'ASC' : 'DESC';
      const rows = (await tx.query<Row>(`SELECT a.id,a.account_number,a.account_type,a.currency,a.leverage,a.status,a.sync_status,a.synchronized_at,a.created_at,a.updated_at ${joins} WHERE ${where} ORDER BY ${orderColumn} ${direction},a.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows;
      return { data: serializable(rows.map(row => this.accountProjection(row, context.productInstanceId))), pagination: { total, limit: parsed.limit, offset: parsed.offset } };
    });
  }
  async getAccount(context: TenantContext, id: string) {
    return this.readAccount(context, id, 'accounts:read');
  }

  private async readAccount(context: TenantContext, id: string, required: ExternalScope) {
    await this.assertExternalRead(context, required);
    requireUuid(id, 'ACCOUNT_NOT_FOUND', 'The account does not exist in this scope.');
    return this.db.transaction(context, async tx => {
      const joins = 'FROM brokerage_accounts a JOIN brokerage_offerings o ON o.id=a.offering_id AND o.organization_id=a.organization_id AND o.brand_id=a.brand_id AND o.environment_id=a.environment_id AND o.product_instance_id=a.product_instance_id JOIN brokerage_clients c ON c.id=a.client_id AND c.organization_id=a.organization_id AND c.brand_id=a.brand_id AND c.environment_id=a.environment_id AND c.product_instance_id=a.product_instance_id';
      const row = (await tx.query<Row>(`SELECT a.id,a.account_number,a.account_type,a.currency,a.leverage,a.status,a.sync_status,a.synchronized_at,a.created_at,a.updated_at ${joins} WHERE ${scopeWhere('a')} AND a.id=$5`, [...scopeValues(context), id])).rows[0];
      if (!row) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The account does not exist in this scope.');
      return this.accountProjection(row, context.productInstanceId);
    });
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

  private async assertAccount(context: TenantContext, accountId: string, required: ExternalScope): Promise<void> {
    await this.readAccount(context, accountId, required);
  }

  private async assertExternalRead(context: TenantContext, required: ExternalScope): Promise<void> {
    if (context.core || context.productSlug !== 'brokerage-crm' || !context.credentialId) throw new AppError(401, 'UNAUTHENTICATED', 'A valid external API credential is required.');
    const ids = [context.userId, context.organizationId, context.brandId, context.environmentId, context.productInstanceId, context.credentialId];
    if (ids.some(value => !z.uuid().safeParse(value).success)) throw new AppError(401, 'UNAUTHENTICATED', 'A valid external API credential is required.');
    // Preserve the canonical account service's current staff authorization for
    // legacy credentials as well as newly issued external credentials.
    const row = await this.db.transaction(context, async tx => (await tx.query<{ id: string }>(`SELECT k.id FROM api_keys k
      JOIN users u ON u.id=k.created_by AND u.status='active' AND u.core_role IS NULL
      JOIN organizations o ON o.id=k.organization_id AND o.status='active'
      JOIN brands b ON b.id=k.brand_id AND b.organization_id=k.organization_id AND b.status='active'
      JOIN environments e ON e.id=k.environment_id AND e.organization_id=k.organization_id AND e.brand_id=k.brand_id AND e.status='active'
      JOIN product_instances i ON i.id=k.product_instance_id AND i.organization_id=k.organization_id AND i.brand_id=k.brand_id AND i.environment_id=k.environment_id AND i.status='active'
      JOIN products p ON p.id=i.product_id AND p.slug='brokerage-crm' AND p.status='active'
      JOIN product_subscriptions s ON s.id=i.subscription_id AND s.organization_id=i.organization_id AND s.product_id=i.product_id AND s.status='active'
      WHERE k.id=$5 AND k.created_by=$6 AND k.organization_id=$1 AND k.brand_id=$2 AND k.environment_id=$3 AND k.product_instance_id=$4
        AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now()) AND k.scopes @> $7::jsonb
        AND (k.application_id IS NULL OR EXISTS (SELECT 1 FROM api_applications a
          WHERE a.id=k.application_id AND a.organization_id=k.organization_id AND a.brand_id=k.brand_id
            AND a.environment_id=k.environment_id AND a.product_instance_id=k.product_instance_id
            AND a.status='active' AND a.scopes @> k.scopes))
        AND EXISTS (SELECT 1 FROM staff_memberships m
          JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
          JOIN role_permissions rp ON rp.role_id=r.id AND rp.organization_id=m.organization_id
          WHERE m.user_id=k.created_by AND m.organization_id=k.organization_id AND m.status='active'
            AND (m.environment_id IS NULL OR m.environment_id=k.environment_id)
            AND (m.product_instance_id IS NULL OR m.product_instance_id=k.product_instance_id)
            AND rp.permission_code=$8)
      LIMIT 1`, [...scopeValues(context), context.credentialId, context.userId, JSON.stringify([required]), externalScopePermissions[required]])).rows[0]);
    if (!row) throw new AppError(401, 'UNAUTHENTICATED', 'A valid external API credential is required.');
  }

  private orderProjection(row: Record<string, unknown>): Row {
    return serializable({
      id: row.id,
      account_id: row.account_id,
      instrument: row.instrument,
      order_type: row.order_type,
      side: row.side,
      status: row.status,
      quantity: row.quantity,
      filled_quantity: row.filled_quantity,
      limit_price: row.limit_price,
      stop_price: row.stop_price,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }) as unknown as Row;
  }

  async listOrders(context: TenantContext, accountId: string, input: z.infer<typeof externalOrderListSchema>) {
    await this.assertAccount(context, accountId, 'orders:read');
    const page = await new BrokerageOrdersService(this.db).list(context, { account_id: accountId, status: input.status, limit: input.limit, offset: input.offset });
    return { ...page, data: page.data.map(row => this.orderProjection(row)) };
  }

  async getOrder(context: TenantContext, accountId: string, orderId: string) {
    requireUuid(accountId, 'ACCOUNT_NOT_FOUND', 'The account does not exist in this scope.');
    requireUuid(orderId, 'ORDER_NOT_FOUND', 'The order does not exist in this scope.');
    await this.assertAccount(context, accountId, 'orders:read');
    const row = await new BrokerageOrdersService(this.db).get(context, orderId);
    if (String(row.account_id) !== accountId) throw new AppError(404, 'ORDER_NOT_FOUND', 'The order does not exist in this account.');
    return this.orderProjection(row);
  }

  private async positionSnapshot(context: TenantContext, accountId: string): Promise<ExternalPosition[]> {
    requireUuid(accountId, 'ACCOUNT_NOT_FOUND', 'The account does not exist in this scope.');
    await this.assertAccount(context, accountId, 'positions:read');
    const row = await this.db.transaction(context, async tx => (await tx.query<{ trading_observations: unknown; external_account_id: string | null }>(`SELECT trading_observations,external_account_id FROM brokerage_accounts WHERE ${scopeWhere()} AND id=$5`, [...scopeValues(context), accountId])).rows[0]);
    const snapshot = objectValue(row?.trading_observations);
    const providerAccountId = stringValue(row?.external_account_id);
    if (!providerAccountId) return [];
    const values = Array.isArray(snapshot?.positions) ? snapshot.positions : [];
    return values.flatMap(value => {
      const item = objectValue(value);
      const id = stringValue(item?.provider_position_id);
      const itemProviderAccountId = stringValue(item?.provider_account_id);
      const instrument = stringValue(item?.symbol);
      const side: 'buy' | 'sell' | undefined = item?.side === 'buy' ? 'buy' : item?.side === 'sell' ? 'sell' : undefined;
      const volume = stringValue(item?.volume);
      const openPrice = stringValue(item?.open_price);
      const openedAt = stringValue(item?.opened_at);
      if (!id || itemProviderAccountId !== providerAccountId || !instrument || !side || !volume || !openPrice || !openedAt) return [];
      return [{ id, account_id: accountId, instrument, side, status: 'open' as const, volume, open_price: openPrice, current_price: stringValue(item?.current_price), unrealized_pnl: stringValue(item?.profit), stop_loss: stringValue(item?.stop_loss), take_profit: stringValue(item?.take_profit), opened_at: openedAt }];
    }).sort((a, b) => `${b.opened_at}:${b.id}`.localeCompare(`${a.opened_at}:${a.id}`));
  }

  async listPositions(context: TenantContext, accountId: string, input: z.infer<typeof externalPositionListSchema>) {
    const positions = await this.positionSnapshot(context, accountId);
    const filtered = input.status === 'closed' ? [] : positions;
    return { data: filtered.slice(input.offset, input.offset + input.limit), pagination: { total: filtered.length, limit: input.limit, offset: input.offset } };
  }

  async getPosition(context: TenantContext, accountId: string, positionId: string) {
    if (!positionId || positionId.length > 160 || !/^[A-Za-z0-9_.:-]+$/.test(positionId)) throw new AppError(404, 'POSITION_NOT_FOUND', 'The position does not exist in this account.');
    const position = (await this.positionSnapshot(context, accountId)).find(item => item.id === positionId);
    if (!position) throw new AppError(404, 'POSITION_NOT_FOUND', 'The position does not exist in this account.');
    return position;
  }
}
