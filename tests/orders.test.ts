import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { BrokerageOrdersService } from '../src/server/brokerage/orders.js';
import { scopeValues } from '../src/server/brokerage/common.js';
import { boundDatabase } from '../src/server/api/idempotency.js';
import type { Row, TenantContext } from '../src/shared/types.js';

describe('native order cancellation lifecycle', () => {
  let db: Database;
  let scope: TenantContext;
  let foreignScope: TenantContext;
  let accountId: string;
  let otherAccountId: string;
  let ownerId: string;
  let otherUserId: string;
  let service: BrokerageOrdersService;

  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    ownerId = randomUUID(); otherUserId = randomUUID();
    const core = { userId: randomUUID(), requestId: randomUUID(), core: true as const };
    await db.transaction({ core: true }, async tx => {
      await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [core.userId, 'orders-core.test', 'unused', 'Orders core']);
      await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [ownerId, 'orders-owner.test', 'unused', 'Orders owner']);
      await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [otherUserId, 'orders-other.test', 'unused', 'Orders other']);
    });
    const foundation = new FoundationService(db);
    const first = await foundation.createOrganization(core, { name: 'Orders ABC', slug: 'orders-abc', business_type: 'brokerage', brand_name: 'Orders ABC', environment_name: 'production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'foundation' });
    const second = await foundation.createOrganization(core, { name: 'Orders XYZ', slug: 'orders-xyz', business_type: 'brokerage', brand_name: 'Orders XYZ', environment_name: 'production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'foundation' });
    const instances = await foundation.coreList('product-instances', { limit: 100 }, core);
    const makeScope = (tenant: Row, userId: string): TenantContext => { const instance = instances.data.find(item => item.organization_id === tenant.id)!; return { userId, requestId: randomUUID(), core: false, organizationId: String(tenant.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: ['brokerage.orders.read', 'brokerage.orders.write'] }; };
    scope = makeScope(first, ownerId); foreignScope = makeScope(second, otherUserId);
    const providerId = (await db.transaction({ core: true }, tx => tx.query<{ id: string }>("SELECT id FROM integration_providers WHERE slug='metatrader-5'"))).rows[0].id;
    const clientId = randomUUID(); const foreignClientId = randomUUID(); const offeringId = randomUUID(); accountId = randomUUID(); otherAccountId = randomUUID();
    await db.transaction({ core: true }, async tx => {
      await tx.query('INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,residence_country) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [clientId, ...scopeValues(scope), ownerId, 'CLI-ORDERS', 'Orders Owner', 'orders-client.test', 'onboarding', 'IN', 'IN']);
      await tx.query('INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,residence_country) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [foreignClientId, ...scopeValues(foreignScope), otherUserId, 'CLI-FOREIGN', 'Foreign Owner', 'foreign-client.test', 'onboarding', 'IN', 'IN']);
      for (const [id, tenant] of [[accountId, scope], [otherAccountId, foreignScope]] as const) {
        const client = tenant === scope ? clientId : foreignClientId;
        const offering = tenant === scope ? offeringId : randomUUID();
        await tx.query('INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [offering, ...scopeValues(tenant), 'Orders offering', providerId, 'live', '["USD"]', '[100]', tenant === scope ? ownerId : otherUserId]);
        await tx.query('INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,status,external_account_id,server,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,\'active\',$13,\'Orders\',$14)', [id, ...scopeValues(tenant), client, offering, providerId, `ACC-${id.slice(0, 8)}`, 'live', 'USD', 100, `EXT-${id.slice(0, 8)}`, tenant === scope ? ownerId : otherUserId]);
      }
    });
    service = new BrokerageOrdersService(db);
  });
  afterAll(async () => db?.close());

  it.each([
    ['limit', 'buy', { limit_price: '1.10000000' }], ['limit', 'sell', { limit_price: '1.10000000' }],
    ['stop', 'buy', { stop_price: '1.20000000' }], ['stop', 'sell', { stop_price: '1.20000000' }],
  ] as const)('cancels pending %s %s orders exactly once', async (order_type, side, prices) => {
    const created = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type, side, quantity: '1.00000000', ...prices });
    const cancelled = await service.cancel(scope, String(created.id), 'user requested');
    expect(cancelled).toMatchObject({ id: created.id, status: 'cancelled', order_type, side, quantity: '1.00000000', filled_quantity: '0.00000000' });
    const replay = await service.cancel(scope, String(created.id), 'different reason');
    expect(replay).toMatchObject({ id: created.id, status: 'cancelled', cancellation_reason: 'user requested' });
    expect((await service.history(scope, String(created.id))).filter((event: { event_type: string }) => event.event_type === 'cancelled')).toHaveLength(1);
    expect(String((await db.transaction(scope, tx => tx.query<{ count: string | number }>("SELECT count(*) FROM audit_events WHERE resource_id=$1 AND action='brokerage.order.cancelled'", [created.id]))).rows[0].count)).toBe('1');
  });

  it('rejects market, filled, partially filled, rejected, and expired orders', async () => {
    const market = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'market', side: 'buy', quantity: '1' });
    await expect(service.cancel(scope, String(market.id))).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
    const filled = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'limit', side: 'buy', quantity: '1', limit_price: '1' });
    await service.recordFill(scope, String(filled.id), { quantity: '1', price: '1' });
    await expect(service.cancel(scope, String(filled.id))).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
    const partial = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'stop', side: 'sell', quantity: '2', stop_price: '1' });
    await service.recordFill(scope, String(partial.id), { quantity: '1', price: '1' });
    await expect(service.cancel(scope, String(partial.id))).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
    for (const status of ['rejected', 'expired'] as const) {
      const order = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'limit', side: 'buy', quantity: '1', limit_price: '1' });
      await db.transaction(scope, tx => tx.query('UPDATE brokerage_orders SET status=$1 WHERE id=$2', [status, order.id]));
      await expect(service.cancel(scope, String(order.id))).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
    }
  });

  it('retains every partial-fill history event', async () => {
    const order = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'limit', side: 'buy', quantity: '3', limit_price: '1' });
    await service.recordFill(scope, String(order.id), { quantity: '1', price: '1' });
    await service.recordFill(scope, String(order.id), { quantity: '1', price: '1' });
    expect((await service.history(scope, String(order.id))).filter((event: { event_type: string }) => event.event_type === 'partially_filled')).toHaveLength(2);
    expect(await service.fills(scope, String(order.id))).toHaveLength(2);
  });

  it.each([
    ['filled', '1'],
    ['partially_filled', '2'],
  ])('rejects %s at quantity %s of 2 without changing the order or history', async (status, filledQuantity) => {
    const order = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'limit', side: 'buy', quantity: '2', limit_price: '1' });
    const history = await service.history(scope, order.id);
    await expect(db.transaction(scope, tx => tx.query('UPDATE brokerage_orders SET status=$1,filled_quantity=$2 WHERE id=$3', [status, filledQuantity, order.id]))).rejects.toMatchObject({ code: '23514' });
    expect(await service.get(scope, order.id)).toEqual(order);
    expect(await service.history(scope, order.id)).toEqual(history);
    expect(await service.fills(scope, order.id)).toEqual([]);
  });

  it('rejects decreasing partial execution progress without rewriting fills', async () => {
    const progressing = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'stop', side: 'buy', quantity: '3', stop_price: '1' });
    const partial = await service.recordFill(scope, progressing.id, { quantity: '2', price: '1' });
    const history = await service.history(scope, progressing.id);
    const fills = await service.fills(scope, progressing.id);
    await expect(db.transaction(scope, tx => tx.query('UPDATE brokerage_orders SET filled_quantity=$1 WHERE id=$2', ['1', progressing.id]))).rejects.toMatchObject({ code: '23514' });
    expect(await service.get(scope, progressing.id)).toEqual(partial);
    expect(await service.history(scope, progressing.id)).toEqual(history);
    expect(await service.fills(scope, progressing.id)).toEqual(fills);
  });

  it.each([
    ['0.00000003', '0.00000001', '0.00000002'],
    ['99999999999999999999.99999999', '99999999999999999999.99999998', '0.00000001'],
  ])('retains exact partial and full progress for quantity %s', async (quantity, firstFill, remainder) => {
    const order = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'market', side: 'sell', quantity });
    expect(await service.recordFill(scope, order.id, { quantity: firstFill, price: '1' })).toMatchObject({ status: 'partially_filled', filled_quantity: firstFill });
    const complete = await service.recordFill(scope, order.id, { quantity: remainder, price: '1' });
    expect(complete).toMatchObject({ status: 'filled', filled_quantity: quantity, quantity });
    expect((await service.history(scope, order.id)).map(event => event.event_type).sort()).toEqual(['created', 'filled', 'partially_filled']);
    expect(await service.fills(scope, order.id)).toHaveLength(2);
    const total = await db.transaction(scope, tx => tx.query<{ total: string }>('SELECT sum(quantity)::text AS total FROM brokerage_order_fills WHERE order_id=$1', [order.id]));
    expect(total.rows[0].total).toBe(quantity);
    await expect(db.transaction(scope, tx => tx.query('UPDATE brokerage_orders SET filled_quantity=$1 WHERE id=$2', [firstFill, order.id]))).rejects.toMatchObject({ code: '23514' });
    expect(await service.get(scope, order.id)).toEqual(complete);
  });

  it('rolls back a fill and its history when a later aggregate write fails in the transaction', async () => {
    const order = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'limit', side: 'buy', quantity: '3', limit_price: '1' });
    const history = await service.history(scope, order.id);
    await expect(db.transaction(scope, async tx => {
      const bound = new BrokerageOrdersService(boundDatabase(tx, scope));
      await bound.recordFill(scope, order.id, { quantity: '2', price: '1' });
      await tx.query('UPDATE brokerage_orders SET filled_quantity=1 WHERE id=$1', [order.id]);
    })).rejects.toMatchObject({ code: '23514' });
    expect(await service.get(scope, order.id)).toEqual(order);
    expect(await service.history(scope, order.id)).toEqual(history);
    expect(await service.fills(scope, order.id)).toEqual([]);
  });

  it('locks cancellation against fills and hides cross-tenant and cross-account orders', async () => {
    const order = await service.create(scope, { account_id: accountId, instrument: 'EURUSD', order_type: 'limit', side: 'buy', quantity: '1', limit_price: '1' });
    const [cancel, fill] = await Promise.allSettled([service.cancel(scope, String(order.id)), service.recordFill(scope, String(order.id), { quantity: '1', price: '1' })]);
    expect([cancel.status, fill.status].sort()).toEqual(['fulfilled', 'rejected']);
    const foreignOrder = await service.create(foreignScope, { account_id: otherAccountId, instrument: 'EURUSD', order_type: 'limit', side: 'buy', quantity: '1', limit_price: '1' });
    await expect(service.cancel(scope, String(foreignOrder.id))).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    await expect(service.cancel(scope, String(order.id), undefined, otherUserId)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});
