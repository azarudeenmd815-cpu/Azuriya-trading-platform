import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { permissions, type TenantContext, type Row } from '../src/shared/types.js';
import { BrokerageClientsService, clientTransitions, eligibleClient } from '../src/server/brokerage/clients.js';
import { buildApp } from '../src/server/app.js';
import { decryptSecret, hashPassword } from '../src/server/security/crypto.js';
import type { FastifyInstance } from 'fastify';

describe('Brokerage clients, onboarding and staff workflows', () => {
  let db: Database; let service: BrokerageClientsService; let app: FastifyInstance;
  let staffCookie = ''; let staffCsrf = ''; let clientCookie = ''; let clientCsrf = '';
  let first: TenantContext; let second: TenantContext; let client: Row;
  const ownerId = randomUUID(); const userId = randomUUID();
  beforeAll(async () => {
    db = await createDatabase(); await migrate(db); await seedCatalog(db);
    const passwordHash = await hashPassword('brokerage-test-password');
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4),($5,$6,$3,$4)', [ownerId, 'broker-owner@test.local', passwordHash, 'Owner', userId, 'self-client@test.local']));
    const foundation = new FoundationService(db);
    for (const slug of ['client-alpha','client-beta']) {
      const organization = await foundation.createOrganization({ core: true, userId: ownerId, requestId: randomUUID() }, { name: slug, slug, business_type: 'brokerage', brand_name: slug, environment_name: 'production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'test', owner_email: 'broker-owner@test.local' });
      const instance = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT * FROM product_instances WHERE organization_id=$1', [organization.id]))).rows[0];
      const scope: TenantContext = { core: false, userId: ownerId, requestId: randomUUID(), organizationId: String(organization.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
      if (!first) first = scope; else second = scope;
    }
    service = new BrokerageClientsService(db);
    app = await buildApp({ db,origin: 'http://localhost',production: false });
    for (const email of ['broker-owner@test.local','self-client@test.local']) {
      const response = await app.inject({ method: 'POST',url: '/api/v1/auth/login',payload: { email,password: 'brokerage-test-password' } });
      expect(response.statusCode,response.body).toBe(200);
      const cookie = response.cookies.map(value => `${value.name}=${value.value}`).join('; ');
      if (email==='broker-owner@test.local') { staffCookie=cookie; staffCsrf=response.json().data.csrf_token; }
      else { clientCookie=cookie; clientCsrf=response.json().data.csrf_token; }
    }
  });
  afterAll(async () => { await app?.close(); await db?.close(); });
  it('creates persisted scoped customers separately from Core identities', async () => {
    client = await service.create(first, { full_name: 'Ada Trader', email: 'ada@test.local', country: 'GB', residence_country: 'GB', birth_date: '1990-02-02', client_type: 'individual' });
    expect(client).toMatchObject({ full_name: 'Ada Trader', status: 'lead', user_id: null, country: 'GB' });
    expect(client.client_number).toMatch(/^CLI-/);
    expect((await service.list(first, { search: 'Ada', limit: 1 })).data).toHaveLength(1);
    expect((await service.list(second, {})).data).toHaveLength(0);
    await expect(service.get(second, String(client.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('enforces controlled state changes and records reasons', async () => {
    expect(clientTransitions.lead).toContain('invited');
    await expect(service.changeStatus(first, String(client.id), 'active', 'Skip onboarding')).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    await service.changeStatus(first, String(client.id), 'invited', 'Invitation sent');
    await service.changeStatus(first, String(client.id), 'registered', 'Identity accepted');
    expect((await service.get(first, String(client.id))).status).toBe('registered');
    const activity = await service.activity(first, String(client.id), {});
    expect(activity.data.some(row => row.action === 'brokerage.client.status_changed')).toBe(true);
  });
  it('searches, paginates and filters tags without crossing scope', async () => {
    await service.create(first, { full_name: 'Ben Trader', email: 'ben@test.local', country: 'IN', source: 'campaign' });
    const tag = await service.createTag(first, { name: 'VIP', color: '#123456' });
    await service.tagClient(first, String(client.id), String(tag.id), true);
    expect((await service.list(first, { tag_id: String(tag.id) })).data.map(row => row.id)).toEqual([client.id]);
    expect((await service.list(first, { country: 'IN', source: 'campaign', limit: 1 })).pagination.total).toBe(1);
    await expect(service.tagClient(second, String(client.id), String(tag.id), true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await service.updateTag(first, String(tag.id), { archived: true });
    await expect(service.tagClient(first, String(client.id), String(tag.id), true)).rejects.toMatchObject({ code: 'TAG_UNAVAILABLE' });
  });
  it('validates staff assignment membership and product scope', async () => {
    await service.assign(first, String(client.id), 'account_manager', ownerId);
    expect((await service.get(first, String(client.id))).assigned_staff_id).toBe(ownerId);
    await expect(service.assign(first, String(client.id), 'support_owner', userId)).rejects.toMatchObject({ code: 'STAFF_SCOPE_MISMATCH' });
    await service.assign(first, String(client.id), 'account_manager', null);
    expect((await service.get(first, String(client.id))).assigned_staff_id).toBeNull();
  });
  it('keeps immutable internal note revisions and enforces author policy', async () => {
    const note = await service.createNote(first, String(client.id), { text: 'Internal only', category: 'compliance', pinned: true });
    await service.updateNote(first, String(client.id), String(note.id), { text: 'Edited internal only' });
    const other = { ...first, userId, permissions: ['brokerage.notes.write'] };
    await expect(service.updateNote(other, String(client.id), String(note.id), { text: 'Unauthorized' })).rejects.toMatchObject({ code: 'NOTE_AUTHOR_REQUIRED' });
    const history = await db.transaction(first, tx => tx.query<Row>('SELECT * FROM brokerage_note_revisions WHERE note_id=$1 ORDER BY created_at', [note.id]));
    expect(history.rows).toHaveLength(2);
    expect(history.rows[0].text).toBe('Internal only');
    await service.deleteNote(first, String(client.id), String(note.id));
    expect(await service.notes(first, String(client.id))).toHaveLength(0);
  });
  it('creates and completes persisted scoped operational tasks', async () => {
    const task = await service.createTask(first, { client_id: String(client.id), owner_id: ownerId, title: 'Review profile', priority: 'high' });
    expect(task.status).toBe('open');
    await service.updateTask(first, String(task.id), { status: 'completed' });
    expect((await service.tasks(first, { status: 'completed' })).data).toHaveLength(1);
    await expect(service.updateTask(second, String(task.id), { status: 'open' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('requires client membership for profile creation and only links a matching identity', async () => {
    const self = { ...first, userId, permissions: [] };
    await expect(service.saveProfile(self, { full_name: 'Self Client' })).rejects.toMatchObject({ code: 'CLIENT_ACCESS_DENIED' });
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), first.organizationId, userId, first.productInstanceId]));
    const profile = await service.saveProfile(self, { full_name: 'Self Client', country: 'GB', residence_country: 'GB', birth_date: '1992-01-01' });
    expect(profile).toMatchObject({ user_id: userId, email: 'self-client@test.local', status: 'onboarding' });
    expect(profile).not.toHaveProperty('risk_level');
    expect(profile).not.toHaveProperty('assigned_staff_id');
    expect(await service.profile({ ...second, userId, permissions: [] })).toBeNull();
  });
  it('persists exact versioned consent and rejects stale document hashes', async () => {
    const self = { ...first, userId, permissions: [] };
    const document = await service.createDocument(first, { document_type: 'terms', version: '1.0', title: 'Business terms', content: 'Exact accepted business terms.', required: true });
    await expect(service.acceptConsent(self, { document_id: String(document.id), document_hash: '0'.repeat(64) }, {})).rejects.toMatchObject({ code: 'CONSENT_DOCUMENT_CHANGED' });
    const consent = await service.acceptConsent(self, { document_id: String(document.id), document_hash: String(document.document_hash) }, { ip_address: '127.0.0.1', user_agent: 'vitest' });
    expect(consent).toMatchObject({ version: '1.0', accepted_content: 'Exact accepted business terms.', user_id: userId });
    const replay = await service.acceptConsent(self, { document_id: String(document.id), document_hash: String(document.document_hash) }, {});
    expect(replay.id).toBe(consent.id);
    await expect(service.acceptConsent({ ...second, userId }, { document_id: String(document.id), document_hash: String(document.document_hash) }, {})).rejects.toMatchObject({ code: 'CLIENT_PROFILE_REQUIRED' });
    await expect(service.createDocument(first, { document_type: 'terms', version: '1.0', title: 'Changed', content: 'Replacement' })).rejects.toMatchObject({ code: 'DOCUMENT_VERSION_EXISTS' });
  });
  it('returns honest onboarding blockers for configured business eligibility', async () => {
    await service.settings(first, { allowed_countries: ['GB'], restricted_countries: ['US'], allowed_client_types: ['individual'], minimum_age: 18, require_kyc: true });
    const result = await service.onboarding({ ...first, userId, permissions: [] });
    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.reasons).toContain('kyc_required');
    expect(result.steps.find(step => step.key === 'terms')?.complete).toBe(true);
    const blocked = eligibleClient({ country: 'US', client_type: 'individual', birth_date: '2020-01-01', kyc_status: 'not_started', status: 'onboarding' }, { allowed_countries: ['GB'], restricted_countries: ['US'], allowed_client_types: ['corporate'], minimum_age: 18, require_kyc: true }, false);
    expect(blocked.reasons).toEqual(expect.arrayContaining(['country_restricted','client_type_restricted','minimum_age','kyc_required','consent_required']));
  });
  it('requires eligibility before activation and keeps closed state terminal', async () => {
    const id = String(client.id);
    await service.changeStatus(first, id, 'onboarding', 'Profile review');
    await service.changeStatus(first, id, 'kyc_pending', 'Review pending');
    await service.changeStatus(first, id, 'kyc_review', 'Review underway');
    await expect(service.changeStatus(first, id, 'active', 'Approved')).rejects.toMatchObject({ code: 'CLIENT_INELIGIBLE' });
    await service.changeStatus(first, id, 'closed', 'Client requested closure');
    await expect(service.changeStatus(first, id, 'onboarding', 'Reopen')).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });
  it('FORCE RLS blocks missing or mismatched full scope for direct queries and writes', async () => {
    expect((await db.transaction({ organizationId: first.organizationId }, tx => tx.query<Row>('SELECT id FROM brokerage_clients'))).rows).toHaveLength(0);
    expect((await db.transaction({ ...first, brandId: second.brandId }, tx => tx.query<Row>('SELECT id FROM brokerage_clients'))).rows).toHaveLength(0);
    await expect(db.transaction(second, tx => tx.query('UPDATE brokerage_clients SET full_name=$1 WHERE id=$2 RETURNING id', ['Forged', client.id]))).resolves.toMatchObject({ rows: [] });
    await expect(db.transaction(first, tx => tx.query('INSERT INTO brokerage_tags(id,organization_id,brand_id,environment_id,product_instance_id,name) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), first.organizationId, second.brandId, first.environmentId, first.productInstanceId, 'Forged']))).rejects.toThrow();
    const policies = await db.transaction({ core: true }, tx => tx.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname LIKE 'brokerage_%' AND relkind='r'"));
    expect(policies.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
  it('enforces immutable consent content, acceptance snapshots and note history in the database', async () => {
    const documents = await service.documents(first); const document = documents[0];
    await expect(db.transaction(first,tx => tx.query('UPDATE brokerage_consent_documents SET content=$1 WHERE id=$2',['Changed terms',document.id]))).rejects.toThrow('immutable');
    await expect(db.transaction(first,tx => tx.query('UPDATE brokerage_consents SET accepted_content=$1',['Changed terms']))).rejects.toThrow('permission denied');
    await expect(db.transaction(first,tx => tx.query('DELETE FROM brokerage_note_revisions'))).rejects.toThrow('permission denied');
    await service.createDocument(first,{ document_type: 'terms',version: '2.0',title: 'Current terms',content: 'New exact terms.' });
    const onboarding = await service.onboarding({ ...first,userId,permissions: [] });
    expect(onboarding.steps.find(step => step.key==='terms')?.complete).toBe(false);
    expect(onboarding.documents.filter(item => item.document_type==='terms')).toHaveLength(1);
  });
  it('protects authenticated customer routes from client IDOR, staff access and hidden note leakage', async () => {
    const admin = `/api/v1/instances/${first.productInstanceId}/brokerage`;
    const portal = `/api/v1/client/instances/${first.productInstanceId}/brokerage`;
    expect((await app.inject({ url: `${admin}/clients`,headers: { cookie: clientCookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: `${portal}/profile`,headers: { cookie: staffCookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/v1/client/instances/${second.productInstanceId}/brokerage/profile`,headers: { cookie: clientCookie } })).statusCode).toBe(403);
    const profile = await app.inject({ url: `${portal}/profile`,headers: { cookie: clientCookie } });
    expect(profile.statusCode,profile.body).toBe(200); expect(profile.json().data.user_id).toBe(userId);
    expect(profile.body).not.toContain('Internal only'); expect(profile.body).not.toContain('risk_level'); expect(profile.body).not.toContain('assigned_staff_id');
    expect((await app.inject({ method: 'PATCH',url: `${portal}/profile`,headers: { cookie: clientCookie,'x-csrf-token': clientCsrf },payload: { full_name: 'New Name',user_id: ownerId,status: 'active' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH',url: `${portal}/profile`,headers: { cookie: clientCookie },payload: { full_name: 'Forged' } })).statusCode).toBe(403);
  });
  it('uses transactional mutation replay and tenant-scoped HTTP search', async () => {
    const base = `/api/v1/instances/${first.productInstanceId}/brokerage`;
    const request = { method: 'POST' as const,url: `${base}/clients`,headers: { cookie: staffCookie,'x-csrf-token': staffCsrf,'idempotency-key': 'client-replay-test' },payload: { full_name: 'Replay Client',email: 'replay-client@test.local' } };
    const created = await app.inject(request); expect(created.statusCode,created.body).toBe(201);
    const replay = await app.inject(request); expect(replay.statusCode,replay.body).toBe(201); expect(replay.headers['idempotency-replayed']).toBe('true'); expect(replay.json().data.id).toBe(created.json().data.id);
    const conflict = await app.inject({ ...request,payload: { ...request.payload,full_name: 'Changed' } }); expect(conflict.statusCode).toBe(409);
    const list = await app.inject({ url: `${base}/clients?search=Replay&limit=1`,headers: { cookie: staffCookie } });
    expect(list.statusCode,list.body).toBe(200); expect(list.json().pagination.total).toBe(1);
    expect((await app.inject({ url: `/api/v1/instances/${second.productInstanceId}/brokerage/clients/${created.json().data.id}`,headers: { cookie: staffCookie } })).statusCode).toBe(404);
  });
  it('reuses encrypted Core invitations and links the invited CRM record only after identity acceptance', async () => {
    const priorKey = process.env.SECRET_ENCRYPTION_KEY; const key = randomBytes(32).toString('base64'); process.env.SECRET_ENCRYPTION_KEY=key;
    try {
      const record = await service.create(first,{ full_name: 'Invited Customer',email: 'invited-customer@test.local' });
      const base = `/api/v1/instances/${first.productInstanceId}/brokerage`;
      const invited = await app.inject({ method: 'POST',url: `${base}/clients/${record.id}/invite`,headers: { cookie: staffCookie,'x-csrf-token': staffCsrf },payload: {} });
      expect(invited.statusCode,invited.body).toBe(201); expect((await service.get(first,String(record.id))).status).toBe('invited');
      const jobs = await db.transaction({ core: true },tx => tx.query<{ payload: { encrypted_message: string } }>("SELECT payload FROM outbox_events WHERE organization_id=$1 AND event_type='invitation.email' ORDER BY created_at DESC LIMIT 1",[first.organizationId]));
      const message = JSON.parse(decryptSecret(jobs.rows[0].payload.encrypted_message,key)) as { return_url: string };
      const token = message.return_url.split('#token=')[1];
      const accepted = await app.inject({ method: 'POST',url: '/api/v1/auth/invitations/accept',payload: { token,password: 'invited-client-password',display_name: 'Invited Customer' } });
      expect(accepted.statusCode,accepted.body).toBe(200);
      const login = await app.inject({ method: 'POST',url: '/api/v1/auth/login',payload: { email: 'invited-customer@test.local',password: 'invited-client-password' } });
      expect(login.statusCode,login.body).toBe(200);
      const cookie = login.cookies.map(value => `${value.name}=${value.value}`).join('; '); const portal = `/api/v1/client/instances/${first.productInstanceId}/brokerage`;
      expect((await app.inject({ url: `${portal}/profile`,headers: { cookie } })).json().data).toBeNull();
      const profile = await app.inject({ method: 'PATCH',url: `${portal}/profile`,headers: { cookie,'x-csrf-token': login.json().data.csrf_token },payload: { full_name: 'Invited Customer',country: 'GB',birth_date: '1990-01-01' } });
      expect(profile.statusCode,profile.body).toBe(200); expect(profile.json().data.id).toBe(record.id); expect(profile.json().data.status).toBe('onboarding');
    } finally { if (priorKey===undefined) delete process.env.SECRET_ENCRYPTION_KEY; else process.env.SECRET_ENCRYPTION_KEY=priorKey; }
  });
  it('invalidates approved eligibility data and prevents restricted client self-unrestriction', async () => {
    const self = { ...first,userId,permissions: [] }; const current = await service.profile(self);
    await db.transaction(first,tx => tx.query("UPDATE brokerage_clients SET status='active',kyc_status='approved' WHERE id=$1",[current!.id]));
    const changed = await service.saveProfile(self,{ residence_country: 'IN' }); expect(changed).toMatchObject({ status: 'onboarding',kyc_status: 'required' });
    await service.changeStatus(first,String(current!.id),'restricted','Administrative restriction');
    await expect(service.saveProfile(self,{ residence_country: 'GB' })).rejects.toMatchObject({ code: 'CLIENT_PROFILE_RESTRICTED' });
    expect((await service.profile(self))?.status).toBe('restricted');
  });
});
