import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { BrokerageLedgerService } from '../src/server/brokerage/ledger.js';
import { permissions, type TenantContext } from '../src/shared/types.js';

describe('authoritative account ledger replay and reconciliation', () => {
  let db: Database;
  let service: BrokerageLedgerService;
  let first: TenantContext;
  let second: TenantContext;
  let offeringId: string;
  let clientId: string;
  let providerId: string;
  const ownerId = randomUUID();
  const otherOwnerId = randomUUID();
  const values = (scope: TenantContext) => [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId];

  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    await db.transaction({ core: true }, async tx => {
      await tx.query("INSERT INTO users(id,email,password_hash,display_name) VALUES($1,'ledger-owner','unused','Ledger Owner'),($2,'ledger-other','unused','Other Owner')", [ownerId, otherOwnerId]);
    });
    const foundation = new FoundationService(db);
    for (const [index, slug] of ['ledger-alpha', 'ledger-beta'].entries()) {
      const organization = await foundation.createOrganization({ core: true, userId: ownerId, requestId: randomUUID() }, {
        name: slug, slug, business_type: 'brokerage', brand_name: slug, environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'test', owner_email: 'ledger-owner',
      });
      const instance = (await db.transaction({ core: true }, tx => tx.query<{ id: string; brand_id: string; environment_id: string }>('SELECT id,brand_id,environment_id FROM product_instances WHERE organization_id=$1', [organization.id]))).rows[0];
      const scope: TenantContext = { core: false, userId: ownerId, requestId: randomUUID(), organizationId: String(organization.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
      if (index === 0) first = scope; else second = scope;
    }
    clientId = randomUUID();
    await db.transaction({ core: true }, async tx => {
      await tx.query("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,client_number,full_name,email,status,onboarding_status,kyc_status) VALUES($1,$2,$3,$4,$5,'CLI-LEDGER','Ledger Client','ledger-client','active','complete','approved')", [clientId, ...values(first)]);
      providerId = (await tx.query<{ id: string }>('SELECT id FROM integration_providers ORDER BY slug LIMIT 1')).rows[0].id;
      offeringId = randomUUID();
      await tx.query("INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES($1,$2,$3,$4,$5,'Ledger Live',$6,'live','[\"USD\"]','[100]',$7)", [offeringId, ...values(first), providerId, ownerId]);
    });
    service = new BrokerageLedgerService(db);
  });

  afterAll(async () => { await db?.close(); });

  async function account(scope = first, currency = 'USD'): Promise<string> {
    const id = randomUUID();
    await db.transaction({ core: true }, tx => tx.query("INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,status,external_account_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'live',$10,100,'active',$11,$12)", [id, ...values(scope), clientId, offeringId, providerId, `LEDGER-${id}`, currency, `external-${id}`, ownerId]));
    return id;
  }

  it('replays signed posted cash movements exactly and excludes non-cash statuses and unrealized P&L', async () => {
    const accountId = await account();
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '100', kind: 'opening_balance', idempotency_key: 'ledger-opening-0001' });
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '0.00000001', kind: 'deposit', idempotency_key: 'ledger-deposit-0001' });
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '-1.25', kind: 'withdrawal', idempotency_key: 'ledger-withdraw-0001' });
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '2.50', kind: 'realized_pnl', idempotency_key: 'ledger-realized-0001' });
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '-0.10', kind: 'commission', idempotency_key: 'ledger-commission-0001' });
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '-0.01', kind: 'fee', idempotency_key: 'ledger-fee-0001' });
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '-0.02', kind: 'swap', idempotency_key: 'ledger-swap-0001' });
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '1.25', kind: 'reversal', idempotency_key: 'ledger-reversal-0001' });
    await db.transaction(first, tx => tx.query("INSERT INTO brokerage_ledger_entries(id,organization_id,brand_id,environment_id,product_instance_id,account_id,currency,kind,amount,status,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,'USD','unrealized_pnl',999,'posted','ledger-unrealized-0001',$7),($8,$2,$3,$4,$5,$6,'USD','deposit',999,'pending','ledger-pending-0001',$7),($9,$2,$3,$4,$5,$6,'USD','deposit',999,'void','ledger-void-0001',$7)", [randomUUID(), ...values(first), accountId, ownerId, randomUUID(), randomUUID()]));
    const result = await service.balance(first, accountId, 'USD');
    expect(result).toMatchObject({ account_id: accountId, currency: 'USD', balance: '102.37000001', entry_count: 8 });
    expect(await service.balance(first, accountId, 'USD')).toEqual({ ...result, evaluated_at: expect.any(String) });
  });

  it('keeps repeated fractional postings exact, supports negative cash, and prevents duplicate idempotent effects', async () => {
    const accountId = await account();
    for (let index = 0; index < 100; index += 1) await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '0.00000001', kind: 'adjustment', idempotency_key: `ledger-fraction-${String(index).padStart(3, '0')}` });
    const entry = await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '-2', kind: 'adjustment', idempotency_key: 'ledger-idempotent-0001' });
    const replay = await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '-2', kind: 'adjustment', idempotency_key: 'ledger-idempotent-0001' });
    expect(replay.id).toBe(entry.id);
    await expect(service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '-3', kind: 'adjustment', idempotency_key: 'ledger-idempotent-0001' })).rejects.toMatchObject({ code: 'LEDGER_IDEMPOTENCY_CONFLICT' });
    expect((await service.balance(first, accountId, 'USD')).balance).toBe('-1.99999900');
  });

  it('rejects cross-tenant and cross-currency account access without exposing ledger data', async () => {
    const accountId = await account();
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '1', kind: 'deposit', idempotency_key: 'ledger-scope-0001' });
    await expect(service.balance(second, accountId, 'USD')).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
    await expect(service.balance(first, accountId, 'EUR')).rejects.toMatchObject({ code: 'ACCOUNT_CURRENCY_MISMATCH' });
  });

  it('reports MATCHED, exact MISMATCHED differences, and NOT_COMPARABLE without repairing the projection', async () => {
    const accountId = await account();
    await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '12.34567891', kind: 'opening_balance', idempotency_key: 'ledger-reconcile-0001' });
    const missing = await service.reconcile(first, accountId, 'USD');
    expect(missing).toMatchObject({ status: 'NOT_COMPARABLE', stored_balance: null, difference: null, ledger_derived_balance: '12.34567891', entry_count: 1 });
    await db.transaction(first, tx => tx.query("INSERT INTO brokerage_account_balance_projections(organization_id,brand_id,environment_id,product_instance_id,account_id,currency,balance) VALUES($1,$2,$3,$4,$5,'USD',12.34567891)", [...values(first), accountId]));
    expect((await service.reconcile(first, accountId, 'USD')).status).toBe('MATCHED');
    await db.transaction(first, tx => tx.query("UPDATE brokerage_account_balance_projections SET balance=10 WHERE account_id=$1", [accountId]));
    const mismatch = await service.reconcile(first, accountId, 'USD');
    expect(mismatch).toMatchObject({ status: 'MISMATCHED', stored_balance: '10.00000000', difference: '2.34567891' });
    expect((await db.transaction(first, tx => tx.query<{ balance: string }>('SELECT balance::text FROM brokerage_account_balance_projections WHERE account_id=$1', [accountId]))).rows[0].balance).toBe('10.00000000');
  });

  it('keeps historical entries immutable and exposes deterministic sequence metadata', async () => {
    const accountId = await account();
    const entry = await service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '1', kind: 'deposit', idempotency_key: 'ledger-immutable-0001' });
    expect(entry.sequence).toBeTypeOf('string');
    await expect(db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_ledger_entries SET amount=2 WHERE id=$1', [entry.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(db.transaction({ core: true }, tx => tx.query('DELETE FROM brokerage_ledger_entries WHERE id=$1', [entry.id]))).rejects.toMatchObject({ code: '42501' });
  });

  it('aggregates concurrent successful postings from committed history', async () => {
    const accountId = await account();
    await Promise.all(Array.from({ length: 10 }, (_, index) => service.postEntry(first, { account_id: accountId, currency: 'USD', amount: '0.10', kind: 'adjustment', idempotency_key: `ledger-concurrent-${String(index).padStart(2, '0')}` })));
    expect((await service.balance(first, accountId, 'USD')).balance).toBe('1.00000000');
  });
});
