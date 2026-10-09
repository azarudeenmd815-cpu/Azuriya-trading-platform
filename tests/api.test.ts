import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { buildApp } from '../src/server/app.js';
import { hashPassword } from '../src/server/security/crypto.js';
import type { FastifyInstance } from 'fastify';

describe('HTTP authorization and tenant boundaries', () => {
  let db: Database;
  let app: FastifyInstance;
  let coreCookie = '';
  let csrf = '';
  let staffCookie = '';
  let staffCsrf = '';
  let clientCookie = '';
  let instanceA = '';
  let instanceB = '';
  const coreId = randomUUID();
  const staffId = randomUUID();
  const clientId = randomUUID();
  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    await db.transaction({ core: true }, async tx => {
      for (const [id, email, core] of [[coreId, 'core@test.local', 'super_admin'], [staffId, 'owner@test.local', null], [clientId, 'client@test.local', null]]) {
        await tx.query('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5)', [id, email, await hashPassword('secure-test-password'), email, core]);
      }
    });
    app = await buildApp({ db, origin: 'http://localhost', production: false });
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'core@test.local', password: 'secure-test-password' } });
    expect(login.statusCode).toBe(200);
    coreCookie = login.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    csrf = login.json().data.csrf_token;
  });
  afterAll(async () => { await app?.close(); await db?.close(); });
  it('requires real authentication and returns a traced standard error', async () => {
    const response = await app.inject('/api/v1/core/organizations');
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
    expect(response.json().error.request_id).toBeTruthy();
  });
  it('rejects mutations without CSRF and untrusted origins', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/core/organizations', headers: { cookie: coreCookie }, payload: {} });
    expect(response.statusCode).toBe(403);
    const originResponse = await app.inject({ method: 'POST', url: '/api/v1/core/organizations', headers: { cookie: coreCookie, 'x-csrf-token': csrf, origin: 'https://attacker.example' }, payload: {} });
    expect(originResponse.statusCode).toBe(403);
  });
  it('provisions organizations and authorizes only their assigned staff', async () => {
    const headers = { cookie: coreCookie, 'x-csrf-token': csrf };
    for (const [name, slug, owner] of [['Alpha Funding', 'alpha-funding', 'owner@test.local'], ['Beta Markets', 'beta-markets', undefined]]) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/core/organizations', headers, payload: { name, slug, business_type: 'hybrid', brand_name: name, environment_name: 'Sandbox', environment_kind: 'sandbox', products: ['brokerage-crm', 'prop-crm'], plan: 'foundation', ...(owner ? { owner_email: owner } : {}) } });
      expect(response.statusCode, response.body).toBe(201);
    }
    const instances = await app.inject({ url: '/api/v1/core/product-instances', headers: { cookie: coreCookie } });
    const rows = instances.json().data as Array<Record<string, string>>;
    const organizations = (await app.inject({ url: '/api/v1/core/organizations', headers: { cookie: coreCookie } })).json().data as Array<Record<string, string>>;
    const orgA = organizations.find(row => row.slug === 'alpha-funding')!.id;
    instanceA = rows.find(row => row.organization_id === orgA)!.id;
    instanceB = rows.find(row => row.organization_id !== orgA)!.id;
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'owner@test.local', password: 'secure-test-password' } });
    staffCookie = login.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    staffCsrf = login.json().data.csrf_token;
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie: staffCookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/v1/instances/${instanceB}/context`, headers: { cookie: staffCookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/v1/core/organizations', headers: { cookie: staffCookie } })).statusCode).toBe(403);
  });
  it('rejects forged request-body tenancy and spoofed host context', async () => {
    const response = await app.inject({ method: 'POST', url: `/api/v1/instances/${instanceA}/domains`, headers: { cookie: staffCookie, 'x-csrf-token': staffCsrf, host: 'other.example', 'x-organization-id': randomUUID() }, payload: { hostname: 'alpha.example.com', application_type: 'admin_portal', organization_id: randomUUID() } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
    const forged = await app.inject({ method: 'POST', url: `/api/v1/instances/${instanceA}/domains`, headers: { cookie: staffCookie, 'x-csrf-token': staffCsrf }, payload: { hostname: 'alpha.example.com', application_type: 'admin_portal', organization_id: randomUUID() } });
    expect(forged.statusCode).toBe(400);
    expect(forged.json().error.code).toBe('VALIDATION_ERROR');
  });
  it('persists branding while allowing optional asset URLs to be cleared', async () => {
    const response = await app.inject({ method: 'PATCH', url: `/api/v1/instances/${instanceA}/branding`, headers: { cookie: staffCookie, 'x-csrf-token': staffCsrf }, payload: { business_name: 'Alpha Funding', primary_color: '#3A967C', logo_url: '', dark_logo_url: '', light_logo_url: '', favicon_url: '', support_url: '', terms_url: '', privacy_url: '' } });
    expect(response.statusCode, response.body).toBe(200);
    const brand = (await app.inject({ url: `/api/v1/instances/${instanceA}/branding`, headers: { cookie: staffCookie } })).json().data;
    expect(brand.config.primary_color).toBe('#3A967C');
    const invalid = await app.inject({ method: 'PATCH', url: `/api/v1/instances/${instanceA}/branding`, headers: { cookie: staffCookie, 'x-csrf-token': staffCsrf }, payload: { business_name: 'Alpha Funding', primary_color: '#3A967C', support_url: 'not a URL' } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
  });
  it('hashes API credentials, enforces scopes, and revokes authentication', async () => {
    const response = await app.inject({ method: 'POST', url: `/api/v1/instances/${instanceA}/api-keys`, headers: { cookie: staffCookie, 'x-csrf-token': staffCsrf }, payload: { name: 'Integration reader', scopes: ['integrations.read'] } });
    expect(response.statusCode, response.body).toBe(201);
    const { key, secret } = response.json().data;
    expect(key.secret_hash).toBeUndefined();
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/v1/client/profile', headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/integrations`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/domains`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/v1/instances/${instanceB}/integrations`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(403);
    await app.inject({ method: 'DELETE', url: `/api/v1/instances/${instanceA}/api-keys/${key.id}`, headers: { cookie: staffCookie, 'x-csrf-token': staffCsrf } });
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/integrations`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(401);
  });
  it('separates customer authentication from business and Core administration', async () => {
    const context = (await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie: staffCookie } })).json().data;
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), context.organization.id, clientId, instanceA]));
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'client@test.local', password: 'secure-test-password' } });
    clientCookie = login.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    expect((await app.inject({ url: `/api/v1/client/instances/${instanceA}/context`, headers: { cookie: clientCookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie: clientCookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/v1/client/instances/${instanceB}/context`, headers: { cookie: clientCookie } })).statusCode).toBe(403);
  });
  it('does not grant unrestricted Core impersonation access to tenant portals', async () => {
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie: coreCookie } })).statusCode).toBe(403);
  });
  it('assigns initial tenant staff after provisioning without crossing organization roles or Core identities', async () => {
    const headers = { cookie: coreCookie, 'x-csrf-token': csrf };
    const identity = await app.inject({ method: 'POST', url: '/api/v1/core/users', headers, payload: { email: 'late-owner@test.local', display_name: 'Late Owner', password: 'late-owner-test-password' } });
    expect(identity.statusCode).toBe(201);
    const contextA = (await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie: staffCookie } })).json().data;
    const instances = (await app.inject({ url: '/api/v1/core/product-instances', headers: { cookie: coreCookie } })).json().data as Array<Record<string, string>>;
    const organizationB = instances.find(row => row.id === instanceB)!.organization_id;
    const roles = (await app.inject({ url: '/api/v1/core/roles', headers: { cookie: coreCookie } })).json().data as Array<Record<string, string>>;
    const roleA = roles.find(row => row.organization_id === contextA.organization.id)!.id;
    const roleB = roles.find(row => row.organization_id === organizationB)!.id;
    const assign = (userId: string, roleId: string, cookie = coreCookie, token = csrf) => app.inject({ method: 'POST', url: '/api/v1/core/staff-memberships', headers: { cookie, 'x-csrf-token': token }, payload: { user_id: userId, role_id: roleId, product_instance_id: instanceB } });
    expect((await assign(identity.json().data.id, roleA)).statusCode).toBe(422);
    expect((await assign(coreId, roleB)).statusCode).toBe(403);
    expect((await assign(identity.json().data.id, roleB, staffCookie, staffCsrf)).statusCode).toBe(403);
    const assigned = await assign(identity.json().data.id, roleB);
    expect(assigned.statusCode, assigned.body).toBe(201);
    expect(assigned.json().data.organization_id).toBe(organizationB);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'late-owner@test.local', password: 'late-owner-test-password' } });
    const cookie = login.cookies.map(value => `${value.name}=${value.value}`).join('; ');
    expect((await app.inject({ url: `/api/v1/instances/${instanceB}/context`, headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie } })).statusCode).toBe(403);
    const audit = (await app.inject({ url: '/api/v1/core/audit-events', headers: { cookie: coreCookie } })).json().data as Array<Record<string, string>>;
    expect(audit.some(row => row.action === 'staff.added' && row.organization_id === organizationB)).toBe(true);
  });
  it('rejects expired sessions and fails closed for MFA-required users', async () => {
    await db.query('UPDATE sessions SET expires_at=now()-interval \'1 minute\' WHERE user_id=$1', [clientId]);
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie: clientCookie } })).statusCode).toBe(401);
    await db.query('UPDATE users SET mfa_required=true WHERE id=$1', [clientId]);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'client@test.local', password: 'secure-test-password' } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('MFA_REQUIRED');
  });
  it('blocks disabled brand and product access and hides suspended subscriptions', async () => {
    const contextResponse = await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie: staffCookie } });
    const context = contextResponse.json().data;
    await db.transaction({ core: true }, tx => tx.query('UPDATE brands SET status=$1 WHERE id=$2', ['disabled', context.brand.id]));
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie: staffCookie } })).statusCode).toBe(403);
    await db.transaction({ core: true }, tx => tx.query('UPDATE brands SET status=$1 WHERE id=$2', ['active', context.brand.id]));
    await db.transaction({ core: true }, tx => tx.query('UPDATE products SET status=$1 WHERE id=$2', ['disabled', context.product.id]));
    expect((await app.inject({ url: `/api/v1/instances/${instanceA}/context`, headers: { cookie: staffCookie } })).statusCode).toBe(403);
    await db.transaction({ core: true }, tx => tx.query('UPDATE products SET status=$1 WHERE id=$2', ['active', context.product.id]));
    await db.transaction({ core: true }, tx => tx.query('UPDATE product_subscriptions SET status=$1 WHERE organization_id=$2', ['suspended', context.organization.id]));
    const me = await app.inject({ url: '/api/v1/auth/me', headers: { cookie: staffCookie } });
    expect(me.json().data.memberships).toHaveLength(0);
    await db.transaction({ core: true }, tx => tx.query('UPDATE product_subscriptions SET status=$1 WHERE organization_id=$2', ['active', context.organization.id]));
  });
  it('invalidates the server-side session on logout', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: staffCookie, 'x-csrf-token': staffCsrf } });
    expect(response.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie: staffCookie } })).statusCode).toBe(401);
  });
});
