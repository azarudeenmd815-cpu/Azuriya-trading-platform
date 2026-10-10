import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../src/server/db/database.js';
import { createDatabase } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { buildApp } from '../src/server/app.js';
import { FoundationService } from '../src/server/domain/service.js';
import { ExternalApiService } from '../src/server/external-api/service.js';
import { hashPassword } from '../src/server/security/crypto.js';
import { permissions, type Row, type TenantContext } from '../src/shared/types.js';

describe('W08 external developer API', () => {
  let db: Database;
  let app: FastifyInstance;
  let first: TenantContext;
  let second: TenantContext;
  let cookie = '';
  let csrf = '';
  const ownerId = randomUUID();
  const password = 'external-api-owner-password';
  const email = ['external-api-owner', 'test.local'].join('@');

  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    const passwordHash = await hashPassword(password);
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [ownerId, email, passwordHash, 'External API Owner']));
    const foundation = new FoundationService(db);
    for (const slug of ['external-api-alpha', 'external-api-beta']) {
      const organization = await foundation.createOrganization({ core: true, userId: ownerId, requestId: randomUUID() }, { name: slug, slug, business_type: 'brokerage', brand_name: slug, environment_name: 'Sandbox', environment_kind: 'sandbox', products: ['brokerage-crm'], plan: 'test', owner_email: email });
      const instance = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT * FROM product_instances WHERE organization_id=$1', [organization.id]))).rows[0];
      const scope: TenantContext = { core: false, userId: ownerId, requestId: randomUUID(), organizationId: String(organization.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
      if (!first) first = scope; else second = scope;
    }
    app = await buildApp({ db, origin: 'http://localhost', production: false, requireWorker: false });
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = login.cookies.map(value => `${value.name}=${value.value}`).join('; ');
    csrf = login.json().data.csrf_token;
  });

  afterAll(async () => { await app?.close(); await db?.close(); });

  it('creates a one-time scoped credential and lists metadata without secrets', async () => {
    const unauthenticated = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, payload: { name: 'Unauthenticated', scopes: ['accounts:read'] } });
    expect(unauthenticated.statusCode, unauthenticated.body).toBe(401);
    const unsupported = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { cookie, 'x-csrf-token': csrf }, payload: { name: 'Unsupported', scopes: ['api.read'] } });
    expect(unsupported.statusCode, unsupported.body).toBe(400);
    const created = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { cookie, 'x-csrf-token': csrf }, payload: { name: 'CRM read access', scopes: ['accounts:read'] } });
    expect(created.statusCode, created.body).toBe(201);
    const body = created.json().data;
    expect(body.secret).toMatch(/^azk_[A-Za-z0-9_-]{43}$/);
    expect(body.credential).toMatchObject({ name: 'CRM read access', scopes: ['accounts:read'], product_instance_id: first.productInstanceId });
    const listing = await app.inject({ url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { cookie } });
    expect(listing.statusCode, listing.body).toBe(200);
    expect(listing.body).not.toContain(body.secret);
    expect(listing.body).not.toContain('secret_hash');
    const stored = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT secret_hash FROM api_keys WHERE id=$1', [body.credential.id]))).rows[0];
    expect(stored.secret_hash).not.toBe(body.secret);
    expect(String(stored.secret_hash)).toHaveLength(64);
  });

  it('enforces Bearer auth, scope denial, tenant isolation, expiry, and revocation', async () => {
    const service = new ExternalApiService(db);
    const credential = await service.createCredential(first, { name: 'External accounts', scopes: ['accounts:read'] });
    const secret = credential.secret;
    expect((await app.inject({ url: '/api/external/v1/accounts' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { cookie } })).statusCode).toBe(401);
    const list = await app.inject({ url: '/api/external/v1/accounts?limit=1&offset=0', headers: { authorization: `Bearer ${secret}` } });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().pagination).toEqual({ total: 0, limit: 1, offset: 0 });
    expect((await app.inject({ url: `/api/external/v1/accounts/${randomUUID()}`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts?organization_id=${second.organizationId}`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(400);
    const crossCredential = await service.createCredential(second, { name: 'Second tenant', scopes: ['accounts:read'] });
    expect((await app.inject({ url: `/api/v1/instances/${second.productInstanceId}/external-credentials`, headers: { cookie } })).json().data).toHaveLength(1);
    await service.revokeCredential(first, String(credential.credential.id));
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(401);
    const expired = await service.createCredential(first, { name: 'Expired', scopes: ['accounts:read'], expires_at: new Date(Date.now() + 1000).toISOString() });
    await db.transaction({ core: true }, tx => tx.query('UPDATE api_keys SET expires_at=now()-interval \'1 second\' WHERE id=$1', [expired.credential.id]));
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: `Bearer ${expired.secret}` } })).statusCode).toBe(401);
    const noScope = await db.transaction({ core: true }, async tx => {
      const id = randomUUID(); const raw = `azk_${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '').slice(0, 11)}`;
      const hash = (await import('node:crypto')).createHash('sha256').update(raw).digest('hex');
      await tx.query('INSERT INTO api_keys(id,organization_id,brand_id,environment_id,product_instance_id,name,prefix,secret_hash,scopes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, 'No account scope', raw.slice(0, 12), hash, JSON.stringify(['api.read']), ownerId]);
      return raw;
    });
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: `Bearer ${noScope}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: 'Bearer malformed' } })).statusCode).toBe(401);
    expect(crossCredential.secret).not.toBe(secret);
  });
});
