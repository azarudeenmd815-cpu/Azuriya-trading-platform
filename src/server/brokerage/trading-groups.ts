import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Row, TenantContext } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { dbCode } from '../domain/utils.js';
import { authorizeBrokerageStaff, recordEvent, scopeValues, scopeWhere } from './common.js';

const uuid = z.uuid();
const MAX_CONFIG_VERSION = 2147483647;
const groupCode = z.string().trim().min(3).max(32).transform(value => value.toUpperCase()).refine(value => /^[A-Z0-9_]+$/.test(value), 'Group code must use uppercase ASCII letters, numbers, and underscores.');
const displayName = z.string().trim().min(1).max(100);
const description = z.string().trim().max(500).default('');
const leverage = z.number().finite().int().min(1).max(1000);
const version = z.number().finite().int().min(1).max(MAX_CONFIG_VERSION);

export const tradingGroupCreateSchema = z.object({ group_code: groupCode, display_name: displayName, description, max_leverage: leverage }).strict();
export const tradingGroupUpdateSchema = z.object({
  display_name: displayName.optional(), description: z.string().trim().max(500).optional(), max_leverage: leverage.optional(),
  config_version: version.optional(), expected_config_version: version.optional(),
}).strict()
  .refine(value => value.config_version !== undefined || value.expected_config_version !== undefined, { message: 'config_version is required for updates.', path: ['config_version'] })
  .refine(value => value.config_version === undefined || value.expected_config_version === undefined, { message: 'Submit only one configuration version.', path: ['config_version'] })
  .refine(value => value.display_name !== undefined || value.description !== undefined || value.max_leverage !== undefined, { message: 'Provide at least one mutable field.' });
export const tradingGroupListSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(1000000).default(0), status: z.enum(['active', 'inactive']).optional() }).strict();
export const tradingGroupLifecycleSchema = z.object({ config_version: version.optional(), expected_config_version: version.optional() }).strict()
  .refine(value => value.config_version === undefined || value.expected_config_version === undefined, { message: 'Submit only one configuration version.', path: ['config_version'] });

export interface TradingGroup { id: string; organization_id: string; brand_id: string; environment_id: string; product_instance_id: string; group_code: string; display_name: string; description: string; max_leverage: number; status: 'active' | 'inactive'; config_version: number; created_at: string; updated_at: string; created_by: string; updated_by: string; }
type GroupInput = z.input<typeof tradingGroupCreateSchema>;
type GroupUpdate = z.input<typeof tradingGroupUpdateSchema>;
type LifecycleInput = z.input<typeof tradingGroupLifecycleSchema>;
const fields = 'id,organization_id,brand_id,environment_id,product_instance_id,group_code,display_name,description,max_leverage,status,config_version,created_at,updated_at,created_by,updated_by';

function asGroup(row: Row | undefined): TradingGroup {
  if (!row) throw new AppError(404, 'TRADING_GROUP_NOT_FOUND', 'The trading group does not exist in this workspace.');
  return { id: String(row.id), organization_id: String(row.organization_id), brand_id: String(row.brand_id), environment_id: String(row.environment_id), product_instance_id: String(row.product_instance_id), group_code: String(row.group_code), display_name: String(row.display_name), description: String(row.description ?? ''), max_leverage: Number(row.max_leverage), status: row.status === 'inactive' ? 'inactive' : 'active', config_version: Number(row.config_version), created_at: String(row.created_at), updated_at: String(row.updated_at), created_by: String(row.created_by), updated_by: String(row.updated_by) };
}
function eventView(group: TradingGroup): Record<string, unknown> { return { id: group.id, group_code: group.group_code, display_name: group.display_name, description: group.description, max_leverage: group.max_leverage, status: group.status, config_version: group.config_version, created_at: group.created_at, updated_at: group.updated_at, created_by: group.created_by, updated_by: group.updated_by }; }
function conflict(error: unknown, code: string, message: string): never { if (dbCode(error) === '23505') throw new AppError(409, code, message); throw error; }
function stale(): never { throw new AppError(409, 'TRADING_GROUP_VERSION_CONFLICT', 'The trading group was changed by another administrator. Reload it and retry with the current config_version.'); }
function versionExhausted(): never { throw new AppError(409, 'TRADING_GROUP_VERSION_EXHAUSTED', 'The trading group has reached its version limit and cannot be changed.'); }
function expectedVersion(input: { config_version?: number; expected_config_version?: number }): number | undefined { return input.config_version ?? input.expected_config_version; }

export class BrokerageTradingGroupsService {
  constructor(private readonly db: Database) {}

  async create(scope: TenantContext, raw: GroupInput): Promise<TradingGroup> {
    const input = tradingGroupCreateSchema.parse(raw); const id = randomUUID();
    try {
      return await this.db.transaction(scope, async tx => {
        await authorizeBrokerageStaff(tx, scope, 'brokerage.settings.write', true);
        const row = (await tx.query<Row>('INSERT INTO brokerage_trading_groups (id,organization_id,brand_id,environment_id,product_instance_id,group_code,display_name,description,max_leverage,status,config_version,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,\'active\',1,$10,$10) RETURNING ' + fields, [id, ...scopeValues(scope), input.group_code, input.display_name, input.description, input.max_leverage, scope.userId])).rows[0];
        const group = asGroup(row);
        await recordEvent(tx, scope, 'brokerage.trading_group.created', 'brokerage_trading_group', group.id, { config_version: 1, after: eventView(group) });
        return group;
      });
    } catch (error) { return conflict(error, 'TRADING_GROUP_EXISTS', 'A trading group with this code already exists in this brokerage scope.'); }
  }

  async list(scope: TenantContext, raw: unknown = {}): Promise<{ data: TradingGroup[]; pagination: { total: number; limit: number; offset: number } }> {
    const query = tradingGroupListSchema.parse(raw);
    return this.db.transaction(scope, async tx => {
      await authorizeBrokerageStaff(tx, scope, 'settings.read');
      const values: unknown[] = [...scopeValues(scope)]; const statusClause = query.status ? ' AND status=$5' : ''; if (query.status) values.push(query.status);
      const count = Number((await tx.query<{ count: string }>('SELECT count(*)::text AS count FROM brokerage_trading_groups WHERE ' + scopeWhere() + statusClause, values)).rows[0]?.count ?? 0);
      const rows = (await tx.query<Row>('SELECT ' + fields + ' FROM brokerage_trading_groups WHERE ' + scopeWhere() + statusClause + ' ORDER BY group_code ASC,id ASC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2), [...values, query.limit, query.offset])).rows;
      return { data: rows.map(asGroup), pagination: { total: count, limit: query.limit, offset: query.offset } };
    });
  }

  async get(scope: TenantContext, id: string): Promise<TradingGroup> {
    uuid.parse(id); return this.db.transaction(scope, async tx => { await authorizeBrokerageStaff(tx, scope, 'settings.read'); return asGroup((await tx.query<Row>('SELECT ' + fields + ' FROM brokerage_trading_groups WHERE ' + scopeWhere() + ' AND id=$5', [...scopeValues(scope), id])).rows[0]); });
  }

  private async current(tx: Executor, scope: TenantContext, id: string, lock = false): Promise<TradingGroup> {
    return asGroup((await tx.query<Row>('SELECT ' + fields + ' FROM brokerage_trading_groups WHERE ' + scopeWhere() + ' AND id=$5' + (lock ? ' FOR UPDATE' : ''), [...scopeValues(scope), id])).rows[0]);
  }

  async update(scope: TenantContext, id: string, raw: GroupUpdate): Promise<TradingGroup> {
    uuid.parse(id); const input = tradingGroupUpdateSchema.parse(raw); const expected = expectedVersion(input)!;
    try {
      return await this.db.transaction(scope, async tx => {
        await authorizeBrokerageStaff(tx, scope, 'brokerage.settings.write', true);
        const before = await this.current(tx, scope, id, true);
        if (before.config_version !== expected) stale();
        const next = { display_name: input.display_name ?? before.display_name, description: input.description ?? before.description, max_leverage: input.max_leverage ?? before.max_leverage };
        if (next.display_name === before.display_name && next.description === before.description && next.max_leverage === before.max_leverage) return before;
        if (before.config_version >= MAX_CONFIG_VERSION) versionExhausted();
        const row = (await tx.query<Row>('UPDATE brokerage_trading_groups SET display_name=$6,description=$7,max_leverage=$8,config_version=config_version+1,updated_at=now(),updated_by=$9 WHERE ' + scopeWhere() + ' AND id=$5 AND config_version=$10 RETURNING ' + fields, [...scopeValues(scope), id, next.display_name, next.description, next.max_leverage, scope.userId, expected])).rows[0];
        if (!row) stale(); const after = asGroup(row);
        await recordEvent(tx, scope, 'brokerage.trading_group.updated', 'brokerage_trading_group', id, { config_version: { before: before.config_version, after: after.config_version }, before: eventView(before), after: eventView(after) });
        return after;
      });
    } catch (error) { return conflict(error, 'TRADING_GROUP_EXISTS', 'A trading group with this code already exists in this brokerage scope.'); }
  }

  private async changeStatus(scope: TenantContext, id: string, status: 'active' | 'inactive', raw: LifecycleInput = {}): Promise<TradingGroup> {
    uuid.parse(id); const input = tradingGroupLifecycleSchema.parse(raw); const supplied = expectedVersion(input);
    return this.db.transaction(scope, async tx => {
      await authorizeBrokerageStaff(tx, scope, 'brokerage.settings.write', true);
      const before = await this.current(tx, scope, id, true); if (supplied !== undefined && before.config_version !== supplied) stale(); if (before.status === status) return before;
      const expected = supplied ?? before.config_version;
      if (before.config_version >= MAX_CONFIG_VERSION) versionExhausted();
      const row = (await tx.query<Row>('UPDATE brokerage_trading_groups SET status=$6,config_version=config_version+1,updated_at=now(),updated_by=$7 WHERE ' + scopeWhere() + ' AND id=$5 AND config_version=$8 RETURNING ' + fields, [...scopeValues(scope), id, status, scope.userId, expected])).rows[0];
      if (!row) stale(); const after = asGroup(row); const action = status === 'active' ? 'brokerage.trading_group.activated' : 'brokerage.trading_group.deactivated';
      await recordEvent(tx, scope, action, 'brokerage_trading_group', id, { config_version: { before: before.config_version, after: after.config_version }, before: eventView(before), after: eventView(after) });
      return after;
    });
  }
  async activate(scope: TenantContext, id: string, raw: LifecycleInput = {}): Promise<TradingGroup> { return this.changeStatus(scope, id, 'active', raw); }
  async deactivate(scope: TenantContext, id: string, raw: LifecycleInput = {}): Promise<TradingGroup> { return this.changeStatus(scope, id, 'inactive', raw); }

  createTradingGroup(scope: TenantContext, raw: GroupInput): Promise<TradingGroup> { return this.create(scope, raw); }
  listTradingGroups(scope: TenantContext, raw: unknown = {}): Promise<{ data: TradingGroup[]; pagination: { total: number; limit: number; offset: number } }> { return this.list(scope, raw); }
  getTradingGroup(scope: TenantContext, id: string): Promise<TradingGroup> { return this.get(scope, id); }
  updateTradingGroup(scope: TenantContext, id: string, raw: GroupUpdate): Promise<TradingGroup> { return this.update(scope, id, raw); }
  activateTradingGroup(scope: TenantContext, id: string, raw: LifecycleInput = {}): Promise<TradingGroup> { return this.activate(scope, id, raw); }
  deactivateTradingGroup(scope: TenantContext, id: string, raw: LifecycleInput = {}): Promise<TradingGroup> { return this.deactivate(scope, id, raw); }
}
