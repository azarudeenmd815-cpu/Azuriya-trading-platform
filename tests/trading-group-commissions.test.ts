import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Actor, Row, TenantContext } from '../src/shared/types.js';
import { permissions } from '../src/shared/types.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { BrokerageTradingGroupsService } from '../src/server/brokerage/trading-groups.js';
import { BrokerageTradingGroupCommissionService, normalizeCommissionAmount } from '../src/server/brokerage/trading-group-commissions.js';

describe('Brokerage trading-group commission configuration', () => {
  let db: Database;
  let scope: TenantContext;
  let groupId: string;
  let service: BrokerageTradingGroupCommissionService;
  const actorId = randomUUID();
  const core: Actor = { userId: actorId, requestId: randomUUID(), core: true };

  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5)', [actorId, '***@***', 'unused', 'Commission Test', 'super_admin']));
    const foundation = new FoundationService(db);
    const organization = await foundation.createOrganization(core, { name: 'Commission Test', slug: 'commission-test', business_type: 'brokerage', brand_name: 'Commission Test', environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'test' });
    const instances = await foundation.coreList('product-instances', { limit: 100 }, core);
    const instance = instances.data.find(row => String(row.organization_id) === String(organization.id)) as Row;
    scope = { userId: actorId, requestId: randomUUID(), core: false, organizationId: String(organization.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
    groupId = (await new BrokerageTradingGroupsService(db).create(scope, { group_code: 'COMM_TEST', display_name: 'Commission Test Group', max_leverage: 100 })).id;
    service = new BrokerageTradingGroupCommissionService(db);
  });

  afterAll(async () => db?.close());

  it('accepts exact decimal strings and rejects unsafe forms', () => {
    expect(normalizeCommissionAmount('0', 'amount')).toBe('0');
    expect(normalizeCommissionAmount('2.500000', 'amount')).toBe('2.5');
    expect(normalizeCommissionAmount('100000.000000', 'amount')).toBe('100000');
    for (const value of [-1, 1.2, '1e2', 'NaN', 'Infinity', '1.1234567', '100000.000001', '']) expect(() => normalizeCommissionAmount(value, 'amount')).toThrow();
  });

  it('creates, reads, versions, and preserves no-op configurations', async () => {
    const created = await service.upsertGroupCommissionConfiguration(scope, groupId, { open_commission_per_lot: '2.50', close_commission_per_lot: '3.125000', commission_currency: ' usd ', enabled: true, expected_version: 0 });
    expect(created).toMatchObject({ open_commission_per_lot: '2.5', close_commission_per_lot: '3.125', commission_currency: 'USD', config_version: 1 });
    expect(await service.getGroupCommissionConfiguration(scope, groupId)).toMatchObject({ id: created.id, config_version: 1 });
    const noOp = await service.upsertGroupCommissionConfiguration(scope, groupId, { open_commission_per_lot: '2.500000', close_commission_per_lot: '3.125', commission_currency: 'USD', enabled: true, expected_version: 1 });
    expect(noOp.config_version).toBe(1);
    const updated = await service.upsertGroupCommissionConfiguration(scope, groupId, { open_commission_per_lot: '0', close_commission_per_lot: '100000', commission_currency: 'EUR', enabled: false, expected_version: 1 });
    expect(updated).toMatchObject({ open_commission_per_lot: '0', close_commission_per_lot: '100000', commission_currency: 'EUR', enabled: false, config_version: 2 });
    await expect(service.upsertGroupCommissionConfiguration(scope, groupId, { open_commission_per_lot: '1', close_commission_per_lot: '1', commission_currency: 'EUR', enabled: true, expected_version: 1 })).rejects.toMatchObject({ code: 'TRADING_GROUP_COMMISSION_VERSION_CONFLICT' });
  });

  it('serializes exact values, audits material changes, and preserves one row', async () => {
    const row = (await db.transaction(scope, tx => tx.query<{ open_commission_per_lot: string; close_commission_per_lot: string }>('SELECT open_commission_per_lot::text,close_commission_per_lot::text FROM brokerage_trading_group_commissions WHERE trading_group_id=$1', [groupId]))).rows[0];
    expect(row).toEqual({ open_commission_per_lot: '0', close_commission_per_lot: '100000' });
    const count = Number((await db.transaction(scope, tx => tx.query<{ count: string }>('SELECT count(*)::text AS count FROM brokerage_trading_group_commissions WHERE trading_group_id=$1', [groupId]))).rows[0].count);
    expect(count).toBe(1);
    const events = (await db.transaction(scope, tx => tx.query<{ action: string; metadata: Record<string, unknown> }>("SELECT action,metadata FROM audit_events WHERE resource_type='brokerage_trading_group_commission' AND resource_id=(SELECT id::text FROM brokerage_trading_group_commissions WHERE trading_group_id=$1) ORDER BY created_at", [groupId]))).rows;
    expect(events.map(event => event.action)).toEqual(['brokerage.trading_group.commission.created', 'brokerage.trading_group.commission.updated']);
    expect(events[1].metadata).toMatchObject({ config_version: { before: 1, after: 2 } });
  });

  it('prevents cross-scope reads and direct excess precision writes', async () => {
    const foreign = { ...scope, organizationId: randomUUID(), brandId: randomUUID(), environmentId: randomUUID(), productInstanceId: randomUUID(), requestId: randomUUID() };
    await expect(service.getGroupCommissionConfiguration(foreign, groupId)).rejects.toMatchObject({ code: 'TRADING_GROUP_NOT_FOUND' });
    await expect(db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_trading_group_commissions SET open_commission_per_lot=$1::numeric WHERE id=(SELECT id FROM brokerage_trading_group_commissions WHERE trading_group_id=$2)', ['1.1234567', groupId]))).rejects.toMatchObject({ code: '23514' });
  });
});
