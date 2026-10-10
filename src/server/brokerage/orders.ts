import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { serializable } from '../domain/utils.js';
import type { TenantContext } from '../../shared/types.js';
import { recordEvent, scopeValues, scopeWhere } from './common.js';

const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/, 'Use a positive decimal with at most 8 fractional digits.');
export const orderTypes = ['limit', 'stop', 'market'] as const;
export const orderSides = ['buy', 'sell'] as const;
export const orderStatuses = ['pending', 'partially_filled', 'filled', 'rejected', 'expired', 'cancelled'] as const;
export const orderCreateSchema = z.object({ account_id: z.uuid(), instrument: z.string().trim().min(1).max(80), order_type: z.enum(orderTypes), side: z.enum(orderSides), quantity: decimal, limit_price: decimal.optional(), stop_price: decimal.optional() }).strict().superRefine((value, ctx) => {
  if (value.order_type === 'limit' && (!value.limit_price || value.stop_price)) ctx.addIssue({ code: 'custom', path: ['limit_price'], message: 'Limit orders require limit_price only.' });
  if (value.order_type === 'stop' && (!value.stop_price || value.limit_price)) ctx.addIssue({ code: 'custom', path: ['stop_price'], message: 'Stop orders require stop_price only.' });
  if (value.order_type === 'market' && (value.limit_price || value.stop_price)) ctx.addIssue({ code: 'custom', path: ['order_type'], message: 'Market orders cannot include trigger prices.' });
});
export const orderListSchema = z.object({ status: z.enum(orderStatuses).optional(), account_id: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }).strict();
export const cancelOrderSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() }).strict();
export const fillSchema = z.object({ quantity: decimal, price: decimal }).strict();

type OrderRow = Record<string, unknown> & { id: string; status: string; order_type: string; filled_quantity: string; quantity: string; account_id: string };
function row<T extends Record<string, unknown>>(value: T): T { return serializable(value); }
function transitionError(status: string): AppError {
  return new AppError(409, 'ORDER_NOT_CANCELLABLE', `An order in ${status} state cannot be cancelled.`);
}
function ensurePositive(value: string, label: string): void {
  if (Number(value) <= 0 || !Number.isFinite(Number(value))) throw new AppError(422, 'INVALID_INPUT', `${label} must be greater than zero.`);
}

export class BrokerageOrdersService {
  constructor(private readonly db: Database) {}

  async create(scope: TenantContext, input: z.infer<typeof orderCreateSchema>, ownerUserId?: string) {
    ensurePositive(input.quantity, 'quantity');
    return this.db.transaction(scope, async tx => {
      const account = (await tx.query<{ id: string; client_id: string }>(`SELECT id,client_id FROM brokerage_accounts WHERE ${scopeWhere()} AND id=$5`, [...scopeValues(scope), input.account_id])).rows[0];
      if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The trading account does not exist in this scope.');
      if (ownerUserId && !(await tx.query('SELECT 1 FROM brokerage_clients WHERE id=$1 AND user_id=$2', [account.client_id, ownerUserId])).rows[0]) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The trading account does not exist in this scope.');
      const id = randomUUID();
      const created = (await tx.query<OrderRow>(`INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,limit_price,stop_price,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [id, ...scopeValues(scope), input.account_id, input.instrument.trim(), input.order_type, input.side, input.quantity, input.limit_price ?? null, input.stop_price ?? null, scope.userId])).rows[0];
      await tx.query(`INSERT INTO brokerage_order_history(id,organization_id,brand_id,environment_id,product_instance_id,order_id,event_type,to_status,actor_id) VALUES($1,$2,$3,$4,$5,$6,'created','pending',$7)`, [randomUUID(), ...scopeValues(scope), id, scope.userId]);
      await recordEvent(tx, scope, 'brokerage.order.created', 'brokerage_order', id, { status: 'pending', account_id: input.account_id });
      return row(created);
    });
  }

  async get(scope: TenantContext, id: string, ownerUserId?: string) {
    return this.db.transaction(scope, async tx => row(await this.load(tx, scope, id, ownerUserId)));
  }

  async list(scope: TenantContext, input: z.infer<typeof orderListSchema>, ownerUserId?: string) {
    return this.db.transaction(scope, async tx => {
      const values: unknown[] = [...scopeValues(scope)];
      const filters = [scopeWhere('o')];
      if (input.status) { values.push(input.status); filters.push(`o.status=$${values.length}`); }
      if (input.account_id) { values.push(input.account_id); filters.push(`o.account_id=$${values.length}`); }
      if (ownerUserId) { values.push(ownerUserId); filters.push(`EXISTS (SELECT 1 FROM brokerage_accounts a JOIN brokerage_clients c ON c.id=a.client_id AND a.organization_id=c.organization_id AND a.brand_id=c.brand_id AND a.environment_id=c.environment_id AND a.product_instance_id=c.product_instance_id WHERE a.id=o.account_id AND c.user_id=$${values.length})`); }
      const where = filters.join(' AND ');
      const total = Number((await tx.query<{ count: string }>(`SELECT count(*) FROM brokerage_orders o WHERE ${where}`, values)).rows[0].count);
      values.push(input.limit, input.offset);
      const data = (await tx.query<OrderRow>(`SELECT o.* FROM brokerage_orders o WHERE ${where} ORDER BY o.created_at DESC,o.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows;
      return { data: data.map(row), pagination: { total, limit: input.limit, offset: input.offset } };
    });
  }

  async history(scope: TenantContext, id: string, ownerUserId?: string) {
    return this.db.transaction(scope, async tx => { await this.load(tx, scope, id, ownerUserId); return (await tx.query<{ id: string; event_type: string; from_status: string | null; to_status: string; actor_id: string | null; reason: string | null; created_at: string }>(`SELECT id,event_type,from_status,to_status,actor_id,reason,created_at FROM brokerage_order_history WHERE ${scopeWhere()} AND order_id=$5 ORDER BY created_at,id`, [...scopeValues(scope), id])).rows; });
  }

  async fills(scope: TenantContext, id: string, ownerUserId?: string) {
    return this.db.transaction(scope, async tx => { await this.load(tx, scope, id, ownerUserId); return (await tx.query(`SELECT id,quantity::text,price::text,executed_at,created_at FROM brokerage_order_fills WHERE ${scopeWhere()} AND order_id=$5 ORDER BY executed_at,id`, [...scopeValues(scope), id])).rows; });
  }

  async cancel(scope: TenantContext, id: string, reason?: string, ownerUserId?: string) {
    return this.db.transaction(scope, async tx => {
      const order = await this.load(tx, scope, id, ownerUserId, true);
      if (order.status === 'cancelled') return row(order);
      if (order.status !== 'pending' || order.order_type === 'market' || Number(order.filled_quantity) !== 0 || !['limit', 'stop'].includes(order.order_type)) throw transitionError(order.status);
      const updated = (await tx.query<OrderRow>(`UPDATE brokerage_orders SET status='cancelled',cancelled_by=$6,cancellation_reason=$7,cancelled_at=now(),updated_at=now(),version=version+1 WHERE ${scopeWhere()} AND id=$5 AND status='pending' AND filled_quantity=0 RETURNING *`, [...scopeValues(scope), id, scope.userId, reason ?? null])).rows[0];
      if (!updated) throw new AppError(409, 'ORDER_STATE_CHANGED', 'The order changed before cancellation committed.');
      await tx.query(`INSERT INTO brokerage_order_history(id,organization_id,brand_id,environment_id,product_instance_id,order_id,event_type,from_status,to_status,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,'cancelled','pending','cancelled',$7,$8) ON CONFLICT DO NOTHING`, [randomUUID(), ...scopeValues(scope), id, scope.userId, reason ?? null]);
      await recordEvent(tx, scope, 'brokerage.order.cancelled', 'brokerage_order', id, { status: 'cancelled', reason: reason ?? null, account_id: order.account_id });
      return row(updated);
    });
  }

  /** Canonical execution-side primitive: lock the order before appending a fill. */
  async recordFill(scope: TenantContext, id: string, input: z.infer<typeof fillSchema>) {
    ensurePositive(input.quantity, 'quantity'); ensurePositive(input.price, 'price');
    return this.db.transaction(scope, async tx => {
      const order = await this.load(tx, scope, id, undefined, true);
      if (['cancelled', 'rejected', 'expired', 'filled'].includes(order.status)) throw transitionError(order.status);
      const remaining = Number(order.quantity) - Number(order.filled_quantity); if (Number(input.quantity) > remaining) throw new AppError(409, 'FILL_EXCEEDS_ORDER', 'The fill exceeds the remaining order quantity.');
      await tx.query(`INSERT INTO brokerage_order_fills(id,organization_id,brand_id,environment_id,product_instance_id,order_id,account_id,quantity,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), ...scopeValues(scope), id, order.account_id, input.quantity, input.price]);
      const next = (await tx.query<OrderRow>(`UPDATE brokerage_orders SET filled_quantity=filled_quantity+$6,status=CASE WHEN filled_quantity+$6>=quantity THEN 'filled' ELSE 'partially_filled' END,updated_at=now(),version=version+1 WHERE ${scopeWhere()} AND id=$5 RETURNING *`, [...scopeValues(scope), id, input.quantity])).rows[0];
      const event = next.status === 'filled' ? 'filled' : 'partially_filled';
      await tx.query(`INSERT INTO brokerage_order_history(id,organization_id,brand_id,environment_id,product_instance_id,order_id,event_type,from_status,to_status,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`, [randomUUID(), ...scopeValues(scope), id, event, order.status, next.status, scope.userId]);
      return row(next);
    });
  }

  private async load(tx: Executor, scope: TenantContext, id: string, ownerUserId?: string, lock = false): Promise<OrderRow> {
    const suffix = lock ? ' FOR UPDATE' : '';
    const order = (await tx.query<OrderRow>(`SELECT o.* FROM brokerage_orders o WHERE ${scopeWhere('o')} AND o.id=$5${ownerUserId ? ' AND EXISTS (SELECT 1 FROM brokerage_accounts a JOIN brokerage_clients c ON c.id=a.client_id AND a.organization_id=c.organization_id AND a.brand_id=c.brand_id AND a.environment_id=c.environment_id AND a.product_instance_id=c.product_instance_id WHERE a.id=o.account_id AND c.user_id=$6)' : ''}${suffix}`, [...scopeValues(scope), id, ...(ownerUserId ? [ownerUserId] : [])])).rows[0];
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'The order does not exist in this scope.');
    return order;
  }
}
