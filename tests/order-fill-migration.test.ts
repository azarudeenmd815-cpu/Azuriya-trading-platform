import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type SnapshotRow = Record<string, unknown>;

const ids = {
  user: '00000000-0000-0000-0000-000000000001',
  organization: '00000000-0000-0000-0000-000000000002',
  brand: '00000000-0000-0000-0000-000000000003',
  environment: '00000000-0000-0000-0000-000000000004',
  product: '00000000-0000-0000-0000-000000000005',
  subscription: '00000000-0000-0000-0000-000000000006',
  instance: '00000000-0000-0000-0000-000000000007',
  provider: '00000000-0000-0000-0000-000000000008',
  client: '00000000-0000-0000-0000-000000000009',
  offering: '00000000-0000-0000-0000-00000000000a',
  account: '00000000-0000-0000-0000-00000000000b',
  underfilled: '00000000-0000-0000-0000-00000000000c',
  fullPartial: '00000000-0000-0000-0000-00000000000d',
  validPartial: '00000000-0000-0000-0000-00000000000e',
  underfilledFill: '00000000-0000-0000-0000-00000000000f',
  fullPartialFill: '00000000-0000-0000-0000-000000000010',
  underfilledCreated: '00000000-0000-0000-0000-000000000011',
  underfilledFilled: '00000000-0000-0000-0000-000000000012',
  fullPartialCreated: '00000000-0000-0000-0000-000000000013',
  fullPartialEvent: '00000000-0000-0000-0000-000000000014',
} as const;

async function applyMigrationsBefore(db: PGlite, upgrade: string): Promise<void> {
  const files = (await readdir('migrations')).filter(file => /^\d+_[a-z0-9_-]+\.sql$/.test(file)).sort();
  for (const file of files) {
    if (file === upgrade) break;
    await db.exec(await readFile(`migrations/${file}`, 'utf8'));
  }
}

async function snapshot(db: PGlite): Promise<{ orders: SnapshotRow[]; history: SnapshotRow[]; fills: SnapshotRow[] }> {
  const orders = (await db.query<SnapshotRow>(`SELECT * FROM brokerage_orders WHERE id IN ($1,$2) ORDER BY id`, [ids.underfilled, ids.fullPartial])).rows;
  const history = (await db.query<SnapshotRow>(`SELECT * FROM brokerage_order_history WHERE order_id IN ($1,$2) ORDER BY id`, [ids.underfilled, ids.fullPartial])).rows;
  const fills = (await db.query<SnapshotRow>(`SELECT * FROM brokerage_order_fills WHERE order_id IN ($1,$2) ORDER BY id`, [ids.underfilled, ids.fullPartial])).rows;
  return { orders, history, fills };
}

describe('native order fill invariant migration', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    await applyMigrationsBefore(db, '042_native_order_fill_invariants.sql');
    await db.exec(`
      INSERT INTO users(id,email,password_hash,display_name) VALUES ('${ids.user}','***@***','unused','Order Fill Migration');
      INSERT INTO organizations(id,name,slug,business_type) VALUES ('${ids.organization}','Order Fill Migration','order-fill-migration','brokerage');
      INSERT INTO brands(id,organization_id,name) VALUES ('${ids.brand}','${ids.organization}','Order Fill Brand');
      INSERT INTO environments(id,organization_id,brand_id,name,kind) VALUES ('${ids.environment}','${ids.organization}','${ids.brand}','production','production');
      INSERT INTO products(id,slug,name) VALUES ('${ids.product}','order-fill-migration','Order Fill Migration');
      INSERT INTO product_subscriptions(id,organization_id,product_id,plan) VALUES ('${ids.subscription}','${ids.organization}','${ids.product}','foundation');
      INSERT INTO product_instances(id,organization_id,brand_id,environment_id,subscription_id,product_id,name) VALUES ('${ids.instance}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.subscription}','${ids.product}','Order Fill Migration');
      INSERT INTO integration_providers(id,name,slug,category) VALUES ('${ids.provider}','Order Fill Provider','order-fill-provider','trading_platform');
      INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,residence_country) VALUES ('${ids.client}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.user}','CLI-ORDER-FILL','Order Fill Client','***@***','active','IN','IN');
      INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES ('${ids.offering}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','Order Fill Offering','${ids.provider}','live','["USD"]','[100]','${ids.user}');
      INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,created_by) VALUES ('${ids.account}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.client}','${ids.offering}','${ids.provider}','ACC-ORDER-FILL','live','USD',100,'${ids.user}');
      INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,limit_price,filled_quantity,status,created_by) VALUES
        ('${ids.underfilled}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','buy',2,1,1,'filled','${ids.user}'),
        ('${ids.fullPartial}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.account}','EURUSD','limit','sell',2,1,2,'partially_filled','${ids.user}');
      INSERT INTO brokerage_order_fills(id,organization_id,brand_id,environment_id,product_instance_id,order_id,account_id,quantity,price) VALUES
        ('${ids.underfilledFill}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.underfilled}','${ids.account}',1,1),
        ('${ids.fullPartialFill}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.fullPartial}','${ids.account}',2,1);
      INSERT INTO brokerage_order_history(id,organization_id,brand_id,environment_id,product_instance_id,order_id,event_type,from_status,to_status,actor_id) VALUES
        ('${ids.underfilledCreated}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.underfilled}','created',NULL,'pending','${ids.user}'),
        ('${ids.underfilledFilled}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.underfilled}','filled','pending','filled','${ids.user}'),
        ('${ids.fullPartialCreated}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.fullPartial}','created',NULL,'pending','${ids.user}'),
        ('${ids.fullPartialEvent}','${ids.organization}','${ids.brand}','${ids.environment}','${ids.instance}','${ids.fullPartial}','partially_filled','pending','partially_filled','${ids.user}');
    `);
  });

  afterAll(async () => { await db?.close(); });

  it('preserves legacy orders, immutable fills, and history while enforcing new writes', async () => {
    const before = await snapshot(db);
    await db.exec(await readFile('migrations/042_native_order_fill_invariants.sql', 'utf8'));

    expect(await snapshot(db)).toEqual(before);
    expect((await db.query<{ convalidated: boolean }>("SELECT convalidated FROM pg_constraint WHERE conname='brokerage_order_status_quantity_consistency'")).rows).toEqual([{ convalidated: false }]);

    await expect(db.query(`INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,limit_price,filled_quantity,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,'EURUSD','limit','buy',2,1,1,'filled',$7)`, [randomUUID(), ids.organization, ids.brand, ids.environment, ids.instance, ids.account, ids.user])).rejects.toMatchObject({ code: '23514' });
    await expect(db.query(`INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,limit_price,filled_quantity,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,'EURUSD','limit','buy',2,1,2,'partially_filled',$7)`, [randomUUID(), ids.organization, ids.brand, ids.environment, ids.instance, ids.account, ids.user])).rejects.toMatchObject({ code: '23514' });

    await expect(db.query(`UPDATE brokerage_orders SET updated_at=now() WHERE id=$1`, [ids.underfilled])).rejects.toMatchObject({ code: '23514' });
    await expect(db.query(`UPDATE brokerage_orders SET updated_at=now() WHERE id=$1`, [ids.fullPartial])).rejects.toMatchObject({ code: '23514' });
    expect(await snapshot(db)).toEqual(before);

    await db.query(`INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,limit_price,filled_quantity,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,'EURUSD','limit','buy',3,1,2,'partially_filled',$7)`, [ids.validPartial, ids.organization, ids.brand, ids.environment, ids.instance, ids.account, ids.user]);
    await expect(db.query(`UPDATE brokerage_orders SET filled_quantity=1 WHERE id=$1`, [ids.validPartial])).rejects.toMatchObject({ code: '23514' });
  });
});
