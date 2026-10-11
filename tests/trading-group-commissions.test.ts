import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Actor, Row, TenantContext } from '../src/shared/types.js';
import { permissions } from '../src/shared/types.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { BrokerageTradingGroupsService } from '../src/server/brokerage/trading-groups.js';
import { BrokerageTradingGroupCommissionService, normalizeCommissionAmount, parseTradingGroupCommissionInput } from '../src/server/brokerage/trading-group-commissions.js';

describe('Trading-group commission input hardening', () => {
  const valid = { open_commission_per_lot: '2.50', close_commission_per_lot: '3.125', commission_currency: 'USD', enabled: true, expected_version: 0 };

  it('rejects unsafe numeric and oversized version inputs before persistence', () => {
    expect(parseTradingGroupCommissionInput(valid)).toMatchObject({ open_commission_per_lot: '2.5', expected_version: 0 });
    expect(parseTradingGroupCommissionInput({ ...valid, expected_version: 2147483647 }).expected_version).toBe(2147483647);
    for (const value of [-1, 2.5, '1', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, 2147483648]) {
      expect(() => parseTradingGroupCommissionInput({ ...valid, expected_version: value })).toThrow();
    }
  });

  it('rejects numeric JSON amounts, excess precision, and oversized decimal payloads', () => {
    for (const field of ['open_commission_per_lot', 'close_commission_per_lot']) {
      for (const value of [2.5, '1e2', '1.1234567', '100000.000001', `1${'0'.repeat(100000)}`]) {
        expect(() => parseTradingGroupCommissionInput({ ...valid, [field]: value })).toThrow();
      }
    }
  });

  it('keeps validation diagnostics ASCII-safe for legacy Windows capture', () => {
    const invalidInputs = [
      { ...valid, open_commission_per_lot: 2.5 },
      { ...valid, expected_version: 2147483648 },
      { ...valid, commission_currency: String.fromCharCode(0x20ac) },
    ];
    for (const input of invalidInputs) {
      let error: unknown;
      try { parseTradingGroupCommissionInput(input); } catch (caught) { error = caught; }
      expect(error).toBeDefined();
      const message = error instanceof Error ? error.message : '';
      expect([...message].every(character => character.charCodeAt(0) <= 0x7F)).toBe(true);
    }
  });

  it('rejects oversized inputs before calling BigInt', () => {
    const conversion = vi.spyOn(globalThis, 'BigInt');
    try {
      for (const value of ['1000000', '1000000.000001', '9'.repeat(100000), `0.${'0'.repeat(100000)}`]) {
        expect(() => normalizeCommissionAmount(value, 'amount')).toThrow();
      }
      expect(conversion).not.toHaveBeenCalled();
    } finally { conversion.mockRestore(); }
  });

  it('preserves exact valid boundaries and canonical decimal normalization', () => {
    for (const [value, normalized] of [['0', '0'], ['0.000000', '0'], ['0.000001', '0.000001'], ['2.500000', '2.5'], ['99999.999999', '99999.999999'], ['100000.000000', '100000']]) {
      const parsed = parseTradingGroupCommissionInput({ ...valid, open_commission_per_lot: value, close_commission_per_lot: value });
      expect(parsed.open_commission_per_lot).toBe(normalized);
      expect(parsed.close_commission_per_lot).toBe(normalized);
    }
  });
});

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

  it('preserves stored configuration and audits after rejected versions and oversized amounts', async () => {
    const base = { open_commission_per_lot: '1', close_commission_per_lot: '1', commission_currency: 'USD', enabled: true };
    const rejectionGroup = await new BrokerageTradingGroupsService(db).create(scope, { group_code: 'COMM_REJECT', display_name: 'Commission Rejection Group', max_leverage: 100 });
    await service.upsertGroupCommissionConfiguration(scope, rejectionGroup.id, { ...base, expected_version: 0 });
    const before = await service.get(scope, rejectionGroup.id);
    const auditCount = async () => (await db.transaction(scope, tx => tx.query<{ count: number }>("SELECT count(*)::int AS count FROM audit_events WHERE resource_type='brokerage_trading_group_commission'"))).rows[0].count;
    const auditBefore = await auditCount();
    for (const expected_version of [Number.MAX_SAFE_INTEGER + 1, 2147483648, 1.5]) {
      // An out-of-range version must fail input validation, not reach persistence
      // and masquerade as an ordinary stale-version conflict.
      await expect(service.upsertGroupCommissionConfiguration(scope, rejectionGroup.id, { ...base, expected_version })).rejects.toMatchObject({ name: 'ZodError' });
    }
    for (const field of ['open_commission_per_lot', 'close_commission_per_lot']) {
      await expect(service.upsertGroupCommissionConfiguration(scope, rejectionGroup.id, { ...base, [field]: '9'.repeat(100000), expected_version: 1 })).rejects.toMatchObject({ code: 'COMMISSION_AMOUNT_INVALID', statusCode: 422 });
    }
    expect(before).not.toBeNull();
    expect(await service.get(scope, rejectionGroup.id)).toEqual(before);
    expect(await auditCount()).toBe(auditBefore);
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
