import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { hashPassword, hashSecret, newSecret } from '../src/server/security/crypto.js';

describe('session policy and browser request boundaries', () => {
  const userId = randomUUID();
  const origin = 'https://azuriya.example.test';
  const organizationId = randomUUID(), brandId = randomUUID(), environmentId = randomUUID();
  const subscriptionId = randomUUID(), instanceId = randomUUID(), roleId = randomUUID();
  const apiSecret = `azk_${newSecret()}`;
  let productId = '';
  let loginCount = 0;
  let db: Database;
  let app: FastifyInstance;
  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    await db.query('INSERT INTO users(id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)', [userId, 'security@example.test', await hashPassword('strong-security-test-password'), 'Security Test']);
    await db.transaction({ core: true }, async tx => {
      productId = (await tx.query<{ id: string }>("SELECT id FROM products WHERE slug='brokerage-crm'")).rows[0].id;
      await tx.query("INSERT INTO organizations(id,name,slug,business_type) VALUES($1,'Security Tenant','security-tenant','brokerage')", [organizationId]);
      await tx.query("INSERT INTO brands(id,organization_id,name) VALUES($1,$2,'Security Brand')", [brandId, organizationId]);
      await tx.query("INSERT INTO environments(id,organization_id,brand_id,name,kind) VALUES($1,$2,$3,'Sandbox','sandbox')", [environmentId, organizationId, brandId]);
      await tx.query("INSERT INTO product_subscriptions(id,organization_id,product_id,plan) VALUES($1,$2,$3,'foundation')", [subscriptionId, organizationId, productId]);
      await tx.query("INSERT INTO product_instances(id,organization_id,brand_id,environment_id,subscription_id,product_id,name) VALUES($1,$2,$3,$4,$5,$6,'Security CRM')", [instanceId, organizationId, brandId, environmentId, subscriptionId, productId]);
      await tx.query("INSERT INTO roles(id,organization_id,name) VALUES($1,$2,'Reader')", [roleId, organizationId]);
      await tx.query("INSERT INTO role_permissions(organization_id,role_id,permission_code) VALUES($1,$2,'overview.read')", [organizationId, roleId]);
      await tx.query('INSERT INTO staff_memberships(id,organization_id,user_id,role_id) VALUES($1,$2,$3,$4)', [randomUUID(), organizationId, userId, roleId]);
      await tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), organizationId, userId, instanceId]);
      await tx.query("INSERT INTO api_keys(id,organization_id,brand_id,environment_id,product_instance_id,name,prefix,secret_hash,scopes,created_by) VALUES($1,$2,$3,$4,$5,'Integration reader','azk_',$6,$7::jsonb,$8)", [randomUUID(), organizationId, brandId, environmentId, instanceId, hashSecret(apiSecret), JSON.stringify(['integrations.read']), userId]);
    });
    // This suite isolates cookie/origin policy; strict host mapping is exercised by its own suite.
    app = await buildApp({ db, origin, production: true, strictHosts: false, requireCoreMfa: false });
  });
  afterAll(async () => { await app?.close(); await db?.close(); });

  async function login() {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: `127.0.1.${++loginCount}`, headers: { origin }, payload: { email: 'security@example.test', password: 'strong-security-test-password' } });
    expect(response.statusCode).toBe(200);
    return { response, cookie: response.cookies.map(value => `${value.name}=${value.value}`).join('; '), csrf: response.json().data.csrf_token as string };
  }

  it('sets Secure, HttpOnly and SameSite cookies in production', async () => {
    const { response } = await login();
    const headers = response.headers['set-cookie'];
    expect(Array.isArray(headers) ? headers.length : 0).toBe(2);
    for (const header of (Array.isArray(headers) ? headers : [])) {
      expect(header).toMatch(/; Secure(?:;|$)/i);
      expect(header).toMatch(/; HttpOnly(?:;|$)/i);
      expect(header).toMatch(/; SameSite=Strict(?:;|$)/i);
    }
  });

  it('rejects login from a foreign origin and from a cross-site browser context', async () => {
    for (const headers of [{ origin: 'https://attacker.example.test' }, { 'sec-fetch-site': 'cross-site' }]) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers, payload: { email: 'security@example.test', password: 'strong-security-test-password' } });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('ORIGIN_FORBIDDEN');
      expect(response.cookies).toEqual([]);
    }
  });

  it('requires the session-bound CSRF token and a trusted origin for logout', async () => {
    const { cookie, csrf } = await login();
    const forged = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin, 'x-csrf-token': 'forged-token' } });
    expect(forged.statusCode).toBe(403);
    const foreign = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin: 'https://attacker.example.test', 'x-csrf-token': csrf } });
    expect(foreign.statusCode).toBe(403);
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin, 'x-csrf-token': csrf } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('blocks an existing session as soon as MFA becomes required', async () => {
    const { cookie } = await login();
    try {
      await db.query('UPDATE users SET mfa_required=true WHERE id=$1', [userId]);
      const response = await app.inject({ url: '/api/v1/auth/me', headers: { cookie } });
      expect([401, 403]).toContain(response.statusCode);
      expect(['UNAUTHENTICATED', 'MFA_REQUIRED']).toContain(response.json().error.code);
    } finally { await db.query('UPDATE users SET mfa_required=false WHERE id=$1', [userId]); }
  });

  it('blocks disabled users with previously issued sessions', async () => {
    const { cookie } = await login();
    try {
      await db.query("UPDATE users SET status='disabled' WHERE id=$1", [userId]);
      expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
    } finally { await db.query("UPDATE users SET status='active' WHERE id=$1", [userId]); }
  });

  it('does not expose full tenant context to a narrowly scoped API credential', async () => {
    const response = await app.inject({ url: `/api/v1/instances/${instanceId}/context`, headers: { authorization: `Bearer ${apiSecret}` } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('PERMISSION_DENIED');
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { authorization: `Bearer ${apiSecret}` } })).statusCode).toBe(403);
  });

  it('denies business and client context when the brand or product is disabled', async () => {
    const { cookie } = await login();
    for (const [table, entityId] of [['brands', brandId], ['products', productId]]) {
      try {
        await db.transaction({ core: true }, tx => tx.query(`UPDATE ${table} SET status='disabled' WHERE id=$1`, [entityId]));
        expect((await app.inject({ url: `/api/v1/instances/${instanceId}/context`, headers: { cookie } })).statusCode).toBe(403);
        expect((await app.inject({ url: `/api/v1/client/instances/${instanceId}/context`, headers: { cookie } })).statusCode).toBe(403);
      } finally { await db.transaction({ core: true }, tx => tx.query(`UPDATE ${table} SET status='active' WHERE id=$1`, [entityId])); }
    }
  });

  it('excludes suspended subscriptions from staff and client membership discovery', async () => {
    const { cookie } = await login();
    try {
      await db.transaction({ core: true }, tx => tx.query("UPDATE product_subscriptions SET status='suspended' WHERE id=$1", [subscriptionId]));
      const response = await app.inject({ url: '/api/v1/auth/me', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.memberships).toEqual([]);
      expect(response.json().data.client_memberships).toEqual([]);
    } finally { await db.transaction({ core: true }, tx => tx.query("UPDATE product_subscriptions SET status='active' WHERE id=$1", [subscriptionId])); }
  });

  it('excludes disabled environments from client membership discovery', async () => {
    const { cookie } = await login();
    try {
      await db.transaction({ core: true }, tx => tx.query("UPDATE environments SET status='disabled' WHERE id=$1", [environmentId]));
      const response = await app.inject({ url: '/api/v1/auth/me', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.memberships).toEqual([]);
      expect(response.json().data.client_memberships).toEqual([]);
    } finally { await db.transaction({ core: true }, tx => tx.query("UPDATE environments SET status='active' WHERE id=$1", [environmentId])); }
  });

  it('prevents a staff manager from reactivating a role with greater privileges', async () => {
    const targetUser = randomUUID(), targetRole = randomUUID(), membership = randomUUID();
    await db.transaction({ core: true }, async tx => {
      await tx.query("INSERT INTO role_permissions(organization_id,role_id,permission_code) VALUES($1,$2,'staff.write')", [organizationId, roleId]);
      await tx.query("INSERT INTO users(id,email,password_hash,display_name) VALUES($1,'disabled-manager@example.test','hash','Disabled Manager')", [targetUser]);
      await tx.query("INSERT INTO roles(id,organization_id,name) VALUES($1,$2,'Privileged Manager')", [targetRole, organizationId]);
      await tx.query("INSERT INTO role_permissions(organization_id,role_id,permission_code) VALUES($1,$2,'roles.write')", [organizationId, targetRole]);
      await tx.query("INSERT INTO staff_memberships(id,organization_id,user_id,role_id,environment_id,product_instance_id,status) VALUES($1,$2,$3,$4,$5,$6,'suspended')", [membership, organizationId, targetUser, targetRole, environmentId, instanceId]);
    });
    const { cookie, csrf } = await login();
    const response = await app.inject({ method: 'PATCH', url: `/api/v1/instances/${instanceId}/staff/${membership}`, headers: { cookie, origin, 'x-csrf-token': csrf }, payload: { status: 'active' } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('PERMISSION_DENIED');
    const state = await db.transaction({ core: true }, tx => tx.query<{ status: string }>('SELECT status FROM staff_memberships WHERE id=$1', [membership]));
    expect(state.rows).toEqual([{ status: 'suspended' }]);
  });

  it('keeps a Core identity out of customer portals even with a forged client membership', async () => {
    const coreUser = randomUUID();
    await db.transaction({ core: true }, async tx => {
      await tx.query("INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,'core-security@example.test',$2,'Core Security','super_admin')", [coreUser, await hashPassword('strong-security-test-password')]);
      await tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), organizationId, coreUser, instanceId]);
    });
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: `127.0.1.${++loginCount}`, headers: { origin }, payload: { email: 'core-security@example.test', password: 'strong-security-test-password' } });
    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.map(value => `${value.name}=${value.value}`).join('; ');
    expect((await app.inject({ url: `/api/v1/client/instances/${instanceId}/context`, headers: { cookie } })).statusCode).toBe(403);
  });

  it('rejects assigning a Core identity as a customer and creates no membership', async () => {
    const assigningCore = randomUUID(), targetCore = randomUUID();
    await db.transaction({ core: true }, async tx => {
      await tx.query("INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,'assigning-core@example.test',$2,'Assigning Core','super_admin'),($3,'target-core@example.test','hash','Target Core','super_admin')", [assigningCore, await hashPassword('strong-security-test-password'), targetCore]);
    });
    const loginResponse = await app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: `127.0.1.${++loginCount}`, headers: { origin }, payload: { email: 'assigning-core@example.test', password: 'strong-security-test-password' } });
    expect(loginResponse.statusCode).toBe(200);
    const cookie = loginResponse.cookies.map(value => `${value.name}=${value.value}`).join('; ');
    const response = await app.inject({ method: 'POST', url: '/api/v1/core/client-memberships', headers: { cookie, origin, 'x-csrf-token': loginResponse.json().data.csrf_token }, payload: { user_id: targetCore, product_instance_id: instanceId } });
    expect([403, 422]).toContain(response.statusCode);
    const rows = await db.transaction({ core: true }, tx => tx.query('SELECT id FROM client_memberships WHERE user_id=$1', [targetCore]));
    expect(rows.rows).toEqual([]);
  });

  it('limits repeated invalid login attempts and returns a traced safe error', async () => {
    const isolated = await buildApp({ db, origin, production: true, strictHosts: false });
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        expect((await isolated.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.4.1', headers: { origin }, payload: { email: 'unknown@example.test', password: 'incorrect-password' } })).statusCode).toBe(401);
      }
      const limited = await isolated.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.4.1', headers: { origin }, payload: { email: 'unknown@example.test', password: 'incorrect-password' } });
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error).toMatchObject({ code: 'RATE_LIMITED', details: [] });
      expect(limited.json().error.request_id).toBeTruthy();
      expect(limited.body).not.toContain('password_hash');
    } finally { await isolated.close(); }
  });
});
