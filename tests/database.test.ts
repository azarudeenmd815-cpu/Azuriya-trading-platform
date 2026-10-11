import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, validateServerRuntimeLogin, type Database, type Executor } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { permissions } from '../src/shared/types.js';

describe('PostgreSQL foundation', () => {
  let db: Database;
  beforeAll(async () => { db = await createDatabase(); await migrate(db); });
  afterAll(async () => { await db?.close(); });

  it('runs ordinary queries as a role that cannot bypass row security', async () => {
    const result = await db.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(result.rows).toEqual([{ current_user: 'azuriya_app', rolsuper: false, rolbypassrls: false }]);
  });

  it('migrates all required entity tables and is repeatable', async () => {
    await migrate(db);
    const result = await db.query<{ tablename: string }>('SELECT tablename FROM pg_tables WHERE schemaname = $1', ['public']);
    expect(result.rows.map(row => row.tablename)).toEqual(expect.arrayContaining([
      'organizations', 'brands', 'environments', 'products', 'product_subscriptions', 'product_instances',
      'users', 'sessions', 'staff_memberships', 'client_memberships', 'roles', 'permissions', 'role_permissions',
      'domains', 'integration_providers', 'integration_provider_capabilities', 'integration_connections',
      'integration_requests', 'api_keys', 'api_applications', 'oauth_clients', 'service_accounts',
      'webhook_endpoints', 'webhook_deliveries', 'audit_events', 'outbox_events', 'feature_flags',
      'tenant_feature_overrides', 'support_access_grants', 'idempotency_records',
    ]));
  });

  it('seeds seven real products and an honest request-only provider catalog without tenant fixtures', async () => {
    await seedCatalog(db);
    await seedCatalog(db);
    const products = await db.query<{ slug: string }>('SELECT slug FROM products ORDER BY slug');
    expect(products.rows.map(row => row.slug)).toEqual(['affiliate-portal', 'api', 'brokerage', 'brokerage-crm', 'prop-crm', 'trading-hub', 'trading-terminal']);
    const providers = await db.query<{ connector_available: boolean; status: string }>('SELECT connector_available,status FROM integration_providers');
    expect(providers.rows).toHaveLength(6);
    expect(providers.rows.every(row => !row.connector_available && row.status === 'request_only')).toBe(true);
    const permissionRows = await db.query<{ code: string }>('SELECT code FROM permissions');
    expect(permissionRows.rows.filter(row => !row.code.startsWith('brokerage.'))).toHaveLength(18);
    expect(permissionRows.rows.map(row => row.code).sort()).toEqual([...permissions].sort());
    expect((await db.transaction({ core: true }, tx => tx.query('SELECT id FROM organizations'))).rows).toEqual([]);
  });

  describe('tenant isolation and database constraints', () => {
    let alpha: Awaited<ReturnType<typeof insertTenant>> & { instance: string; role: string; subscription: string };
    let beta: typeof alpha;
    let user: string;
    let product: string;
    beforeAll(async () => {
      await seedCatalog(db);
      await db.transaction({ core: true }, async tx => {
        user = randomUUID();
        await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)', [user, 'db-test@example.test', 'password-hash', 'Database Test']);
        product = (await tx.query<{ id: string }>("SELECT id FROM products WHERE slug = 'brokerage-crm'")).rows[0].id;
        const create = async (label: string) => {
          const tenant = await insertTenant(tx, label);
          const subscription = randomUUID(), instance = randomUUID(), role = randomUUID();
          await tx.query('INSERT INTO product_subscriptions(id,organization_id,product_id,plan) VALUES ($1,$2,$3,$4)', [subscription, tenant.organization, product, 'foundation']);
          await tx.query('INSERT INTO product_instances(id,organization_id,brand_id,environment_id,subscription_id,product_id,name) VALUES ($1,$2,$3,$4,$5,$6,$7)', [instance, tenant.organization, tenant.brand, tenant.environment, subscription, product, label]);
          await tx.query('INSERT INTO roles(id,organization_id,name) VALUES ($1,$2,$3)', [role, tenant.organization, 'Administrator']);
          return { ...tenant, instance, role, subscription };
        };
        alpha = await create('alpha'); beta = await create('beta');
      });
    });

    it('hides every tenant row without trusted transaction context', async () => {
      for (const table of ['organizations', 'brands', 'environments', 'product_instances', 'roles']) {
        expect((await db.query(`SELECT id FROM ${table}`)).rows).toEqual([]);
      }
      expect((await db.query('SELECT id FROM users WHERE id = $1', [user])).rows).toHaveLength(1);
    });

    it('limits tenant SELECT and UPDATE to the authorized organization', async () => {
      await db.transaction({ organizationId: alpha.organization }, async tx => {
        const brands = await tx.query<{ id: string }>('SELECT id FROM brands');
        expect(brands.rows).toEqual([{ id: alpha.brand }]);
        expect((await tx.query('UPDATE brands SET name = $1 WHERE id = $2 RETURNING id', ['Forbidden', beta.brand])).rows).toEqual([]);
        expect((await tx.query('SELECT id FROM product_instances WHERE id = $1', [beta.instance])).rows).toEqual([]);
      });
    });

    it('WITH CHECK prevents another tenant INSERT and changing tenant ownership', async () => {
      await expect(db.transaction({ organizationId: alpha.organization }, tx => tx.query('INSERT INTO brands(id,organization_id,name) VALUES ($1,$2,$3)', [randomUUID(), beta.organization, 'Intruder']))).rejects.toMatchObject({ code: '42501' });
      await expect(db.transaction({ organizationId: alpha.organization }, tx => tx.query('UPDATE brands SET organization_id = $1 WHERE id = $2', [beta.organization, alpha.brand]))).rejects.toMatchObject({ code: '42501' });
      await expect(db.query('INSERT INTO brands(id,organization_id,name) VALUES ($1,$2,$3)', [randomUUID(), alpha.organization, 'No context'])).rejects.toMatchObject({ code: '42501' });
    });

    it('allows catalog reads and prevents catalog writes outside Core', async () => {
      expect((await db.query('SELECT id FROM products')).rows).toHaveLength(7);
      expect((await db.transaction({ organizationId: alpha.organization }, tx => tx.query("UPDATE products SET name = 'Changed' WHERE id = $1 RETURNING id", [product]))).rows).toEqual([]);
      await expect(db.query('INSERT INTO products(id,slug,name) VALUES ($1,$2,$3)', [randomUUID(), 'unauthorized', 'Unauthorized product'])).rejects.toMatchObject({ code: '42501' });
      await expect(db.query('DELETE FROM schema_migrations')).rejects.toMatchObject({ code: '42501' });
    });

    it('rejects cross-tenant brand and environment associations even in Core', async () => {
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO environments(id,organization_id,brand_id,name,kind) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), alpha.organization, beta.brand, 'Wrong brand', 'sandbox']))).rejects.toMatchObject({ code: '23503' });
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO product_instances(id,organization_id,brand_id,environment_id,subscription_id,product_id,name) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), alpha.organization, alpha.brand, beta.environment, alpha.subscription, product, 'Wrong environment']))).rejects.toMatchObject({ code: '23503' });
    });

    it('binds instance product to its matching tenant subscription', async () => {
      const otherProduct = (await db.query<{ id: string }>("SELECT id FROM products WHERE slug = 'prop-crm'")).rows[0].id;
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO product_instances(id,organization_id,brand_id,environment_id,subscription_id,product_id,name) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), alpha.organization, alpha.brand, alpha.environment, alpha.subscription, otherProduct, 'Wrong subscription']))).rejects.toMatchObject({ code: '23503' });
    });

    it('binds role permissions, staff scopes, and client memberships to their organization', async () => {
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO role_permissions(organization_id,role_id,permission_code) VALUES ($1,$2,$3)', [alpha.organization, beta.role, 'overview.read']))).rejects.toMatchObject({ code: '23503' });
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO staff_memberships(id,organization_id,user_id,role_id) VALUES ($1,$2,$3,$4)', [randomUUID(), alpha.organization, user, beta.role]))).rejects.toMatchObject({ code: '23503' });
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO staff_memberships(id,organization_id,user_id,role_id,environment_id,product_instance_id) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), alpha.organization, user, alpha.role, alpha.environment, beta.instance]))).rejects.toMatchObject({ code: '23503' });
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES ($1,$2,$3,$4)', [randomUUID(), alpha.organization, user, beta.instance]))).rejects.toMatchObject({ code: '23503' });
    });

    it('rejects a foreign application reference on a tenant API key', async () => {
      const application = randomUUID();
      await db.transaction({ core: true }, tx => tx.query('INSERT INTO api_applications(id,organization_id,name) VALUES ($1,$2,$3)', [application, beta.organization, 'Beta application']));
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO api_keys(id,organization_id,application_id,name,prefix,secret_hash,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), alpha.organization, application, 'Wrong application', 'azk_', randomUUID(), user]))).rejects.toMatchObject({ code: '23503' });
    });

    it('requires actual domain verification, SSL, and edge states before activation', async () => {
      await expect(db.transaction({ organizationId: alpha.organization }, tx => tx.query("INSERT INTO domains(id,organization_id,brand_id,environment_id,product_instance_id,hostname,application_type,verification_token,status) VALUES ($1,$2,$3,$4,$5,$6,'admin_portal','token','active')", [randomUUID(), alpha.organization, alpha.brand, alpha.environment, alpha.instance, 'unverified.example.test']))).rejects.toMatchObject({ code: '23514' });
    });

    it('rejects tenant-scoped audit events with a missing organization', async () => {
      await expect(db.transaction({ core: true }, tx => tx.query('INSERT INTO audit_events(id,brand_id,actor_id,action,resource_type,resource_id,request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), alpha.brand, user, 'invalid', 'brand', alpha.brand, 'missing-org']))).rejects.toMatchObject({ code: '23514' });
    });

    it('keeps audit history immutable to the runtime role', async () => {
      const event = randomUUID();
      await db.transaction({ organizationId: alpha.organization }, tx => tx.query('INSERT INTO audit_events(id,organization_id,actor_id,action,resource_type,resource_id,request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event, alpha.organization, user, 'created', 'test', alpha.brand, 'request-a']));
      await expect(db.transaction({ core: true }, tx => tx.query('UPDATE audit_events SET action = $1 WHERE id = $2', ['Changed', event]))).rejects.toMatchObject({ code: '42501' });
      await expect(db.transaction({ core: true }, tx => tx.query('DELETE FROM audit_events WHERE id = $1', [event]))).rejects.toMatchObject({ code: '42501' });
    });

    it('rolls back a business write, audit event, and outbox event together', async () => {
      const event = randomUUID(), outbox = randomUUID();
      await expect(db.transaction({ organizationId: alpha.organization }, async tx => {
        await tx.query('UPDATE brands SET name = $1 WHERE id = $2', ['Rollback change', alpha.brand]);
        await tx.query('INSERT INTO audit_events(id,organization_id,actor_id,action,resource_type,resource_id,request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event, alpha.organization, user, 'changed', 'brand', alpha.brand, 'rollback-test']);
        await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES ($1,$2,$3,$4::jsonb)', [outbox, alpha.organization, 'brand.changed', '{}']);
        throw new Error('Reject operation');
      })).rejects.toThrow('Reject operation');
      await db.transaction({ organizationId: alpha.organization }, async tx => {
        expect((await tx.query<{ name: string }>('SELECT name FROM brands WHERE id = $1', [alpha.brand])).rows[0].name).toBe('alpha');
        expect((await tx.query('SELECT id FROM audit_events WHERE id = $1', [event])).rows).toEqual([]);
        expect((await tx.query('SELECT id FROM outbox_events WHERE id = $1', [outbox])).rows).toEqual([]);
      });
    });

    it('clears context after success, rollback, and interleaved tenant operations', async () => {
      const ids = await Promise.all([
        db.transaction({ organizationId: alpha.organization }, tx => tx.query<{ id: string }>('SELECT id FROM organizations')),
        db.transaction({ organizationId: beta.organization }, tx => tx.query<{ id: string }>('SELECT id FROM organizations')),
        db.query('SELECT id FROM organizations'),
      ]);
      expect(ids.map(result => result.rows)).toEqual([[{ id: alpha.organization }], [{ id: beta.organization }], []]);
      await expect(db.transaction({ core: true }, async tx => { await tx.query('SELECT id FROM organizations'); throw new Error('Abort core'); })).rejects.toThrow('Abort core');
      expect((await db.query('SELECT id FROM organizations')).rows).toEqual([]);
      const settings = await db.query<{ core: string; organization: string }>("SELECT current_setting('azuriya.core',true) AS core,current_setting('azuriya.organization_id',true) AS organization");
      expect(settings.rows).toEqual([{ core: 'false', organization: '' }]);
    });

    it('rejects executors retained after their transaction completes', async () => {
      let retained: Executor | undefined;
      await db.transaction({ core: true }, async tx => { retained = tx; });
      await expect(retained!.query('SELECT id FROM organizations')).rejects.toThrow('Transaction executor cannot be used after completion');
    });

    it('enforces normalized user identity, legal statuses, and unique idempotency claims', async () => {
      await expect(db.query('INSERT INTO users(id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)', [randomUUID(), 'Upper@example.test', 'hash', 'Invalid'])).rejects.toMatchObject({ code: '23514' });
      await expect(db.transaction({ core: true }, tx => tx.query('UPDATE organizations SET status = $1 WHERE id = $2', ['invented', alpha.organization]))).rejects.toMatchObject({ code: '23514' });
      const values = [randomUUID(), alpha.organization, user, 'request-key', 'POST /test', 'body-hash', 201, new Date(Date.now() + 60_000).toISOString()];
      await db.transaction({ organizationId: alpha.organization }, tx => tx.query('INSERT INTO idempotency_records(id,organization_id,actor_id,key,route,request_hash,status,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', values));
      await expect(db.transaction({ organizationId: alpha.organization }, tx => tx.query('INSERT INTO idempotency_records(id,organization_id,actor_id,key,route,request_hash,status,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), ...values.slice(1)]))).rejects.toMatchObject({ code: '23505' });
    });
  });
});

describe('PostgreSQL login privilege guard using real role metadata', () => {
  let postgres: PGlite;
  let executor: Executor;
  beforeAll(async () => {
    postgres = new PGlite();
    await postgres.waitReady;
    executor = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await postgres.query<T>(sql, params)).rows }) };
    await postgres.exec(`
      CREATE ROLE azuriya_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE unsafe_runtime_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE unsafe_runtime_table (id uuid);
      ALTER TABLE unsafe_runtime_table OWNER TO unsafe_runtime_test;
      CREATE ROLE unsafe_owner_group NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE unsafe_runtime_member NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT unsafe_owner_group TO unsafe_runtime_member;
      CREATE TABLE unsafe_member_table (id uuid);
      ALTER TABLE unsafe_member_table OWNER TO unsafe_owner_group;
      CREATE ROLE safe_runtime_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT azuriya_app TO safe_runtime_test;
    `);
  });
  afterAll(async () => { await postgres?.close(); });
  it('rejects a superuser login for the PostgreSQL network adapter', async () => {
    await expect(validateServerRuntimeLogin(executor)).rejects.toThrow('runtime login must be non-superuser');
  });
  it('rejects a non-superuser that owns tables before selecting the app role', async () => {
    await postgres.exec('SET SESSION AUTHORIZATION unsafe_runtime_test');
    try { await expect(validateServerRuntimeLogin(executor)).rejects.toThrow('runtime login must not own application tables'); }
    finally { await postgres.exec('RESET SESSION AUTHORIZATION'); }
  });
  it('rejects a runtime login that can assume a table-owner role', async () => {
    await postgres.exec('SET SESSION AUTHORIZATION unsafe_runtime_member');
    try { await expect(validateServerRuntimeLogin(executor)).rejects.toThrow('runtime login must not own application tables'); }
    finally { await postgres.exec('RESET SESSION AUTHORIZATION'); }
  });
  it('permits a dedicated non-owning non-superuser granted only the runtime role', async () => {
    await postgres.exec('SET SESSION AUTHORIZATION safe_runtime_test');
    try { await expect(validateServerRuntimeLogin(executor)).resolves.toBeUndefined(); }
    finally { await postgres.exec('RESET SESSION AUTHORIZATION'); }
  });
});

// These fixtures deliberately use independent tenant IDs: scope errors must fail in the database.
async function insertTenant(tx: Executor, label: string) {
  const organization = randomUUID(), brand = randomUUID(), environment = randomUUID();
  await tx.query('INSERT INTO organizations(id,name,slug,business_type) VALUES ($1,$2,$3,$4)', [organization, label, `${label}-${organization}`, 'brokerage']);
  await tx.query('INSERT INTO brands(id,organization_id,name) VALUES ($1,$2,$3)', [brand, organization, label]);
  await tx.query('INSERT INTO environments(id,organization_id,brand_id,name,kind) VALUES ($1,$2,$3,$4,$5)', [environment, organization, brand, 'Production', 'production']);
  return { organization, brand, environment };
}

describe('persistent embedded database lifecycle', () => {
  let directory: string | undefined;
  let db: Database;
  let tenant: Awaited<ReturnType<typeof insertTenant>>;

  // A fresh disk-backed PGlite instance and the complete schema migration can exceed
  // the ordinary 30-second test budget on Windows. Keep that setup in the hook,
  // which uses Vitest's 60-second hook timeout, while the assertions remain focused.
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'azuriya-db-'));
    db = await createDatabase({ dataDir: join(directory, 'nested', 'postgres') });
    await migrate(db);
    tenant = await db.transaction({ core: true }, tx => insertTenant(tx, 'persistent'));
    await db.close();
    db = await createDatabase({ dataDir: join(directory, 'nested', 'postgres') });
    await migrate(db);
  }, 60_000);

  afterAll(async () => {
    try { await db?.close(); }
    finally { if (directory) await rm(directory, { recursive: true, force: true }); }
  });

  it('persists committed tenant data and reapplies the runtime role when reopened', async () => {
    expect((await db.query('SELECT id FROM organizations')).rows).toEqual([]);
    const records = await db.transaction({ organizationId: tenant.organization }, tx => tx.query<{ name: string }>('SELECT name FROM organizations'));
    expect(records.rows).toEqual([{ name: 'persistent' }]);
    const role = await db.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
    );
    expect(role.rows).toEqual([{ current_user: 'azuriya_app', rolsuper: false, rolbypassrls: false }]);
  });
});
