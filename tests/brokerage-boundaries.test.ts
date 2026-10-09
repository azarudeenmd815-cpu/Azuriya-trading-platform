import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDatabase, type Database, type Executor } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { ActivationService } from '../src/server/domain/activation-service.js';
import { OutboxWorker, type OutboxEvent } from '../src/server/domain/outbox-worker.js';
import { fanoutWebhooks } from '../src/server/domain/webhook-worker.js';
import { BrokerageClientsService } from '../src/server/brokerage/clients.js';
import { BrokerageFinanceService } from '../src/server/brokerage/finance.js';
import { brokerageEmailHandler, renderTemplate } from '../src/server/brokerage/communications.js';
import { recordEvent, scopeValues } from '../src/server/brokerage/common.js';
import { buildApp } from '../src/server/app.js';
import { decryptSecret, hashPassword } from '../src/server/security/crypto.js';
import { totp } from '../src/server/security/totp.js';
import { permissions, type Row, type TenantContext } from '../src/shared/types.js';

describe('Brokerage HTTP, communication and note-history boundaries', () => {
  let db: Database; let app: FastifyInstance; let clients: BrokerageClientsService;
  let first: TenantContext; let second: TenantContext;
  let ownerCookie = ''; let ownerCsrf = ''; let readerCookie = ''; let clientCookie = ''; let clientCsrf = '';
  let staffNote: Row; let privateNote: Row; let sharedFormerPrivate: Row; let deletedNote: Row;
  const ownerId = randomUUID(), readerId = randomUUID(), userId = randomUUID(), otherUserId = randomUUID();
  const clientId = randomUUID(), otherClientId = randomUUID();
  const password = 'brokerage-boundary-password';
  const key = Buffer.alloc(32, 71).toString('base64'); const previousKey = process.env.SECRET_ENCRYPTION_KEY;
  const base = () => `/api/v1/instances/${first.productInstanceId}/brokerage`;
  const portal = () => `/api/v1/client/instances/${first.productInstanceId}/brokerage`;
  const historyUrl = (note: Row, client = clientId) => `${base()}/clients/${client}/notes/${note.id}/history`;
  const ownerHeaders = () => ({ cookie: ownerCookie, 'x-csrf-token': ownerCsrf, 'idempotency-key': randomUUID() });
  beforeAll(async () => {
    process.env.SECRET_ENCRYPTION_KEY = key;
    db = await createDatabase(); await migrate(db); await seedCatalog(db);
    const hash = await hashPassword(password);
    await db.transaction({ core: true }, async tx => {
      for (const [id, email, name] of [[ownerId, 'boundary-owner@test.local', 'Boundary Owner'], [readerId, 'boundary-reader@test.local', 'Boundary Reader'], [userId, 'boundary-client@test.local', 'Boundary Client'], [otherUserId, 'boundary-other@test.local', 'Other Client']]) await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [id, email, hash, name]);
    });
    const foundation = new FoundationService(db);
    for (const slug of ['boundary-alpha', 'boundary-beta']) {
      const organization = await foundation.createOrganization({ core: true, userId: ownerId, requestId: randomUUID() }, { name: slug, slug, business_type: 'brokerage', brand_name: slug, environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'test', owner_email: 'boundary-owner@test.local' });
      const instance = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT * FROM product_instances WHERE organization_id=$1', [organization.id]))).rows[0];
      const scope: TenantContext = { core: false, userId: ownerId, requestId: randomUUID(), organizationId: String(organization.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
      if (!first) first = scope; else second = scope;
    }
    await db.transaction({ core: true }, async tx => {
      const role = randomUUID();
      await tx.query('INSERT INTO roles(id,organization_id,name) VALUES($1,$2,$3)', [role, first.organizationId, 'Limited note reader']);
      for (const permission of ['brokerage.clients.read', 'brokerage.notes.read', 'brokerage.notes.write']) await tx.query('INSERT INTO role_permissions(organization_id,role_id,permission_code) VALUES($1,$2,$3)', [first.organizationId, role, permission]);
      await tx.query('INSERT INTO staff_memberships(id,organization_id,user_id,role_id,environment_id,product_instance_id) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), first.organizationId, readerId, role, first.environmentId, first.productInstanceId]);
      for (const [id, user, email] of [[clientId, userId, 'boundary-client@test.local'], [otherClientId, otherUserId, 'boundary-other@test.local']]) {
        await tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), first.organizationId, user, first.productInstanceId]);
        await tx.query("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,birth_date,kyc_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active','GB','1990-01-01','approved')", [id, ...scopeValues(first), user, `CLI-${id}`, user === userId ? 'Boundary Client' : 'Other Client', email]);
      }
    });
    clients = new BrokerageClientsService(db);
    staffNote = await clients.createNote(first, clientId, { text: 'Initial staff note', visibility: 'staff' });
    await clients.updateNote(first, clientId, String(staffNote.id), { text: 'Revised staff note' });
    privateNote = await clients.createNote(first, clientId, { text: 'Private investigation details', visibility: 'private' });
    sharedFormerPrivate = await clients.createNote(first, clientId, { text: 'Formerly private secret', visibility: 'private' });
    await clients.updateNote(first, clientId, String(sharedFormerPrivate.id), { text: 'Shared operational summary', visibility: 'staff' });
    deletedNote = await clients.createNote(first, clientId, { text: 'Deleted staff note' });
    await clients.deleteNote(first, clientId, String(deletedNote.id));
    app = await buildApp({ db, origin: 'http://localhost', production: false, requireWorker: false });
    for (const [email, kind] of [['boundary-owner@test.local', 'owner'], ['boundary-reader@test.local', 'reader'], ['boundary-client@test.local', 'client']] as const) {
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
      expect(login.statusCode, login.body).toBe(200);
      const cookie = login.cookies.map(c => `${c.name}=${c.value}`).join('; '); const csrf = login.json().data.csrf_token;
      if (kind === 'owner') { ownerCookie = cookie; ownerCsrf = csrf; }
      else if (kind === 'reader') { readerCookie = cookie; }
      else { clientCookie = cookie; clientCsrf = csrf; }
    }
  });
  afterAll(async () => { await app?.close(); await db?.close(); if (previousKey === undefined) delete process.env.SECRET_ENCRYPTION_KEY; else process.env.SECRET_ENCRYPTION_KEY = previousKey; });

  it('returns authenticated note revisions and author/editor names', async () => {
    const notes = await app.inject({ url: `${base()}/clients/${clientId}/notes`, headers: { cookie: readerCookie } });
    expect(notes.statusCode, notes.body).toBe(200);
    expect(notes.json().data.find((note: Row) => note.id === staffNote.id).author_name).toBe('Boundary Owner');
    const result = await app.inject({ url: historyUrl(staffNote), headers: { cookie: readerCookie } });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().data).toHaveLength(2);
    expect(result.json().data.every((revision: Row) => revision.editor_name === 'Boundary Owner')).toBe(true);
    expect(result.json().data.map((revision: Row) => revision.text)).toEqual(expect.arrayContaining(['Initial staff note', 'Revised staff note']));
  });
  it('keeps private notes and private historical revisions author-only', async () => {
    expect((await app.inject({ url: historyUrl(privateNote), headers: { cookie: readerCookie } })).statusCode).toBe(404);
    const shared = await app.inject({ url: historyUrl(sharedFormerPrivate), headers: { cookie: readerCookie } });
    expect(shared.statusCode, shared.body).toBe(200);
    expect(shared.body).not.toContain('Formerly private secret');
    expect(shared.json().data).toHaveLength(1);
    const own = await app.inject({ url: historyUrl(sharedFormerPrivate), headers: { cookie: ownerCookie } });
    expect(own.json().data).toHaveLength(2);
  });
  it('keeps deleted note history available only to its author or staff administrator', async () => {
    const denied = await app.inject({ url: historyUrl(deletedNote), headers: { cookie: readerCookie } });
    expect(denied.statusCode).toBe(404);
    const own = await app.inject({ url: historyUrl(deletedNote), headers: { cookie: ownerCookie } });
    expect(own.statusCode, own.body).toBe(200);
    expect(own.json().data.some((revision: Row) => revision.deleted === true)).toBe(true);
  });
  it('rejects mismatched client, tenant, membership and note-read permission', async () => {
    expect((await app.inject({ url: historyUrl(staffNote, otherClientId), headers: { cookie: ownerCookie } })).statusCode).toBe(404);
    expect((await app.inject({ url: historyUrl(staffNote).replace(first.productInstanceId, second.productInstanceId), headers: { cookie: ownerCookie } })).statusCode).toBe(404);
    expect((await app.inject({ url: historyUrl(staffNote).replace(first.productInstanceId, second.productInstanceId), headers: { cookie: readerCookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: historyUrl(staffNote), headers: { cookie: clientCookie } })).statusCode).toBe(403);
    const credential = await new ActivationService(db, key).createAccount(first, { name: 'Write-only notes', scopes: ['brokerage.notes.write'] });
    const denied = await app.inject({ url: historyUrl(staffNote), headers: { authorization: `Bearer ${credential.secret}` } });
    expect(denied.statusCode).toBe(403); expect(denied.json().error.code).toBe('PERMISSION_DENIED');
  });
  it('paginates visible revisions across the client without revealing deleted or private history', async () => {
    const url = `${base()}/clients/${clientId}/notes/history`;
    const firstPage = await app.inject({ url: `${url}?limit=2&offset=0`, headers: { cookie: readerCookie } });
    expect(firstPage.statusCode, firstPage.body).toBe(200);
    expect(firstPage.json().pagination).toEqual({ total: 3, limit: 2, offset: 0 });
    expect(firstPage.json().data).toHaveLength(2);
    expect(firstPage.json().data.every((revision: Row) => revision.note_id && revision.author_name === 'Boundary Owner' && revision.editor_name === 'Boundary Owner')).toBe(true);
    const nextPage = await app.inject({ url: `${url}?limit=2&offset=2`, headers: { cookie: readerCookie } });
    expect(nextPage.json().data).toHaveLength(1);
    expect(firstPage.body + nextPage.body).not.toContain('Formerly private secret');
    expect(firstPage.body + nextPage.body).not.toContain('Private investigation details');
    expect(firstPage.body + nextPage.body).not.toContain('Deleted staff note');
    expect(new Set([...firstPage.json().data, ...nextPage.json().data].map((revision: Row) => revision.id)).size).toBe(3);
    const own = await app.inject({ url: `${url}?limit=10`, headers: { cookie: ownerCookie } });
    expect(own.json().pagination.total).toBe(7);
    expect((await app.inject({ url: url.replace(first.productInstanceId, second.productInstanceId), headers: { cookie: ownerCookie } })).statusCode).toBe(404);
  });

  it('rejects tenant template interpolation syntax and preserves text as data', async () => {
    for (const text of ['{{constructor}}', '{{client_name.toString()}}', '{{__proto__}}', '{client_name}']) {
      const response = await app.inject({ method: 'POST', url: `${base()}/email-templates`, headers: ownerHeaders(), payload: { event_type: 'brokerage.client.profile_saved', subject: 'Profile update', body: text } });
      expect(response.statusCode, response.body).toBe(422);
    }
    expect(renderTemplate('Hello {{client_name}}', { client_name: '<img src=x onerror=alert(1)>\r\nInjected' })).toBe('Hello <img src=x onerror=alert(1)>  Injected');
    const saved = await app.inject({ method: 'POST', url: `${base()}/email-templates`, headers: ownerHeaders(), payload: { event_type: 'brokerage.client.profile_saved', subject: '{{business_name}} profile saved', body: 'Hello {{client_name}}; status {{status}}' } });
    expect(saved.statusCode, saved.body).toBe(200);
    const secondList = await app.inject({ url: `${base().replace(first.productInstanceId, second.productInstanceId)}/email-templates`, headers: { cookie: ownerCookie } });
    expect(secondList.json().data).toEqual([]);
    expect((await app.inject({ url: `${base()}/email-templates`, headers: { cookie: readerCookie } })).statusCode).toBe(403);
  });
  it('creates a private encrypted email and scoped notification when a client profile changes', async () => {
    const response = await app.inject({ method: 'PATCH', url: `${portal()}/profile`, headers: { cookie: clientCookie, 'x-csrf-token': clientCsrf, 'idempotency-key': randomUUID() }, payload: { full_name: 'Updated Boundary Client' } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ status: 'onboarding', kyc_status: 'required', onboarding_status: 'in_progress' });
    const audit = (await db.transaction(first, tx => tx.query<Row>("SELECT metadata FROM audit_events WHERE resource_id=$1 AND action='brokerage.client.profile_saved' ORDER BY created_at DESC LIMIT 1", [clientId]))).rows[0];
    expect(audit.metadata).toMatchObject({ previous_status: 'active', status: 'onboarding', previous_kyc_status: 'approved', kyc_status: 'required' });
    const job = (await db.transaction({ core: true }, tx => tx.query<OutboxEvent>("SELECT * FROM outbox_events WHERE event_type='brokerage.email' ORDER BY created_at DESC LIMIT 1"))).rows[0];
    expect(job).toBeDefined(); expect(JSON.stringify(job.payload)).not.toContain('boundary-client@test.local');
    const message = JSON.parse(decryptSecret(String(job.payload.encrypted_message), key));
    expect(message.to).toBe('boundary-client@test.local'); expect(message.subject).toBe('boundary-alpha profile saved');
    const delivered: { id: string; to: string }[] = [];
    await brokerageEmailHandler(db, { send: async (email, id) => { delivered.push({ id, to: email.to }); } }, key)(job);
    expect(delivered).toEqual([{ id: job.id, to: 'boundary-client@test.local' }]);
    const own = await app.inject({ url: `${portal()}/notifications`, headers: { cookie: clientCookie } });
    const notification = own.json().data.find((row: Row) => row.resource_id === clientId && row.event_type === 'brokerage.client.profile_saved');
    expect(notification).toBeDefined();
    await db.transaction({ core: true }, tx => tx.query("UPDATE client_memberships SET status='disabled' WHERE user_id=$1", [userId]));
    await brokerageEmailHandler(db, { send: async (email, id) => { delivered.push({ id, to: email.to }); } }, key)(job);
    expect(delivered).toHaveLength(1);
    await db.transaction({ core: true }, tx => tx.query("UPDATE client_memberships SET status='active' WHERE user_id=$1", [userId]));
  });
  it('rejects forged read receipts and notification identifiers belonging to another client', async () => {
    const otherNotification = randomUUID();
    await db.transaction(first, tx => tx.query("INSERT INTO brokerage_notifications(id,organization_id,brand_id,environment_id,product_instance_id,recipient_user_id,event_type,resource_type,resource_id,message) VALUES($1,$2,$3,$4,$5,$6,'brokerage.account.active','brokerage_account',$7,'Account active')", [otherNotification, ...scopeValues(first), otherUserId, randomUUID()]));
    const result = await app.inject({ method: 'POST', url: `${portal()}/notifications/${otherNotification}/read`, headers: { cookie: clientCookie, 'x-csrf-token': clientCsrf, 'idempotency-key': randomUUID() } });
    expect(result.statusCode).toBe(404);
    const list = await app.inject({ url: `${portal()}/notifications`, headers: { cookie: clientCookie } });
    expect(list.body).not.toContain(otherNotification);
  });
  it('fans out normalized business events only to the matching instance', async () => {
    const webhookId = randomUUID(), otherWebhookId = randomUUID();
    await db.transaction({ core: true }, async tx => {
      for (const [id, scope] of [[webhookId, first], [otherWebhookId, second]] as const) await tx.query("INSERT INTO webhook_endpoints(id,organization_id,brand_id,environment_id,product_instance_id,name,url,events,status,signing_secret_reference) VALUES($1,$2,$3,$4,$5,'Boundary endpoint','https://example.com/brokerage','[\"*\"]','active','opaque-reference')", [id, ...scopeValues(scope)]);
    });
    const resource = randomUUID();
    await db.transaction(first, tx => recordEvent(tx, first, 'brokerage.account.active', 'brokerage_account', resource, { client_id: clientId, status: 'active', note: 'secret note', destination: { iban: 'SECRET-ACCOUNT' } }));
    const event = (await db.transaction({ core: true }, tx => tx.query<OutboxEvent>("SELECT * FROM outbox_events WHERE payload->>'resource_id'=$1 AND event_type='brokerage.account.active'", [resource]))).rows[0];
    await db.transaction({ core: true }, tx => fanoutWebhooks(tx, event));
    const deliveries = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT webhook_endpoint_id,payload FROM webhook_deliveries WHERE event_id=$1', [event.id]))).rows;
    expect(deliveries).toHaveLength(1); expect(deliveries[0].webhook_endpoint_id).toBe(webhookId);
    expect(JSON.stringify(deliveries)).not.toContain('SECRET-ACCOUNT'); expect(JSON.stringify(deliveries)).not.toContain('secret note');
    await db.transaction({ core: true }, tx => fanoutWebhooks(tx, event));
    expect((await db.transaction({ core: true }, tx => tx.query('SELECT id FROM webhook_deliveries WHERE event_id=$1', [event.id]))).rows).toHaveLength(1);
  });
  it('never fans out encrypted email envelopes even if they carry a valid scope', async () => {
    const email: OutboxEvent = { id: randomUUID(), organization_id: first.organizationId, event_type: 'brokerage.email', payload: { encrypted_message: 'private-envelope', scope: { organization_id: first.organizationId, brand_id: first.brandId, environment_id: first.environmentId, product_instance_id: first.productInstanceId } }, attempts: 1, max_attempts: 3, lease_token: randomUUID() };
    await db.transaction({ core: true }, tx => fanoutWebhooks(tx, email));
    expect((await db.transaction({ core: true }, tx => tx.query('SELECT id FROM webhook_deliveries WHERE event_id=$1', [email.id]))).rows).toEqual([]);
  });
  it('keeps email jobs pending when the email handler is unavailable', async () => {
    await db.transaction({ core: true }, tx => tx.query("UPDATE outbox_events SET state='completed',published_at=now(),processed_at=now()"));
    const id = randomUUID();
    await db.transaction({ core: true }, tx => tx.query("INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,'brokerage.email','{\"encrypted_message\":\"opaque\"}')", [id, first.organizationId]));
    const worker = new OutboxWorker(db, {}, { fanout: fanoutWebhooks });
    expect(await worker.runOnce()).toBe(true);
    const row = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT state,last_error,published_at FROM outbox_events WHERE id=$1', [id]))).rows[0];
    expect(row).toMatchObject({ state: 'pending', last_error: 'HANDLER_FAILED', published_at: null });
  });
  it('rechecks interactive MFA and password before replaying a sensitive mutation', async () => {
    const challenge = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/enroll', headers: { cookie: ownerCookie, 'x-csrf-token': ownerCsrf }, payload: { password } });
    expect(challenge.statusCode, challenge.body).toBe(200);
    const token = challenge.json().data.challenge_token;
    const setup = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/setup', payload: { challenge_token: token } });
    const verify = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/verify', payload: { challenge_token: token, code: totp(setup.json().data.secret) } });
    expect(verify.statusCode, verify.body).toBe(200);
    ownerCookie = verify.cookies.map(c => `${c.name}=${c.value}`).join('; '); ownerCsrf = verify.json().data.csrf_token;
    const headers = { cookie: ownerCookie, 'x-csrf-token': ownerCsrf, 'idempotency-key': randomUUID(), 'x-reauth-password': password };
    const payload = { maker_checker_required: true, referral_window_hours: 720 };
    const saved = await app.inject({ method: 'PATCH', url: `${base()}/finance-settings`, headers, payload });
    expect(saved.statusCode, saved.body).toBe(200);
    const replay = await app.inject({ method: 'PATCH', url: `${base()}/finance-settings`, headers, payload });
    expect(replay.statusCode, replay.body).toBe(200); expect(replay.headers['idempotency-replayed']).toBe('true');
    const wrongPassword = await app.inject({ method: 'PATCH', url: `${base()}/finance-settings`, headers: { ...headers, 'x-reauth-password': 'incorrect-password' }, payload });
    expect(wrongPassword.json().error.code).toBe('REAUTH_REQUIRED');
    await db.transaction({ core: true }, tx => tx.query("UPDATE sessions SET mfa_verified_at=now()-interval '16 minutes' WHERE user_id=$1", [ownerId]));
    const stale = await app.inject({ method: 'PATCH', url: `${base()}/finance-settings`, headers, payload });
    expect(stale.json().error.code).toBe('RECENT_MFA_REQUIRED');
    const credential = await new ActivationService(db, key).createAccount(first, { name: 'Approval integration', scopes: ['brokerage.finance.approve'] });
    const api = await app.inject({ method: 'PATCH', url: `${base()}/finance-settings`, headers: { authorization: `Bearer ${credential.secret}`, 'idempotency-key': headers['idempotency-key'], 'x-reauth-password': password }, payload });
    expect(api.json().error.code).toBe('INTERACTIVE_APPROVAL_REQUIRED');
  });
  it('preserves exact four-field forced RLS on all Brokerage tables', async () => {
    const tables = (await db.transaction({ core: true }, tx => tx.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname LIKE 'brokerage_%' AND relkind='r'"))).rows;
    expect(tables.length).toBeGreaterThanOrEqual(20);
    expect(tables.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    for (const scope of [{ organizationId: first.organizationId }, { ...first, brandId: second.brandId }, { ...first, environmentId: second.environmentId }, { ...first, productInstanceId: second.productInstanceId }]) {
      expect((await db.transaction(scope, tx => tx.query('SELECT id FROM brokerage_notes'))).rows).toEqual([]);
      expect((await db.transaction(scope, tx => tx.query('SELECT id FROM brokerage_notifications'))).rows).toEqual([]);
    }
  });
  it('denies service credentials the client portal and keeps approved support read-only', async () => {
    const activation = new ActivationService(db, key);
    const account = await activation.createAccount(first, { name: 'Brokerage integration', scopes: ['brokerage.clients.read', 'brokerage.clients.write', 'brokerage.notes.read'] });
    expect((await app.inject({ url: `${portal()}/profile`, headers: { authorization: `Bearer ${account.secret}` } })).json().error.code).toBe('CLIENT_ACCESS_REQUIRED');
    expect((await app.inject({ url: `${base()}/clients`, headers: { authorization: `Bearer ${account.secret}` } })).statusCode).toBe(200);
    expect((await app.inject({ url: `${base().replace(first.productInstanceId, second.productInstanceId)}/clients`, headers: { authorization: `Bearer ${account.secret}` } })).json().error.code).toBe('TENANT_ACCESS_DENIED');
    const core = randomUUID();
    await db.transaction({ core: true }, async tx => { await tx.query("INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,'boundary-support@test.local',$2,'Boundary Support','super_admin')", [core, await hashPassword(password)]); });
    // The authentication flow deliberately establishes a real MFA-verified Core session.
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'boundary-support@test.local', password } });
    expect(login.statusCode, login.body).toBe(200);
    const enrollment = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/enroll', headers: { cookie: login.cookies.map(c => `${c.name}=${c.value}`).join('; '), 'x-csrf-token': login.json().data.csrf_token }, payload: { password } });
    expect(enrollment.statusCode, enrollment.body).toBe(200);
    const challenge = enrollment.json().data.challenge_token;
    const setup = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/setup', payload: { challenge_token: challenge } });
    const verify = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/verify', payload: { challenge_token: challenge, code: totp(setup.json().data.secret) } });
    expect(verify.statusCode, verify.body).toBe(200);
    const grant = await activation.grantSupport(first, { user_id: core, reason: 'Review Brokerage client access', scopes: ['brokerage.clients.read', 'brokerage.clients.write', 'brokerage.finance.process'], expires_at: new Date(Date.now() + 3600_000).toISOString() });
    const headers = { cookie: verify.cookies.map(c => `${c.name}=${c.value}`).join('; '), 'x-csrf-token': verify.json().data.csrf_token, 'x-support-grant-id': String(grant.id), 'idempotency-key': randomUUID(), 'x-reauth-password': password };
    expect((await app.inject({ url: `${base()}/clients`, headers })).statusCode).toBe(200);
    const create = await app.inject({ method: 'POST', url: `${base()}/clients`, headers, payload: { full_name: 'Support-created client', email: 'denied-support-client@test.local' } });
    expect(create.json().error.code).toBe('BROKERAGE_SUPPORT_READ_ONLY');
    const destination = await app.inject({ url: `${base()}/withdrawals/${randomUUID()}/destination`, headers });
    expect(destination.json().error.code).toBe('INTERACTIVE_APPROVAL_REQUIRED');
    expect((await app.inject({ url: `${portal()}/profile`, headers })).json().error.code).toBe('CLIENT_ACCESS_REQUIRED');
  });
  it('records every allowed deposit retry transition without rewriting prior observations', async () => {
    const finance = new BrokerageFinanceService(db, key);
    const offering = randomUUID(), account = randomUUID();
    await db.transaction({ core: true }, async tx => {
      const provider = (await tx.query<{ id: string }>('SELECT id FROM integration_providers ORDER BY slug LIMIT 1')).rows[0].id;
      await tx.query("INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES($1,$2,$3,$4,$5,'Retry account',$6,'live','[\"USD\"]','[100]',$7)", [offering, ...scopeValues(first), provider, ownerId]);
      await tx.query("INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,status,external_account_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'live','USD',100,'active',$10,$11)", [account, ...scopeValues(first), otherClientId, offering, provider, `ACC-${account}`, `confirmed-${account}`, ownerId]);
    });
    const method = await finance.savePaymentMethod(first, { name: 'Retry offline transfer', kind: 'manual', currencies: ['USD'] });
    const deposit = await finance.createPayment(first, 'deposit', { client_id: otherClientId, account_id: account, payment_method_id: method.id, amount: '10.00000001', currency: 'USD' });
    const operator = { ...first, userId: readerId };
    await finance.changePaymentStatus(operator, 'deposit', String(deposit.id), { status: 'processing', reason: 'Initial receipt processing' });
    await finance.changePaymentStatus(operator, 'deposit', String(deposit.id), { status: 'requires_action', reason: 'Receipt needs further evidence' });
    const retry = await finance.changePaymentStatus(operator, 'deposit', String(deposit.id), { status: 'processing', reason: 'Additional receipt evidence supplied' });
    expect(retry.status).toBe('processing');
    const observations = (await finance.listPayments(first, 'transactions', { client_id: otherClientId })).data.filter(row => row.request_id === deposit.id);
    expect(observations.map(row => row.status).sort()).toEqual(['pending', 'processing', 'processing', 'requires_action'].sort());
    expect(new Set(observations.map(row => row.id)).size).toBe(4);
  });
  it('audits staff identity edits and preserves a restricted customer lifecycle', async () => {
    const restricted = await app.inject({ method: 'POST', url: `${base()}/clients/${otherClientId}/status`, headers: ownerHeaders(), payload: { status: 'restricted', reason: 'Restrict pending independent identity review' } });
    expect(restricted.statusCode, restricted.body).toBe(200);
    const edited = await app.inject({ method: 'PATCH', url: `${base()}/clients/${otherClientId}`, headers: ownerHeaders(), payload: { full_name: 'Corrected Legal Identity' } });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json().data).toMatchObject({ status: 'restricted', kyc_status: 'required', onboarding_status: 'in_progress' });
    const event = (await db.transaction(first, tx => tx.query<Row>("SELECT metadata FROM audit_events WHERE resource_id=$1 AND action='brokerage.client.updated' ORDER BY created_at DESC LIMIT 1", [otherClientId]))).rows[0];
    expect(event.metadata).toMatchObject({ previous_status: 'restricted', status: 'restricted', previous_kyc_status: 'approved', kyc_status: 'required' });
    expect(JSON.stringify(event.metadata)).not.toContain('Corrected Legal Identity');
  });
  it('returns staff consent history with immutable document versions and scoped pagination', async () => {
    const original = await clients.createDocument(first, { document_type: 'terms', version: '1', title: 'Business terms v1', content: 'Immutable historical terms' });
    await clients.acceptConsent({ ...first, userId, permissions: [] }, { document_id: String(original.id), document_hash: String(original.document_hash) }, { ip_address: '192.0.2.10', user_agent: 'Private consent browser metadata' });
    await clients.createDocument(first, { document_type: 'terms', version: '2', title: 'Business terms v2', content: 'Current business terms' });
    const url = `${base()}/clients/${clientId}/consents`;
    const response = await app.inject({ url: `${url}?limit=1&offset=0`, headers: { cookie: readerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().pagination).toEqual({ total: 1, limit: 1, offset: 0 });
    expect(response.json().data[0]).toMatchObject({ client_id: clientId, user_id: userId, document_id: original.id, document_type: 'terms', version: '1', document_hash: original.document_hash, title: 'Business terms v1' });
    expect(response.json().data[0].accepted_at).toBeTruthy();
    expect(response.body).not.toContain('192.0.2.10'); expect(response.body).not.toContain('Private consent browser metadata'); expect(response.body).not.toContain('Immutable historical terms');
    expect((await app.inject({ url: `${base()}/clients/${otherClientId}/consents`, headers: { cookie: readerCookie } })).json().data).toEqual([]);
    expect((await app.inject({ url: url.replace(first.productInstanceId, second.productInstanceId), headers: { cookie: ownerCookie } })).statusCode).toBe(404);
    expect((await app.inject({ url, headers: { cookie: clientCookie } })).statusCode).toBe(403);
    const credential = await new ActivationService(db, key).createAccount(first, { name: 'Write-only client integration', scopes: ['brokerage.clients.write'] });
    expect((await app.inject({ url, headers: { authorization: `Bearer ${credential.secret}` } })).json().error.code).toBe('PERMISSION_DENIED');
  });
  it('returns referral links addressing the specific Brokerage client instance', async () => {
    const response = await app.inject({ method: 'POST', url: `${portal()}/ib/apply`, headers: { cookie: clientCookie, 'x-csrf-token': clientCsrf, 'idempotency-key': randomUUID() }, payload: {} });
    expect(response.statusCode, response.body).toBe(200);
    const partner = response.json().data;
    expect(partner.referral_link).toBe(`/portal/${first.productInstanceId}/ib?ref=${partner.referral_code}`);
    const own = await app.inject({ url: `${portal()}/ib`, headers: { cookie: clientCookie } });
    expect(own.statusCode, own.body).toBe(200);
    expect(own.json().data.partner.referral_link).toBe(partner.referral_link);
  });
  it('preserves calendar birth dates and approved KYC through node-postgres local-date parsing', async () => {
    const previousTimezone = process.env.TZ; process.env.TZ = 'Asia/Kolkata';
    const parseDate = pg.types.getTypeParser(1082, 'text');
    const driverQuery = (executor: Executor) => async <T>(sql: string, params?: unknown[]) => {
      const result = await executor.query<T>(sql, params);
      // Reproduce node-postgres's real DATE parser only for uncast date columns.
      if (!sql.includes('birth_date::text')) for (const row of result.rows) {
        if (row && typeof row === 'object' && 'birth_date' in row && row.birth_date !== null) {
          const birth = row.birth_date instanceof Date ? row.birth_date.toISOString().slice(0, 10) : String(row.birth_date).slice(0, 10);
          row.birth_date = parseDate(birth);
        }
      }
      return result;
    };
    const pgDateDb: Database = { query: driverQuery(db), transaction: (scope, work) => db.transaction(scope, tx => work({ query: driverQuery(tx) })), close: async () => {} };
    const service = new BrokerageClientsService(pgDateDb);
    try {
      const input = { full_name: 'Calendar Staff Client', email: 'calendar-staff@test.local', country: 'GB', residence_country: 'GB', birth_date: '1990-01-01', client_type: 'individual' as const };
      const client = await service.create(first, input);
      expect(client.birth_date).toBe('1990-01-01');
      await db.transaction(first, tx => tx.query("UPDATE brokerage_clients SET status='active',kyc_status='approved',onboarding_status='complete' WHERE id=$1", [client.id]));
      expect((await service.get(first, String(client.id))).birth_date).toBe('1990-01-01');
      expect((await service.list(first, { search: 'calendar-staff@test.local' })).data[0].birth_date).toBe('1990-01-01');
      const unchanged = { full_name: input.full_name,country: input.country,residence_country: input.residence_country,birth_date: input.birth_date,client_type: input.client_type };
      const saved = await service.update(first, String(client.id), unchanged);
      expect(saved).toMatchObject({ birth_date: '1990-01-01', status: 'active', kyc_status: 'approved', onboarding_status: 'complete' });
      expect((await service.changeStatus(first, String(client.id), 'restricted', 'Calendar date remains unchanged')).birth_date).toBe('1990-01-01');
      const portalUser = randomUUID();
      await db.transaction({ core: true }, async tx => {
        await tx.query("INSERT INTO users(id,email,password_hash,display_name) VALUES($1,'calendar-portal@test.local','unused','Calendar Portal')", [portalUser]);
        await tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), first.organizationId, portalUser, first.productInstanceId]);
      });
      const own = { ...first, userId: portalUser, permissions: [] };
      const profileInput = { ...unchanged, full_name: 'Calendar Portal' };
      const profile = await service.saveProfile(own, profileInput);
      expect(profile.birth_date).toBe('1990-01-01');
      await db.transaction(first, tx => tx.query("UPDATE brokerage_clients SET status='active',kyc_status='approved',onboarding_status='complete' WHERE id=$1", [profile.id]));
      expect((await service.profile(own))?.birth_date).toBe('1990-01-01');
      expect((await service.onboarding(own)).profile?.birth_date).toBe('1990-01-01');
      expect(await service.saveProfile(own, profileInput)).toMatchObject({ birth_date: '1990-01-01', status: 'active', kyc_status: 'approved', onboarding_status: 'complete' });
    } finally { if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone; }
  });
});
