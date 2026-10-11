import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Row, TenantContext } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { dbCode } from '../domain/utils.js';
import { recordEvent, scopeValues, scopeWhere } from './common.js';

const uuid = z.uuid();
export const tradingGroupCommissionUpsertSchema = z.object({
  open_commission_per_lot: z.unknown(),
  close_commission_per_lot: z.unknown(),
  commission_currency: z.unknown(),
  enabled: z.boolean(),
  expected_version: z.number().finite().int().min(0),
}).strict();

export interface TradingGroupCommissionConfiguration {
  id: string;
  trading_group_id: string;
  organization_id: string;
  brand_id: string;
  environment_id: string;
  product_instance_id: string;
  open_commission_per_lot: string;
  close_commission_per_lot: string;
  commission_currency: string;
  enabled: boolean;
  config_version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface TradingGroupCommissionInput {
  open_commission_per_lot: string;
  close_commission_per_lot: string;
  commission_currency: string;
  enabled: boolean;
  expected_version: number;
}

/** Exact nonnegative decimal with at most six fractional places and a 100000 maximum. */
export function normalizeCommissionAmount(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) {
    throw new AppError(422, 'COMMISSION_AMOUNT_INVALID', `${field} must be a nonnegative decimal string with at most six fractional places.`);
  }
  const [whole, fraction = ''] = value.split('.');
  const scale = fraction.length;
  const units = BigInt(`${whole}${fraction}`);
  const maximum = 100000n * 10n ** BigInt(scale);
  if (units > maximum) throw new AppError(422, 'COMMISSION_AMOUNT_INVALID', `${field} must not exceed 100000 per lot.`);
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
}

function normalizeCurrency(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(422, 'COMMISSION_CURRENCY_INVALID', 'commission_currency must be a three-letter ISO currency code.');
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new AppError(422, 'COMMISSION_CURRENCY_INVALID', 'commission_currency must be a three-letter ISO currency code.');
  return currency;
}

export function parseTradingGroupCommissionInput(raw: unknown): TradingGroupCommissionInput {
  const input = tradingGroupCommissionUpsertSchema.parse(raw);
  return {
    open_commission_per_lot: normalizeCommissionAmount(input.open_commission_per_lot, 'open_commission_per_lot'),
    close_commission_per_lot: normalizeCommissionAmount(input.close_commission_per_lot, 'close_commission_per_lot'),
    commission_currency: normalizeCurrency(input.commission_currency),
    enabled: input.enabled,
    expected_version: input.expected_version,
  };
}

const fields = 'id,trading_group_id,organization_id,brand_id,environment_id,product_instance_id,open_commission_per_lot::text AS open_commission_per_lot,close_commission_per_lot::text AS close_commission_per_lot,commission_currency,enabled,config_version,created_at,updated_at,created_by,updated_by';

function asConfiguration(row: Row | undefined): TradingGroupCommissionConfiguration {
  if (!row) throw new AppError(404, 'TRADING_GROUP_NOT_FOUND', 'The trading group does not exist in this workspace.');
  return {
    id: String(row.id), trading_group_id: String(row.trading_group_id), organization_id: String(row.organization_id), brand_id: String(row.brand_id),
    environment_id: String(row.environment_id), product_instance_id: String(row.product_instance_id), open_commission_per_lot: String(row.open_commission_per_lot),
    close_commission_per_lot: String(row.close_commission_per_lot), commission_currency: String(row.commission_currency), enabled: Boolean(row.enabled),
    config_version: Number(row.config_version), created_at: String(row.created_at), updated_at: String(row.updated_at), created_by: String(row.created_by), updated_by: String(row.updated_by),
  };
}

function conflict(): never {
  throw new AppError(409, 'TRADING_GROUP_COMMISSION_VERSION_CONFLICT', 'The commission configuration was changed by another administrator. Reload it and retry with the current expected_version.');
}

function eventView(configuration: TradingGroupCommissionConfiguration): Record<string, unknown> {
  return {
    id: configuration.id, trading_group_id: configuration.trading_group_id, open_commission_per_lot: configuration.open_commission_per_lot,
    close_commission_per_lot: configuration.close_commission_per_lot, commission_currency: configuration.commission_currency,
    enabled: configuration.enabled, config_version: configuration.config_version, created_at: configuration.created_at,
    updated_at: configuration.updated_at, created_by: configuration.created_by, updated_by: configuration.updated_by,
  };
}

async function parentExists(tx: Executor, scope: TenantContext, groupId: string): Promise<void> {
  const row = (await tx.query<{ id: string }>(`SELECT id FROM brokerage_trading_groups WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`, [...scopeValues(scope), groupId])).rows[0];
  if (!row) throw new AppError(404, 'TRADING_GROUP_NOT_FOUND', 'The trading group does not exist in this workspace.');
}

export class BrokerageTradingGroupCommissionService {
  constructor(private readonly db: Database) {}

  async getGroupCommissionConfiguration(scope: TenantContext, groupId: string): Promise<TradingGroupCommissionConfiguration | null> {
    uuid.parse(groupId);
    return this.db.transaction(scope, async tx => {
      await parentExists(tx, scope, groupId);
      const row = (await tx.query<Row>(`SELECT ${fields} FROM brokerage_trading_group_commissions WHERE ${scopeWhere()} AND trading_group_id=$5`, [...scopeValues(scope), groupId])).rows[0];
      return row ? asConfiguration(row) : null;
    });
  }

  async upsertGroupCommissionConfiguration(scope: TenantContext, groupId: string, raw: unknown): Promise<TradingGroupCommissionConfiguration> {
    uuid.parse(groupId);
    const input = parseTradingGroupCommissionInput(raw);
    try {
      return await this.db.transaction(scope, async tx => {
        await parentExists(tx, scope, groupId);
        const existingRow = (await tx.query<Row>(`SELECT ${fields} FROM brokerage_trading_group_commissions WHERE ${scopeWhere()} AND trading_group_id=$5 FOR UPDATE`, [...scopeValues(scope), groupId])).rows[0];
        if (!existingRow) {
          if (input.expected_version !== 0) conflict();
          const row = (await tx.query<Row>(`INSERT INTO brokerage_trading_group_commissions(id,organization_id,brand_id,environment_id,product_instance_id,trading_group_id,open_commission_per_lot,close_commission_per_lot,commission_currency,enabled,config_version,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,$9,$10,1,$11,$11) RETURNING ${fields}`, [randomUUID(), ...scopeValues(scope), groupId, input.open_commission_per_lot, input.close_commission_per_lot, input.commission_currency, input.enabled, scope.userId])).rows[0];
          const created = asConfiguration(row);
          await recordEvent(tx, scope, 'brokerage.trading_group.commission.created', 'brokerage_trading_group_commission', created.id, { trading_group_id: groupId, config_version: { before: null, after: created.config_version }, before: null, after: eventView(created) });
          return created;
        }

        const before = asConfiguration(existingRow);
        if (input.expected_version !== before.config_version) conflict();
        const unchanged = before.open_commission_per_lot === input.open_commission_per_lot
          && before.close_commission_per_lot === input.close_commission_per_lot
          && before.commission_currency === input.commission_currency
          && before.enabled === input.enabled;
        if (unchanged) return before;
        const row = (await tx.query<Row>(`UPDATE brokerage_trading_group_commissions SET open_commission_per_lot=$6::numeric,close_commission_per_lot=$7::numeric,commission_currency=$8,enabled=$9,config_version=config_version+1,updated_at=now(),updated_by=$10 WHERE ${scopeWhere()} AND trading_group_id=$5 AND config_version=$11 RETURNING ${fields}`, [...scopeValues(scope), groupId, input.open_commission_per_lot, input.close_commission_per_lot, input.commission_currency, input.enabled, scope.userId, input.expected_version])).rows[0];
        if (!row) conflict();
        const updated = asConfiguration(row);
        await recordEvent(tx, scope, 'brokerage.trading_group.commission.updated', 'brokerage_trading_group_commission', updated.id, { trading_group_id: groupId, config_version: { before: before.config_version, after: updated.config_version }, before: eventView(before), after: eventView(updated) });
        return updated;
      });
    } catch (error) {
      if (dbCode(error) === '23505') throw new AppError(409, 'TRADING_GROUP_COMMISSION_EXISTS', 'A commission configuration already exists for this trading group.');
      throw error;
    }
  }

  get(scope: TenantContext, groupId: string): Promise<TradingGroupCommissionConfiguration | null> {
    return this.getGroupCommissionConfiguration(scope, groupId);
  }

  upsert(scope: TenantContext, groupId: string, raw: unknown): Promise<TradingGroupCommissionConfiguration> {
    return this.upsertGroupCommissionConfiguration(scope, groupId, raw);
  }
}
