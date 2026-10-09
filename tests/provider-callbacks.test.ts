import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { ConnectorConnectionService } from '../src/server/connectors/connection-service.js';
import { stripeScopeFingerprint } from '../src/server/connectors/stripe-payment.js';
import { BrokerageFinanceService } from '../src/server/brokerage/finance.js';
import { hashPassword } from '../src/server/security/crypto.js';
import { permissions, type Row, type TenantContext } from '../src/shared/types.js';

type Json = Record<string, unknown>;
describe('Provider callback HTTP trust and payment ownership', () => {
  let db: Database; let app: FastifyInstance; let first: TenantContext; let foreign: TenantContext;
  let firstConnection = ''; let foreignConnection = ''; let ownPayment = ''; let otherPayment = ''; let foreignPayment = '';
  let ownerCookie = ''; let ownerCsrf = ''; let clientCookie = ''; let apiSecret = '';
  const ownerId = randomUUID(), clientUserId = randomUUID(), otherUserId = randomUUID();
  const password = 'callback-boundary-test-password';
  const firstSecret = 'whsec_callback_alpha_fixture', foreignSecret = 'whsec_callback_beta_fixture';
  const previousKey = process.env.SECRET_ENCRYPTION_KEY;
  const values = (scope: TenantContext) => [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId];
  const endpoint = (connection = firstConnection) => `/api/v1/provider-callbacks/stripe/${connection}`;
  const staff = () => `/api/v1/instances/${first.productInstanceId}/brokerage`;
  const portal = (instance = first.productInstanceId) => `/api/v1/client/instances/${instance}/brokerage`;
  const signature = (raw: Buffer, secret = firstSecret, timestamp = Math.floor(Date.now() / 1000)) => `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')}`;
  const event = (id = `evt_${randomUUID().replaceAll('-', '')}`, changes: Json = {}) => ({
    id, object: 'event', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), livemode: false,
    data: { object: { id: 'cs_test_callback', object: 'checkout.session', mode: 'payment', livemode: false, amount_total: 1234, currency: 'usd', status: 'complete', payment_status: 'unpaid', payment_intent: null, client_reference_id: ownPayment,
      metadata: { azuriya_scope: stripeScopeFingerprint(first), azuriya_connection: firstConnection, azuriya_request: ownPayment }, customer_details: { email: 'private-callback@test.local' } } }, ...changes
  });
  const receipts = async () => (await db.transaction({ core: true }, tx => tx.query('SELECT id FROM connector_event_receipts'))).rows.length;
  beforeAll(async () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 61).toString('base64');
    db = await createDatabase(); await migrate(db); await seedCatalog(db);
    const hash = await hashPassword(password);
    await db.transaction({ core: true }, async tx => {
      for (const [id, email] of [[ownerId, 'callback-owner@test.local'], [clientUserId, 'callback-client@test.local'], [otherUserId, 'callback-other@test.local']]) await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [id, email, hash, email]);
    });
    const foundation = new FoundationService(db), connections = new ConnectorConnectionService(db);
    await connections.prepareProvider('stripe');
    for (const slug of ['callback-alpha', 'callback-beta']) {
      const org = await foundation.createOrganization({ core: true, userId: ownerId, requestId: randomUUID() }, { name: slug, slug, business_type: 'brokerage', brand_name: slug, environment_name: 'Sandbox', environment_kind: 'sandbox', products: ['brokerage-crm'], plan: 'test', owner_email: 'callback-owner@test.local' });
      const instance = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT * FROM product_instances WHERE organization_id=$1', [org.id]))).rows[0];
      const scope: TenantContext = { core: false, userId: ownerId, requestId: randomUUID(), organizationId: String(org.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
      if (!first) first = scope; else foreign = scope;
      const connection = await connections.create(scope, { provider: 'stripe', label: slug, environment: 'sandbox', credentials: { environment: 'sandbox', secret_key: 'sk_test_callback_protocol_fixture', webhook_secret: scope === first ? firstSecret : foreignSecret } });
      await db.transaction(scope, tx => tx.query("UPDATE brokerage_connections SET status='connected',provider_account_reference='acct_callback_fixture' WHERE id=$1", [connection.id]));
      if (scope === first) firstConnection = connection.id; else foreignConnection = connection.id;
      const provider = (await db.transaction({ core: true }, tx => tx.query<{ id: string }>("SELECT id FROM integration_providers WHERE slug='stripe'"))).rows[0].id;
      const offering = randomUUID(), method = randomUUID();
      await db.transaction(scope, async tx => {
        await tx.query("INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES($1,$2,$3,$4,$5,'Fixture live account',$6,'live','[\"USD\"]','[100]',$7)", [offering, ...values(scope), provider, ownerId]);
        await tx.query("INSERT INTO brokerage_payment_methods(id,organization_id,brand_id,environment_id,product_instance_id,name,kind,provider_id,connection_id,currencies,withdrawal_enabled,created_by) VALUES($1,$2,$3,$4,$5,'Fixture payment provider','provider',$6,$7,'[\"USD\"]',false,$8)", [method, ...values(scope), provider, connection.id, ownerId]);
      });
      for (const user of scope === first ? [clientUserId, otherUserId] : [otherUserId]) {
        const client = randomUUID(), account = randomUUID();
        await db.transaction(scope, async tx => {
          await tx.query("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,kyc_status,onboarding_status) VALUES($1,$2,$3,$4,$5,$6,$7,'Callback fixture client',$8,'active','GB','approved','complete')", [client, ...values(scope), user, `CB-${client}`, `${client}@test.local`]);
          await tx.query("INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,status,external_account_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'live','USD',100,'active',$9,$10)", [account, ...values(scope), client, offering, provider, `CB-${account}`, ownerId]);
        });
        const payment = await new BrokerageFinanceService(db).createPayment(scope, 'deposit', { client_id: client, account_id: account, payment_method_id: method, amount: '12.34000000', currency: 'USD' });
        await db.transaction(scope, tx => tx.query("UPDATE brokerage_payment_requests SET status='requires_action',provider_payment_reference=$2,payment_action_url=$3,payment_action_expires_at=now()+interval '1 hour' WHERE id=$1", [payment.id, `cs_test_${String(payment.id).replaceAll('-', '')}`, 'https://checkout.stripe.com/c/pay/fixture']));
        if (scope !== first) foreignPayment = String(payment.id); else if (user === clientUserId) ownPayment = String(payment.id); else otherPayment = String(payment.id);
      }
    }
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), first.organizationId, clientUserId, first.productInstanceId]));
    apiSecret = (await foundation.createApiKey(first, { name: 'Callback fixture service credential', scopes: ['brokerage.connections.write'] })).secret;
    app = await buildApp({ db, origin: 'http://localhost', production: false });
    for (const [email, owner] of [['callback-owner@test.local', true], ['callback-client@test.local', false]] as const) {
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
      expect(login.statusCode, login.body).toBe(200);
      const cookie = login.cookies.map(item => `${item.name}=${item.value}`).join('; ');
      if (owner) { ownerCookie = cookie; ownerCsrf = login.json().data.csrf_token; } else clientCookie = cookie;
    }
  });
  afterAll(async () => { await app?.close(); await db?.close(); if (previousKey === undefined) delete process.env.SECRET_ENCRYPTION_KEY; else process.env.SECRET_ENCRYPTION_KEY = previousKey; });
  it('verifies original JSON bytes and durably deduplicates one callback and outbox job', async () => {
    const raw = Buffer.from(`{\n  ${JSON.stringify(event('evt_raw_bytes')).slice(1, -1)}\n}`);
    const input = { method: 'POST' as const, url: endpoint(), headers: { 'content-type': 'application/json', 'stripe-signature': signature(raw) }, payload: raw };
    const accepted = await app.inject(input); expect(accepted.statusCode, accepted.body).toBe(202);
    expect((await app.inject(input)).json()).toEqual({ received: true, duplicate: true });
    const rows = (await db.transaction(first, tx => tx.query<Row>("SELECT * FROM connector_event_receipts WHERE provider_event_id='evt_raw_bytes'"))).rows;
    expect(rows).toHaveLength(1); expect(rows[0].state).toBe('verified');
    expect(JSON.stringify(rows)).not.toMatch(/private-callback|customer_details|whsec_|sk_test_/);
    expect((await db.transaction({ core: true }, tx => tx.query("SELECT id FROM outbox_events WHERE event_type='connector.callback' AND payload->>'receipt_id'=$1", [rows[0].id]))).rows).toHaveLength(1);
    const changed = Buffer.from(JSON.stringify(JSON.parse(raw.toString())));
    expect((await app.inject({ ...input, payload: changed })).statusCode).toBe(400);
  });
  it.each(['forged', 'stale', 'future'])('rejects a %s signature without recording an event', async kind => {
    const raw = Buffer.from(JSON.stringify(event())), before = await receipts(), now = Math.floor(Date.now() / 1000);
    const signed = signature(raw, kind === 'forged' ? foreignSecret : firstSecret, kind === 'stale' ? now - 301 : kind === 'future' ? now + 301 : now);
    expect((await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'application/json', 'stripe-signature': signed }, payload: raw })).statusCode).toBe(400);
    expect(await receipts()).toBe(before);
  });
  it('rejects environment and provider-account substitution', async () => {
    const before = await receipts();
    for (const change of [{ livemode: true }, { account: 'acct_another_provider' }]) {
      const raw = Buffer.from(JSON.stringify(event(undefined, change)));
      expect((await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'application/json', 'stripe-signature': signature(raw) }, payload: raw })).statusCode).toBe(422);
    }
    expect(await receipts()).toBe(before);
  });
  it('rejects cross-connection signatures and a correctly signed foreign-tenant binding', async () => {
    const raw = Buffer.from(JSON.stringify(event())), before = await receipts();
    for (const secret of [firstSecret, foreignSecret]) {
      const response = await app.inject({ method: 'POST', url: endpoint(foreignConnection), headers: { 'content-type': 'application/json', 'stripe-signature': signature(raw, secret) }, payload: raw });
      expect([400, 422]).toContain(response.statusCode);
    }
    expect(await receipts()).toBe(before);
  });
  it('rejects a reused verified event ID with different raw evidence', async () => {
    const raw = Buffer.from(JSON.stringify(event('evt_collision')));
    expect((await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'application/json', 'stripe-signature': signature(raw) }, payload: raw })).statusCode).toBe(202);
    const changed = Buffer.from(JSON.stringify({ ...JSON.parse(raw.toString()), pending_webhooks: 2 }));
    const collision = await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'application/json', 'stripe-signature': signature(changed) }, payload: changed });
    expect(collision.statusCode).toBe(409); expect(collision.json().error.code).toBe('PROVIDER_EVENT_COLLISION');
  });
  it('accepts bounded raw JSON above the ordinary API body limit and rejects oversized callbacks', async () => {
    const raw = Buffer.concat([Buffer.alloc(300000, 32), Buffer.from(JSON.stringify(event()))]);
    expect((await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'application/json', 'stripe-signature': signature(raw) }, payload: raw })).statusCode).toBe(202);
    const before = await receipts(), oversized = Buffer.alloc(1048577, 32);
    expect((await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'application/json', 'stripe-signature': signature(oversized) }, payload: oversized })).statusCode).toBe(413);
    expect(await receipts()).toBe(before);
  });
  it('rejects missing signatures, unsupported content types and malformed signed JSON', async () => {
    const before = await receipts(), raw = Buffer.from(JSON.stringify(event()));
    expect((await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'application/json' }, payload: raw })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'text/plain', 'stripe-signature': signature(raw) }, payload: raw })).statusCode).toBe(415);
    const malformed = Buffer.from('{ invalid json');
    expect((await app.inject({ method: 'POST', url: endpoint(), headers: { 'content-type': 'application/json', 'stripe-signature': signature(malformed) }, payload: malformed })).statusCode).toBe(400);
    expect(await receipts()).toBe(before);
  });
  it('requires enrolled recent MFA before a credential mutation can persist', async () => {
    const before = (await db.transaction({ core: true }, tx => tx.query('SELECT id FROM credential_envelopes'))).rows.length;
    const response = await app.inject({ method: 'POST', url: `${staff()}/connectors`, headers: { cookie: ownerCookie, 'x-csrf-token': ownerCsrf, 'x-reauth-password': password, 'idempotency-key': randomUUID() }, payload: { provider: 'stripe', label: 'Unenrolled mutation', environment: 'sandbox', credentials: { environment: 'sandbox', secret_key: 'sk_test_forbidden_fixture', webhook_secret: 'whsec_forbidden_fixture' } } });
    expect(response.statusCode, response.body).toBe(403); expect(response.json().error.code).toBe('RECENT_MFA_REQUIRED');
    expect((await db.transaction({ core: true }, tx => tx.query('SELECT id FROM credential_envelopes'))).rows).toHaveLength(before);
  });
  it('rejects a service credential for interactive provider credential mutations', async () => {
    const response = await app.inject({ method: 'POST', url: `${staff()}/connectors`, headers: { authorization: `Bearer ${apiSecret}`, 'x-reauth-password': password, 'idempotency-key': randomUUID() }, payload: { provider: 'stripe', label: 'Service mutation', environment: 'sandbox', credentials: { environment: 'sandbox', secret_key: 'sk_test_forbidden_fixture', webhook_secret: 'whsec_forbidden_fixture' } } });
    expect(response.statusCode, response.body).toBe(403); expect(response.json().error.code).toBe('INTERACTIVE_APPROVAL_REQUIRED');
  });
  it('exposes only an owned client payment session and rejects same-instance and foreign-instance IDOR', async () => {
    const headers = { cookie: clientCookie };
    const owned = await app.inject({ url: `${portal()}/deposits/${ownPayment}/provider`, headers });
    expect(owned.statusCode, owned.body).toBe(200); expect(owned.json().data).toMatchObject({ status: 'requires_action', amount: '12.34000000', currency: 'USD', funding_status: 'not_applicable', payment_action_url: 'https://checkout.stripe.com/c/pay/fixture' });
    expect(owned.json().data).not.toHaveProperty('provider_payment_reference'); expect(owned.body).not.toMatch(/whsec_|sk_test_|credential_reference/);
    for (const id of [otherPayment, foreignPayment, randomUUID()]) expect((await app.inject({ url: `${portal()}/deposits/${id}/provider`, headers })).statusCode).toBe(404);
    expect((await app.inject({ url: `${portal(foreign.productInstanceId)}/deposits/${foreignPayment}/provider`, headers })).statusCode).toBe(403);
  });
});
