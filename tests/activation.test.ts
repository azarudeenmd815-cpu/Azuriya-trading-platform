import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { ActivationService } from '../src/server/domain/activation-service.js';
import { InvitationService, invitationEmailHandler, type InvitationEmail } from '../src/server/domain/invitations.js';
import { OutboxWorker } from '../src/server/domain/outbox-worker.js';
import { buildApp } from '../src/server/app.js';
import { decryptSecret, hashPassword } from '../src/server/security/crypto.js';
import { totp } from '../src/server/security/totp.js';
import type { TenantContext } from '../src/shared/types.js';
import { permissions } from '../src/shared/types.js';

describe('activated identity, credentials and support', () => {
  let db: Database; let app: FastifyInstance; let tenant: TenantContext;
  const core = randomUUID(), owner = randomUUID(); const previousKey = process.env.SECRET_ENCRYPTION_KEY;
  const key = Buffer.alloc(32, 93).toString('base64'); let coreCookie = ''; let coreCsrf = '';
  beforeAll(async () => {
    process.env.SECRET_ENCRYPTION_KEY = key; db = await createDatabase(); await migrate(db); await seedCatalog(db);
    await db.transaction({ core: true }, async tx => {
      for (const [id, email, role] of [[core, 'activation-core@test.local', 'super_admin'], [owner, 'activation-owner@test.local', null]]) await tx.query('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5)', [id, email, await hashPassword('activation-test-password'), email, role]);
    });
    await new FoundationService(db).createOrganization({ core: true, userId: core, requestId: 'activation' }, { name: 'Activated tenant', slug: 'activated-tenant', business_type: 'brokerage', brand_name: 'Activated', environment_name: 'Sandbox', environment_kind: 'sandbox', products: ['brokerage-crm'], plan: 'test', owner_email: 'activation-owner@test.local' });
    const instance = (await db.transaction({ core: true }, tx => tx.query<{ id: string; organization_id: string; brand_id: string; environment_id: string }>('SELECT * FROM product_instances'))).rows[0];
    tenant = { core: false, userId: owner, requestId: 'activation', organizationId: instance.organization_id, brandId: instance.brand_id, environmentId: instance.environment_id, productInstanceId: instance.id, productSlug: 'brokerage-crm', permissions: [...permissions] };
    app = await buildApp({ db, origin: 'https://core.test', production: true, strictHosts: false, requireWorker: false });
  });
  afterAll(async () => { await app?.close(); await db?.close(); if (previousKey === undefined) delete process.env.SECRET_ENCRYPTION_KEY; else process.env.SECRET_ENCRYPTION_KEY = previousKey; });
  it('allows public login branding lookup even when a stale session cookie is present',async()=>{
    expect((await app.inject({url:'/api/v1/host-context',headers:{cookie:'azuriya_session=expired-session-token'}})).json().data.kind).toBe('core');
    expect((await app.inject({url:'/api/v1/auth/me',headers:{cookie:'azuriya_session=expired-session-token'}})).statusCode).toBe(401);
  });
  it('requires Core MFA, verifies enrollment, returns one-time recovery codes, and binds the session to its host', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'activation-core@test.local', password: 'activation-test-password' } });
    expect(login.statusCode).toBe(403); expect(login.json().error.code).toBe('MFA_REQUIRED'); expect(login.cookies).toHaveLength(0);
    const challenge = login.json().error.details[0].challenge_token as string;
    const setup = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/setup', payload: { challenge_token: challenge } });
    expect(setup.statusCode).toBe(200); expect(setup.json().data.qr_data_url).toMatch(/^data:image\/png/);
    const verified = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/verify', payload: { challenge_token: challenge, code: totp(setup.json().data.secret) } });
    expect(verified.statusCode).toBe(200); expect(verified.json().data.recovery_codes).toHaveLength(10);
    coreCookie = verified.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '); coreCsrf = verified.json().data.csrf_token;
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie: coreCookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie: coreCookie, host: 'different.test' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/verify', payload: { challenge_token: challenge, code: totp(setup.json().data.secret) } })).statusCode).toBe(401);
    const rows = (await db.transaction({ core: true }, tx => tx.query<{ secret_encrypted: string; recovery_hashes: string[] }>('SELECT * FROM mfa_accounts WHERE user_id=$1', [core]))).rows[0];
    expect(rows.secret_encrypted).not.toContain(setup.json().data.secret); expect(rows.recovery_hashes).not.toContain(verified.json().data.recovery_codes[0]);
    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'activation-core@test.local', password: 'activation-test-password' } });
    const recovery = verified.json().data.recovery_codes[0] as string;
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/verify', payload: { challenge_token: second.json().error.details[0].challenge_token, code: recovery } })).statusCode).toBe(200);
    const third = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'activation-core@test.local', password: 'activation-test-password' } });
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/verify', payload: { challenge_token: third.json().error.details[0].challenge_token, code: recovery } })).statusCode).toBe(401);
  });
  it('uses scoped hash-only service accounts, invalidates rotated secrets, and enforces application disablement', async () => {
    const service = new ActivationService(db, key);
    const application = await service.createApplication(tenant, { name: 'Reports', scopes: ['overview.read'] });
    const account = await service.createAccount(tenant, { name: 'Reporting worker', scopes: ['overview.read'], application_id: String(application.id) });
    const endpoint = `/api/v1/instances/${tenant.productInstanceId}/overview`;
    expect((await app.inject({ url: endpoint, headers: { authorization: `Bearer ${account.secret}` } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/v1/instances/${tenant.productInstanceId}/branding`, headers: { authorization: `Bearer ${account.secret}` } })).statusCode).toBe(403);
    const rotated = await service.rotateAccount(tenant, String(account.account.id));
    expect((await app.inject({ url: endpoint, headers: { authorization: `Bearer ${account.secret}` } })).statusCode).toBe(401);
    expect((await app.inject({ url: endpoint, headers: { authorization: `Bearer ${rotated.secret}` } })).statusCode).toBe(200);
    await service.updateApplication(tenant, String(application.id), { status: 'disabled' });
    expect((await app.inject({ url: endpoint, headers: { authorization: `Bearer ${rotated.secret}` } })).statusCode).toBe(401);
    const stored = await db.transaction({ core: true }, tx => tx.query('SELECT * FROM service_accounts WHERE id=$1', [account.account.id])); expect(JSON.stringify(stored.rows)).not.toContain(account.secret);
  });
  it('requires a tenant-approved support grant, audits use, and rejects revocation immediately', async () => {
    const url = `/api/v1/instances/${tenant.productInstanceId}/overview`;
    expect((await app.inject({ url, headers: { cookie: coreCookie } })).statusCode).toBe(403);
    const service = new ActivationService(db, key); const grant = await service.grantSupport(tenant, { user_id: core, reason: 'Investigate a reported dashboard issue', scopes: ['overview.read'], expires_at: new Date(Date.now() + 3600_000).toISOString() });
    const headers = { cookie: coreCookie, 'x-support-grant-id': String(grant.id), 'x-csrf-token': coreCsrf };
    expect((await app.inject({ url, headers })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/v1/instances/${tenant.productInstanceId}/branding`, headers })).statusCode).toBe(403);
    await service.revokeSupport(tenant, String(grant.id)); expect((await app.inject({ url, headers })).statusCode).toBe(403);
    expect((await db.transaction({ organizationId: tenant.organizationId }, tx => tx.query("SELECT id FROM audit_events WHERE action='support.access_used'"))).rows.length).toBeGreaterThan(0);
  });
  it('sends an encrypted invitation job, accepts it once and never returns a session before sign-in', async () => {
    const service = new InvitationService(db, 'http://localhost', false, key);
    const invite = await service.create(tenant, { email: 'invited@test.local', kind: 'client' });
    const event = (await db.transaction({ core: true }, tx => tx.query<{ payload: { encrypted_message: string } }>("SELECT payload FROM outbox_events WHERE event_type='invitation.email' ORDER BY created_at DESC LIMIT 1"))).rows[0];
    const message = JSON.parse(decryptSecret(event.payload.encrypted_message, key)) as InvitationEmail;
    const token = new URL(message.return_url).hash.slice('#token='.length);
    expect(JSON.stringify(event)).not.toContain(token); expect((await service.inspect(token)).email).toBe('invited@test.local');
    await expect(service.accept(token, { password: 'new-test-password-123', display_name: 'Client' }, 'test', randomUUID())).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
    expect(await service.accept(token, { password: 'new-test-password-123', display_name: 'Client' }, 'test')).toMatchObject({ accepted: true, sign_in_required: true });
    await expect(service.accept(token, { password: 'new-test-password-123', display_name: 'Client' }, 'test')).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
    let sent = 0; const worker = new OutboxWorker(db, { 'invitation.email': invitationEmailHandler(db, { send: async () => { sent++; } }, key) });
    for (let i = 0; i < 20; i++) if (!await worker.runOnce()) break;
    expect(sent).toBe(0); // Acceptance cancels an unsent email job; expired/rotated/revoked jobs are likewise suppressed.
    expect(invite.id).toBeTruthy();
  });
  async function tokenFor(id: string) {
    const events = (await db.transaction({core:true},tx=>tx.query<{payload:{encrypted_message:string}}>("SELECT payload FROM outbox_events WHERE event_type='invitation.email'"))).rows;
    const message = events.map(event=>JSON.parse(decryptSecret(event.payload.encrypted_message,key)) as InvitationEmail & {invitation_id:string}).find(message=>message.invitation_id===id)!;
    return new URL(message.return_url).hash.slice('#token='.length);
  }
  it('reactivates an approved client membership and rejects revoked, expired and wrong-portal invitations',async()=>{
    const service=new InvitationService(db,'http://localhost',false,key);
    await db.transaction({core:true},tx=>tx.query("UPDATE client_memberships SET status='disabled' WHERE product_instance_id=$1",[tenant.productInstanceId]));
    const invite=await service.create(tenant,{email:'invited@test.local',kind:'client'}); const token=await tokenFor(invite.id);
    await expect(service.inspect(token,tenant.productInstanceId,'admin_portal')).rejects.toMatchObject({code:'INVITATION_INVALID'});
    await service.accept(token,{password:'new-test-password-123',display_name:'Client'},'test',tenant.productInstanceId,'client_portal');
    expect((await db.transaction({core:true},tx=>tx.query<{status:string}>('SELECT status FROM client_memberships WHERE product_instance_id=$1',[tenant.productInstanceId]))).rows[0].status).toBe('active');
    const revoked=await service.create(tenant,{email:'revoked@test.local',kind:'client'});const revokedToken=await tokenFor(revoked.id);await service.change(tenant,revoked.id,false);await expect(service.inspect(revokedToken)).rejects.toMatchObject({code:'INVITATION_INVALID'});
    const expired=await service.create(tenant,{email:'expired@test.local',kind:'client'});const expiredToken=await tokenFor(expired.id);await db.transaction({core:true},tx=>tx.query("UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]));await expect(service.inspect(expiredToken)).rejects.toMatchObject({code:'INVITATION_INVALID'});
  });
  it('resolves concurrent invitations into one identity and assigns the approved staff role',async()=>{
    const service=new InvitationService(db,'http://localhost',false,key);const role=(await db.transaction({organizationId:tenant.organizationId},tx=>tx.query<{id:string}>('SELECT id FROM roles WHERE organization_id=$1 ORDER BY created_at LIMIT 1',[tenant.organizationId]))).rows[0];
    const first=await service.create(tenant,{email:'concurrent-invite@test.local',kind:'staff',role_id:role.id});const second=await service.create(tenant,{email:'concurrent-invite@test.local',kind:'staff',role_id:role.id});
    const tokens=await Promise.all([tokenFor(first.id),tokenFor(second.id)]);await Promise.all(tokens.map(token=>service.accept(token,{password:'concurrent-password-123',display_name:'Concurrent staff'},'test')));
    const rows=await db.transaction({core:true},tx=>tx.query<{role_id:string;status:string}>("SELECT m.role_id,m.status FROM staff_memberships m JOIN users u ON u.id=m.user_id WHERE u.email='concurrent-invite@test.local'"));expect(rows.rows).toEqual([{role_id:role.id,status:'active'}]);
  });
  it('invalidates existing sessions when a tenant owner policy starts requiring MFA',async()=>{
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{email:'activation-owner@test.local',password:'activation-test-password'},remoteAddress:'127.0.12.1'});expect(login.statusCode).toBe(200);
    const cookie=login.cookies.map(value=>`${value.name}=${value.value}`).join('; ');
    const response=await app.inject({method:'PUT',url:`/api/v1/instances/${tenant.productInstanceId}/security-policy`,headers:{cookie,'x-csrf-token':login.json().data.csrf_token},payload:{require_staff_mfa:false,role_ids:[],user_ids:[owner]}});expect(response.statusCode).toBe(200);
    expect((await app.inject({url:`/api/v1/instances/${tenant.productInstanceId}/overview`,headers:{cookie}})).json().error.code).toBe('MFA_REQUIRED');
    const next=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{email:'activation-owner@test.local',password:'activation-test-password'},remoteAddress:'127.0.12.2'});expect(next.statusCode).toBe(403);expect(next.json().error.details[0].enrollment_required).toBe(true);
  });
});
