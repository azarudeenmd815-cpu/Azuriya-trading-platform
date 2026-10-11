import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  user: '00000000-0000-0000-0000-000000000101',
  organization: '00000000-0000-0000-0000-000000000102',
  brand: '00000000-0000-0000-0000-000000000103',
  environment: '00000000-0000-0000-0000-000000000104',
  product: '00000000-0000-0000-0000-000000000105',
  subscription: '00000000-0000-0000-0000-000000000106',
  instance: '00000000-0000-0000-0000-000000000107',
  provider: '00000000-0000-0000-0000-000000000108',
  client: '00000000-0000-0000-0000-000000000109',
  offering: '00000000-0000-0000-0000-00000000010a',
  account: '00000000-0000-0000-0000-00000000010b',
  otherAccount: '00000000-0000-0000-0000-00000000010c',
  pending: '00000000-0000-0000-0000-00000000010d',
  rejected: '00000000-0000-0000-0000-00000000010e',
  expired: '00000000-0000-0000-0000-00000000010f',
  cancelled: '00000000-0000-0000-0000-000000000110',
  partial: '00000000-0000-0000-0000-000000000111',
  filled: '00000000-0000-0000-0000-000000000112',
  pendingFill: '00000000-0000-0000-0000-000000000113',
  partialFill: '00000000-0000-0000-0000-000000000114',
  filledExistingFill: '00000000-0000-0000-0000-000000000115',
} as const;

async function applyMigrationsBefore(db: PGlite, upgrade: string): Promise<void> {
  const files = (await readdir('migrations')).filter(file => /^\d+_[a-z0-9_-]+\.sql$/.test(file)).sort();
  for (const file of files) {
    if (file === upgrade) break;
    await db.exec(await readFile(`migrations/${file}`, 'utf8'));
  }
}

type Fill = { id: string; order_id: string; account_id: string; quantity: string };

describe('native order fill insertion guard', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    await applyMigrationsBefore(db, '043_native_fill_insertion_guard.sql');
    await db.exec(`
      INSERT INTO users(id,email,password_hash,display_name) VALUES ('${ids.user}','***@***','unused','Fill Guard');
      INSERT INTO organizations(id,name,slug,business_type) VALUES ('${ids.organization}','Fill Guard','fill-guard','brokerage');
      INSERT INTO brands(id,organization_id,name) VALUES ('${ids.brand}','${ids.organization}','Fill Guard Brand');
      INSERT INTO environments(id,organization_id,brand_id,name,kind) VALUES ('${ids.environment}','${ids.organization}','${ids.brand}','production','production');
      INSERT INTO products(id,slug,name) VALUES ('${ids.product}','fill-guard','Fill Guard');
      INSERT INTO product_subscriptions(id,organization_id,product_id,plan) VALUES ('${ids.subscription}','${ids.organization}','${ids.product}','foundation');
      INSERT INTO product_instances(id,organization_id,brand_id,environment_id,subscription_id,product_id,name) VALUES ('${ids.instance}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.subscription}','${ids.product}','Fill Guard');
      INSERT INTO integration_providers(id,name,slug,category) VALUES ('${ids.provider}','Fill Guard Provider','fill-guard-provider','trading_platform');
      INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,residence_country) VALUES ('${ids.client}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.user}','CLI-FILL-GUARD','Fill Guard','***@***','active','IN','IN');
      INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES ('${ids.offering}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','Fill Guard Offering','${ids.provider}','live','["USD"]','[100]','${ids.user}');
      INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,created_by) VALUES
        ('${ids.account}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.client}','${ids.offering}','${ids.provider}','ACC-FILL-GUARD','live','USD',100,'${ids.user}'),
        ('${ids.otherAccount}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.client}','${ids.offering}','${ids.provider}','ACC-FILL-GUARD-2','live','USD',100,'${ids.user}');
      INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,limit_price,filled_quantity,status,created_by,cancelled_by,cancelled_at,cancellation_reason) VALUES
        ('${ids.pending}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','buy',2,1,0,'pending','${ids.user}',NULL,NULL,NULL),
        ('${ids.rejected}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','buy',2,1,0,'rejected','${ids.user}',NULL,NULL,NULL),
        ('${ids.expired}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','buy',2,1,0,'expired','${ids.user}',NULL,NULL,NULL),
        ('${ids.cancelled}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','buy',2,1,0,'cancelled','${ids.user}','${ids.user}',now(),'user requested'),
        ('${ids.partial}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','buy',2,1,1,'partially_filled','${ids.user}',NULL,NULL,NULL),
        ('${ids.filled}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','buy',2,1,2,'filled','${ids.user}',NULL,NULL,NULL),
        ('${ids.pendingFill}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','buy',2,1,0,'pending','${ids.user}',NULL,NULL,NULL);
      INSERT INTO brokerage_order_fills(id,organization_id,brand_id,environment_id,product_instance_id,order_id,account_id,quantity,price) VALUES
        ('${ids.partialFill}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.partial}','${ids.account}',1,1),
        ('${ids.filledExistingFill}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.filled}','${ids.account}',1,1);
    `);
    await db.exec(await readFile('migrations/043_native_fill_insertion_guard.sql', 'utf8'));
  });

  afterAll(async () => { await db?.close(); });

  async function insertFill(orderId: string, accountId: string = ids.account, organizationId: string = ids.organization, quantity = '1'): Promise<void> {
    await db.query(`INSERT INTO brokerage_order_fills(id,organization_id,brand_id,environment_id,product_instance_id,order_id,account_id,quantity,price) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,1)`, [organizationId, ids.brand, ids.environment, ids.instance, orderId, accountId, quantity]);
  }

  it.each([
    ['pending', ids.pending],
    ['rejected', ids.rejected],
    ['expired', ids.expired],
    ['cancelled', ids.cancelled],
  ])('rejects fills for %s orders', async (_status, orderId) => {
    await expect(insertFill(orderId)).rejects.toMatchObject({ code: '23514' });
    const count = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM brokerage_order_fills WHERE order_id=$1', [orderId]);
    expect(count.rows[0].count).toBe('0');
  });

  it('rejects an overfill without mutating existing fills', async () => {
    await expect(insertFill(ids.partial, ids.account, ids.organization, '2')).rejects.toMatchObject({ code: '23514' });
    const fills = await db.query<Fill>('SELECT id,order_id,account_id,quantity::text FROM brokerage_order_fills WHERE order_id=$1', [ids.partial]);
    expect(fills.rows).toEqual([{ id: ids.partialFill, order_id: ids.partial, account_id: ids.account, quantity: '1.00000000' }]);
  });

  it('accepts the final fill for a filled parent when the persisted fill total is still below quantity', async () => {
    await insertFill(ids.filled);
    const total = await db.query<{ total: string }>('SELECT sum(quantity)::text AS total FROM brokerage_order_fills WHERE order_id=$1', [ids.filled]);
    expect(total.rows[0].total).toBe('2.00000000');
  });

  it('rejects a pending fill with a mismatched account or tenant scope', async () => {
    await expect(insertFill(ids.pendingFill, ids.otherAccount)).rejects.toMatchObject({ code: '23514' });
    const otherTenant = '00000000-0000-0000-0000-000000000199';
    await expect(insertFill(ids.pendingFill, ids.account, otherTenant)).rejects.toMatchObject({ code: '23514' });
    const count = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM brokerage_order_fills WHERE order_id=$1', [ids.pendingFill]);
    expect(count.rows[0].count).toBe('0');
  });

  it('rolls back a failed insertion and leaves the parent and fills unchanged', async () => {
    await db.query('BEGIN');
    await expect(db.query(`INSERT INTO brokerage_order_fills(id,organization_id,brand_id,environment_id,product_instance_id,order_id,account_id,quantity,price) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,3,1)`, [ids.organization, ids.brand, ids.environment, ids.instance, ids.partial, ids.account])).rejects.toMatchObject({ code: '23514' });
    await db.query('ROLLBACK');
    const parent = await db.query<{ status: string; filled_quantity: string }>('SELECT status,filled_quantity::text FROM brokerage_orders WHERE id=$1', [ids.partial]);
    const fills = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM brokerage_order_fills WHERE order_id=$1', [ids.partial]);
    expect(parent.rows[0]).toEqual({ status: 'partially_filled', filled_quantity: '1.00000000' });
    expect(fills.rows[0].count).toBe('1');
  });
});
