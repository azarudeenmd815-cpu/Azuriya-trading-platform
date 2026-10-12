import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Actor, Row, TenantContext } from '../src/shared/types.js';
import { permissions } from '../src/shared/types.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { BrokerageTradingGroupsService } from '../src/server/brokerage/trading-groups.js';

describe('Brokerage trading-group administration', () => {
  let db: Database;
  let service: BrokerageTradingGroupsService;
  let first: TenantContext;
  let second: TenantContext;
  const actorId = randomUUID();
  const core: Actor = { userId: actorId, requestId: randomUUID(), core: true };

  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    await db.transaction({ core: true }, tx => tx.query(
      'INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5)',
      [actorId, '***@***', 'unused', 'Trading Groups Test', null],
    ));
    const foundation = new FoundationService(db);
    const alpha = await foundation.createOrganization(core, { name: 'Trading Alpha', slug: 'trading-alpha', business_type: 'brokerage', brand_name: 'Trading Alpha', environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'test' });
    const beta = await foundation.createOrganization(core, { name: 'Trading Beta', slug: 'trading-beta', business_type: 'brokerage', brand_name: 'Trading Beta', environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'test' });
    const instances = await foundation.coreList('product-instances', { limit: 100 }, core);
    await db.transaction({ core: true }, async tx => {
      for (const organization of [alpha, beta]) {
        const instance = instances.data.find(row => String(row.organization_id) === String(organization.id)) as Row;
        await tx.query('INSERT INTO staff_memberships(id,organization_id,user_id,role_id,environment_id,product_instance_id) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), organization.id, actorId, organization.owner_role_id, instance.environment_id, instance.id]);
      }
    });
    const makeScope = (organizationId: string): TenantContext => {
      const instance = instances.data.find(row => String(row.organization_id) === organizationId) as Row;
      return { userId: actorId, requestId: randomUUID(), core: false, organizationId, brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
    };
    first = makeScope(String(alpha.id));
    second = makeScope(String(beta.id));
    service = new BrokerageTradingGroupsService(db);
  });

  afterAll(async () => db?.close());

  it('normalizes and persists a valid group with version 1 and creation audit', async () => {
    const group = await service.create(first, { group_code: ' raw_usd ', display_name: ' Raw USD ', max_leverage: 100 });
    expect(group).toMatchObject({ group_code: 'RAW_USD', display_name: 'Raw USD', description: '', max_leverage: 100, status: 'active', config_version: 1 });
    const events = await db.transaction(first, tx => tx.query<{ action: string }>('SELECT action FROM audit_events WHERE resource_id=$1', [group.id]));
    expect(events.rows.map(row => row.action)).toEqual(['brokerage.trading_group.created']);
  });

  it('enforces validation, boundaries, and scope uniqueness', async () => {
    for (const groupCode of ['ab', 'bad-code']) await expect(service.create(first, { group_code: groupCode, display_name: 'Bad', max_leverage: 100 })).rejects.toThrow();
    await expect(service.create(first, { group_code: 'RAW_USD', display_name: 'Duplicate', max_leverage: 100 })).rejects.toMatchObject({ code: 'TRADING_GROUP_EXISTS' });
    await expect(service.create(first, { group_code: 'LOW', display_name: 'Low', max_leverage: 1 })).resolves.toMatchObject({ max_leverage: 1 });
    await expect(service.create(first, { group_code: 'HIGH', display_name: 'High', max_leverage: 1000 })).resolves.toMatchObject({ max_leverage: 1000 });
    for (const max_leverage of [0, 1001, 1.5, Number.POSITIVE_INFINITY]) await expect(service.create(first, { group_code: 'BADLEV', display_name: 'Bad', max_leverage })).rejects.toThrow();
    await expect(service.create(second, { group_code: 'RAW_USD', display_name: 'Independent Scope', max_leverage: 100 })).resolves.toMatchObject({ group_code: 'RAW_USD' });
  });

  it('rejects Unicode group codes from an ASCII-safe escaped fixture', async () => {
    const unicodeGroupCode = '\u00e9\u00e9\u00e9';
    await expect(service.create(first, { group_code: unicodeGroupCode, display_name: 'Bad Unicode', max_leverage: 100 })).rejects.toThrow();
  });

  it('increments versions, rejects stale writes, and preserves no-op behavior', async () => {
    const group = (await service.list(first)).data.find(item => item.group_code === 'RAW_USD')!;
    const updated = await service.update(first, group.id, { display_name: 'Raw USD Updated', max_leverage: 250, config_version: 1 });
    expect(updated).toMatchObject({ config_version: 2, max_leverage: 250 });
    await expect(service.update(first, group.id, { display_name: 'Stale', config_version: 1 })).rejects.toMatchObject({ code: 'TRADING_GROUP_VERSION_CONFLICT' });
    const noOp = await service.update(first, group.id, { display_name: 'Raw USD Updated', config_version: 2 });
    expect(noOp.config_version).toBe(2);
    const auditCount = Number((await db.transaction(first, tx => tx.query<{ count: number }>('SELECT count(*)::int AS count FROM audit_events WHERE resource_id=$1 AND action=\'brokerage.trading_group.updated\'', [group.id]))).rows[0].count);
    expect(auditCount).toBe(1);
  });

  it('allows only mutable identity fields through the service and prevents competing writes', async () => {
    const group = (await service.list(first)).data.find(item => item.group_code === 'RAW_USD')!;
    await expect(service.update(first, group.id, { group_code: 'OTHER', config_version: 2 } as never)).rejects.toThrow();
    const results = await Promise.allSettled([
      service.update(first, group.id, { description: 'one', config_version: 2 }),
      service.update(first, group.id, { description: 'two', config_version: 2 }),
    ]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(item => item.status === 'rejected' && item.reason?.code === 'TRADING_GROUP_VERSION_CONFLICT')).toHaveLength(1);
  });

  it('uses lifecycle transitions and isolates full tenant scope', async () => {
    const group = (await service.list(first)).data.find(item => item.group_code === 'RAW_USD')!;
    const inactive = await service.deactivate(first, group.id, { config_version: group.config_version });
    expect(inactive).toMatchObject({ status: 'inactive', config_version: group.config_version + 1 });
    await expect(service.get(second, group.id)).rejects.toMatchObject({ code: 'TRADING_GROUP_NOT_FOUND' });
    expect((await service.list(second)).data.some(item => item.id === group.id)).toBe(false);
    await expect(db.transaction({ core: true }, tx => tx.query("UPDATE brokerage_trading_groups SET group_code='MUTATED' WHERE id=$1", [group.id]))).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects material changes at the terminal config version without mutating state or audits', async () => {
    const group = await service.create(first, { group_code: 'MAX_VERSION', display_name: 'Terminal Version', max_leverage: 100 });
    await db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_trading_groups SET config_version=2147483647 WHERE id=$1', [group.id]));
    const before = await service.get(first, group.id);
    const auditCount = async () => Number((await db.transaction(first, tx => tx.query<{ count: number }>("SELECT count(*)::int AS count FROM audit_events WHERE resource_type='brokerage_trading_group' AND resource_id=$1", [group.id]))).rows[0].count);
    const auditBefore = await auditCount();
    await expect(service.update(first, group.id, { display_name: 'Changed', config_version: 2147483647 })).rejects.toMatchObject({ code: 'TRADING_GROUP_VERSION_EXHAUSTED', statusCode: 409 });
    await expect(service.deactivate(first, group.id, { config_version: 2147483647 })).rejects.toMatchObject({ code: 'TRADING_GROUP_VERSION_EXHAUSTED', statusCode: 409 });
    const noOp = await service.update(first, group.id, { display_name: before.display_name, config_version: 2147483647 });
    expect(noOp).toEqual(before);
    expect(await service.get(first, group.id)).toEqual(before);
    expect(await auditCount()).toBe(auditBefore);
  });

  it('enforces read and mutation permissions at the service boundary', async () => {
    const readOnly = { ...first, requestId: randomUUID(), permissions: ['settings.read'] };
    const noRead = { ...first, requestId: randomUUID(), permissions: [] };
    await expect(service.create(readOnly, { group_code: 'NO_WRITE', display_name: 'No Write', max_leverage: 100 })).rejects.toMatchObject({ code: 'PERMISSION_DENIED', statusCode: 403 });
    await expect(service.create({ ...first, requestId: randomUUID(), supportGrantId: randomUUID() }, { group_code: 'SUPPORT_WRITE', display_name: 'Support Write', max_leverage: 100 })).rejects.toMatchObject({ code: 'BROKERAGE_SUPPORT_READ_ONLY', statusCode: 403 });
    const group = await service.create(first, { group_code: 'SERVICE_AUTH', display_name: 'Service Auth', max_leverage: 100 });
    await expect(service.get(noRead, group.id)).rejects.toMatchObject({ code: 'PERMISSION_DENIED', statusCode: 403 });
    await expect(service.update(readOnly, group.id, { max_leverage: 200, config_version: 1 })).rejects.toMatchObject({ code: 'PERMISSION_DENIED', statusCode: 403 });
    expect((await service.get(first, group.id)).max_leverage).toBe(100);
  });
});
