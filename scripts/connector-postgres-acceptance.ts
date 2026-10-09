/** Creates a separate PostgreSQL database. Provider rows are explicit protocol fixtures, never external acceptance. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { createDatabase, type Database, type DatabaseContext } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { buildApp } from '../src/server/app.js';
import { FoundationService } from '../src/server/domain/service.js';
import { hashPassword } from '../src/server/security/crypto.js';
import { totp } from '../src/server/security/totp.js';
import { permissions, type Row, type TenantContext } from '../src/shared/types.js';
import { scopeValues } from '../src/server/brokerage/common.js';
import { ConnectorConnectionService, connectorVault } from '../src/server/connectors/connection-service.js';

const root = resolve('artifacts/connector-acceptance'), pgRoot = resolve('artifacts/pg-acceptance');
await mkdir(root, { recursive: true });
// Do not create a database that omits the pending storage security migration.
await readFile(resolve('migrations/019_kyc_document_review.sql'), 'utf8');
const caFile = join(pgRoot, 'certs/ca.crt'), ca = await readFile(caFile, 'utf8');
const ownerPassword = (await readFile(join(pgRoot, 'owner-password.txt'), 'utf8')).trim();
const base = new URL('postgresql://127.0.0.1:54841/postgres'); base.username = 'azuriya_accept_owner'; base.password = ownerPassword;
const owner = new pg.Pool({ connectionString: base.toString(), ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 5000 });
const name = `connector_accept_${Date.now()}`, loginRole = `connector_accept_${randomBytes(6).toString('hex')}`;
const ownerUrl = new URL(base); ownerUrl.pathname = `/${name}`;
const runtimeUrl = new URL(ownerUrl); runtimeUrl.username = loginRole; runtimeUrl.password = randomBytes(32).toString('hex');
const password = `Connector-local-${randomBytes(12).toString('base64url')}!`, encryptionKey = randomBytes(32).toString('base64');
process.env.SECRET_ENCRYPTION_KEY = encryptionKey;
const tables = ['connector_operations', 'connector_event_receipts', 'connector_payment_observations', 'connector_reconciliations', 'connector_health_history', 'brokerage_kyc_scan_evidence', 'brokerage_kyc_storage_policy'] as const;
interface Session { userId: string; email: string; cookie: string; csrf: string; mfaSeed?: string; recoveryCodes?: string[] }
interface Business { name: string; scope: TenantContext; maker: Session; client: Session; clientId: string; accountId: string; pendingAccountId: string; offeringId: string; methodId: string; connectionId: string; tradingConnectionId: string; kycId: string; documentId: string; paymentId: string }
const businesses: Business[] = [];
const evidence: Record<string, unknown> = { timestamp: new Date().toISOString(), database: name, provider_acceptance: 'not_performed', fixture_type: 'Explicit local protocol and relational fixtures; no provider account, payment, upload or scan executed externally', limitations: ['Fastify injection includes application/authentication and real TLS PostgreSQL; excludes HTTP network and browser rendering.', 'Small synthetic dataset and 50 samples per operation are an internal acceptance baseline, not production capacity certification.', 'Draft connections have no PSP/trading credentials; scan evidence is rejected fixture data and never makes a document available.'] };
let db: Database | undefined, app: FastifyInstance | undefined, stage = 'database_setup', remote = 0;
const address = () => { const value = ++remote; return `127.27.${Math.floor(value / 200) % 200}.${value % 200 + 1}`; };
async function login(userId: string, email: string, mfa: boolean): Promise<Session> {
  const initial = await app!.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password }, remoteAddress: address() });
  let response = initial, seed: string | undefined;
  if (mfa) {
    assert.equal(initial.statusCode, 403, 'Fixture MFA challenge');
    const challenge = String(initial.json().error.details[0].challenge_token);
    const setup = await app!.inject({ method: 'POST', url: '/api/v1/auth/mfa/setup', payload: { challenge_token: challenge }, remoteAddress: address() });
    assert.equal(setup.statusCode, 200, 'Fixture MFA enrollment'); seed = String(setup.json().data.secret);
    response = await app!.inject({ method: 'POST', url: '/api/v1/auth/mfa/verify', payload: { challenge_token: challenge, code: totp(seed) }, remoteAddress: address() });
  }
  assert.equal(response.statusCode, 200, 'Fixture login');
  return { userId, email, cookie: response.cookies.map(value => `${value.name}=${value.value}`).join('; '), csrf: String(response.json().data.csrf_token), ...(seed ? { mfaSeed: seed, recoveryCodes: response.json().data.recovery_codes as string[] } : {}) };
}
async function denied(context: DatabaseContext, sql: string, params: unknown[], code: string) {
  await assert.rejects(() => db!.transaction(context, tx => tx.query(sql, params)), error => (error as { code?: string }).code === code);
}
try {
  await owner.query(`CREATE DATABASE ${name}`);
  await owner.query(`CREATE ROLE ${loginRole} LOGIN PASSWORD '${runtimeUrl.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  db = await createDatabase({ url: runtimeUrl.toString(), migrationUrl: ownerUrl.toString(), requireTls: true, sslCa: ca });
  await migrate(db); await owner.query(`GRANT azuriya_app TO ${loginRole}`); await seedCatalog(db);
  const role = (await db.query<Row>("SELECT current_user,session_user,r.rolsuper,r.rolbypassrls,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND pg_has_role(session_user,c.relowner,'MEMBER')) AS owns_tables FROM pg_roles r WHERE r.rolname=session_user")).rows[0];
  assert.equal(role.current_user, 'azuriya_app'); assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false); assert.equal(role.owns_tables, false); evidence.runtime_role = role;
  const pid = Number((await db.query<Row>('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  const tls = (await owner.query<Row>('SELECT ssl,version,cipher FROM pg_stat_ssl WHERE pid=$1', [pid])).rows[0]; assert.equal(tls.ssl, true); evidence.tls = tls;
  const wrongCa = await createDatabase({ url: runtimeUrl.toString(), requireTls: true, sslCa: 'invalid-private-ca' }); await assert.rejects(() => wrongCa.query('SELECT 1')); await wrongCa.close(); evidence.wrong_ca_rejected = true;
  evidence.postgresql_version = (await owner.query<Row>('SELECT version() AS version')).rows[0].version;
  app = await buildApp({ db, origin: 'http://127.0.0.1:5174', production: false, requireWorker: false });
  const foundation = new FoundationService(db), connections = new ConnectorConnectionService(db), hash = await hashPassword(password);
  const stripe = await connections.prepareProvider('stripe'), trading = await connections.prepareProvider('tradelocker');
  stage = 'scoped_fixture';
  for (const [label, slug, color] of [['ABC Markets', 'connector-abc', '#2563EB'], ['XYZ Markets', 'connector-xyz', '#0F766E']] as const) {
    const makerId = randomUUID(), clientUser = randomUUID(), makerEmail = `${slug}-owner@test.local`, clientEmail = `${slug}-client@test.local`;
    await db.transaction({ core: true }, async tx => {
      for (const [id, email, required] of [[makerId, makerEmail, true], [clientUser, clientEmail, false]]) await tx.query('INSERT INTO users(id,email,password_hash,display_name,mfa_required) VALUES($1,$2,$3,$4,$5)', [id, email, hash, `${label} fixture identity`, required]);
    });
    const org = await foundation.createOrganization({ core: true, userId: makerId, requestId: randomUUID() }, { name: label, slug, business_type: 'brokerage', brand_name: label, environment_name: 'Sandbox', environment_kind: 'sandbox', products: ['brokerage-crm'], plan: 'acceptance', owner_email: makerEmail });
    const instance = (org.product_instances as Row[])[0];
    const scope: TenantContext = { core: false, userId: makerId, requestId: randomUUID(), organizationId: String(org.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
    await foundation.updateBranding(scope, { business_name: label, product_display_name: `${label} Client Office`, primary_color: color, logo_url: 'http://127.0.0.1:5174/brand/azuriya-logo.png', support_email: `${slug}@test.local`, custom_footer: `${label} isolated protocol acceptance` });
    const stripeConnection = await connections.create(scope, { provider: 'stripe', label: `${label} Stripe sandbox — configuration required`, environment: 'sandbox' });
    const tradingConnection = await connections.create(scope, { provider: 'tradelocker', label: `${label} TradeLocker sandbox — configuration required`, environment: 'sandbox' });
    const clientId = randomUUID(), accountId = randomUUID(), pendingAccountId = randomUUID(), offeringId = randomUUID(), methodId = randomUUID(), kycId = randomUUID(), documentId = randomUUID();
    await db.transaction(scope, async tx => {
      await tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), scope.organizationId, clientUser, scope.productInstanceId]);
      await tx.query("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,residence_country,birth_date,kyc_status,onboarding_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active','GB','GB','1990-01-01','approved','complete')", [clientId, ...scopeValues(scope), clientUser, `CLIENT-${slug}`, `${label} Protocol Fixture Client`, clientEmail]);
      await tx.query("INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,connection_id,account_type,currencies,leverage_options,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'live','[\"USD\"]','[100]',$9)", [offeringId, ...scopeValues(scope), `${label} Protocol Fixture Offering`, trading, tradingConnection.id, makerId]);
      for (const [id, state, number] of [[accountId, 'active', 'Manual fixture registry'], [pendingAccountId, 'provider_pending', 'Awaiting real provider configuration']]) await tx.query("INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,connection_id,account_number,account_type,currency,leverage,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'live','USD',100,$11,$12)", [id, ...scopeValues(scope), clientId, offeringId, trading, id === accountId ? null : tradingConnection.id, `${label} ${number}`, state, makerId]);
      await tx.query("INSERT INTO brokerage_payment_methods(id,organization_id,brand_id,environment_id,product_instance_id,name,kind,provider_id,connection_id,currencies,enabled,withdrawal_enabled,created_by) VALUES($1,$2,$3,$4,$5,$6,'provider',$7,$8,'[\"USD\"]',false,false,$9)", [methodId, ...scopeValues(scope), `${label} Stripe fixture — credentials required`, stripe, stripeConnection.id, makerId]);
      await tx.query("INSERT INTO brokerage_kyc_cases(id,organization_id,brand_id,environment_id,product_instance_id,client_id,status,strategy,created_by) VALUES($1,$2,$3,$4,$5,$6,'required','manual',$7)", [kycId, ...scopeValues(scope), clientId, makerId]);
      for (let index = 0; index < 45; index++) {
        const document = index === 0 ? documentId : randomUUID();
        await tx.query("INSERT INTO brokerage_kyc_documents(id,organization_id,brand_id,environment_id,product_instance_id,case_id,kind,filename,content_type,size_bytes,created_by) VALUES($1,$2,$3,$4,$5,$6,'identity',$7,'application/pdf',29,$8)", [document, ...scopeValues(scope), kycId, `protocol-fixture-${index}.pdf`, makerId]);
      }
      // A rejected relational fixture proves scan-evidence isolation without inventing clean evidence or stored bytes.
      await tx.query("INSERT INTO brokerage_kyc_scan_evidence(id,organization_id,brand_id,environment_id,product_instance_id,document_id,upload_sha256,storage_version,size_bytes,status,engine,signature_version,scanned_at) VALUES($1,$2,$3,$4,$5,$6,$7,'protocol-fixture-no-object',29,'rejected','clamav-clamd','PROTOCOL_FIXTURE_NO_SCAN_EXECUTED',now())", [randomUUID(), ...scopeValues(scope), documentId, 'a'.repeat(64)]);
      await tx.query('INSERT INTO brokerage_kyc_storage_policy(organization_id,brand_id,environment_id,product_instance_id,retention_days,updated_by) VALUES($1,$2,$3,$4,NULL,$5)', [...scopeValues(scope), makerId]);
    });
    let paymentId = '';
    for (let index = 0; index < 45; index++) {
      const payment = randomUUID(), operation = randomUUID(); if (index === 0) paymentId = payment;
      await db.transaction(scope, async tx => {
        await tx.query("INSERT INTO brokerage_payment_requests(id,organization_id,brand_id,environment_id,product_instance_id,client_id,kind,account_id,payment_method_id,amount,currency,status,created_by) VALUES($1,$2,$3,$4,$5,$6,'deposit',$7,$8,'1.25000000','USD','provider_pending',$9)", [payment, ...scopeValues(scope), clientId, accountId, methodId, makerId]);
        await tx.query("INSERT INTO connector_operations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_type,resource_type,resource_id,payment_request_id,provider_idempotency_key,credential_revision,state,attempt,safe_evidence,last_error,created_by) VALUES($1,$2,$3,$4,$5,$6,'payment.sync','payment',$7,$7,$8,0,'failed',1,'{\"source\":\"protocol_fixture\",\"external_acceptance\":false}','EXTERNAL_ACCEPTANCE_CONFIGURATION_REQUIRED',$9)", [operation, ...scopeValues(scope), stripeConnection.id, payment, randomUUID(), makerId]);
        await tx.query("INSERT INTO connector_event_receipts(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,provider,provider_event_id,event_type,provider_reference,body_sha256,state) VALUES($1,$2,$3,$4,$5,$6,'stripe',$7,'protocol_fixture',$8,$9,'ignored')", [randomUUID(), ...scopeValues(scope), stripeConnection.id, `evt_fixture_${randomUUID().replaceAll('-', '')}`, `cs_test_fixture_${index}`, 'b'.repeat(64)]);
        await tx.query("INSERT INTO connector_payment_observations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,payment_request_id,provider_reference,provider_status,canonical_status,amount,currency,refunded_amount,evidence_fingerprint,source,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'unverified_protocol_fixture','provider_pending','1.25','USD',0,$9,'reconciliation',now())", [randomUUID(), ...scopeValues(scope), stripeConnection.id, payment, `cs_test_fixture_${index}`, randomBytes(32).toString('hex')]);
        await tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,'missing_callback','provider_pending','unverified_protocol_fixture','manual_review','external_credentials_required',$9)", [randomUUID(), ...scopeValues(scope), stripeConnection.id, operation, payment, makerId]);
        await tx.query("INSERT INTO connector_health_history(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,status,error_code,connector_version) VALUES($1,$2,$3,$4,$5,$6,'unavailable','EXTERNAL_ACCEPTANCE_CONFIGURATION_REQUIRED','1.0.0')", [randomUUID(), ...scopeValues(scope), stripeConnection.id]);
      });
    }
    for (let index = 0; index < 24; index++) await connections.create(scope, { provider: 'stripe', label: `${label} Protocol fixture ${String(index).padStart(2, '0')} — draft`, environment: 'sandbox' });
    businesses.push({ name: label, scope, maker: await login(makerId, makerEmail, true), client: await login(clientUser, clientEmail, false), clientId, accountId, pendingAccountId, offeringId, methodId, connectionId: stripeConnection.id, tradingConnectionId: tradingConnection.id, kycId, documentId, paymentId });
  }
  await writeFile(join(root, 'runtime.env'), `NODE_ENV=development\nPORT=3006\nDATABASE_URL=${runtimeUrl}\nMIGRATION_DATABASE_URL=${ownerUrl}\nDB_TLS_CA_FILE=${caFile}\nAPP_ORIGIN=http://127.0.0.1:5174\nSECRET_ENCRYPTION_KEY=${encryptionKey}\n`, { mode: 0o600 });
  await writeFile(join(root, 'fixture.json'), JSON.stringify({ password, fixture_type: 'protocol_fixture_only', businesses: businesses.map(value => ({ ...value, maker: { userId: value.maker.userId, email: value.maker.email, mfaSeed: value.maker.mfaSeed, recoveryCodes: value.maker.recoveryCodes }, client: { userId: value.client.userId, email: value.client.email } })) }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ stage: 'private_fixture_ready', runtime_env: 'artifacts/connector-acceptance/runtime.env', fixture: 'artifacts/connector-acceptance/fixture.json' }));
  stage = 'rls_acceptance';
  const first = businesses[0], foreign = businesses[1], siblingBrand = randomUUID(), siblingEnvironment = randomUUID();
  await db.transaction({ core: true }, async tx => {
    await tx.query('INSERT INTO brands(id,organization_id,name) VALUES($1,$2,$3)', [siblingBrand, first.scope.organizationId, 'ABC valid sibling brand']);
    await tx.query("INSERT INTO environments(id,organization_id,brand_id,name,kind) VALUES($1,$2,$3,'Valid sibling sandbox','sandbox')", [siblingEnvironment, first.scope.organizationId, siblingBrand]);
  });
  const sibling = await foundation.provision({ core: true, userId: first.maker.userId, requestId: randomUUID() }, { organization_id: first.scope.organizationId, brand_id: siblingBrand, environment_id: siblingEnvironment, product_slug: 'brokerage-crm', plan: 'acceptance' });
  const sameHierarchy = await foundation.provision({ core: true, userId: first.maker.userId, requestId: randomUUID() }, { organization_id: first.scope.organizationId, brand_id: first.scope.brandId, environment_id: first.scope.environmentId, product_slug: 'prop-crm', plan: 'acceptance' });
  const badScopes: DatabaseContext[] = [{}, { organizationId: first.scope.organizationId }, { ...first.scope, brandId: undefined }, { ...first.scope, environmentId: undefined }, { ...first.scope, productInstanceId: undefined }, { ...first.scope, brandId: foreign.scope.brandId }, { ...first.scope, environmentId: foreign.scope.environmentId }, { ...first.scope, productInstanceId: foreign.scope.productInstanceId }, { ...first.scope, brandId: siblingBrand, environmentId: siblingEnvironment, productInstanceId: String(sibling.id) }, { ...first.scope, productInstanceId: String(sameHierarchy.id) }];
  const rls: Row[] = [], composites: Row[] = [];
  for (const table of tables) {
    const policy = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass', [table]))).rows[0]; assert.ok(policy.relrowsecurity && policy.relforcerowsecurity);
    const rows = (await db.transaction(first.scope, tx => tx.query<Row>(`SELECT * FROM ${table}`))).rows; assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.organization_id === first.scope.organizationId && row.brand_id === first.scope.brandId && row.environment_id === first.scope.environmentId && row.product_instance_id === first.scope.productInstanceId));
    for (const scope of badScopes) assert.equal((await db.transaction(scope, tx => tx.query(`SELECT * FROM ${table}`))).rows.length, 0);
    const columns = (await db.transaction({ core: true }, tx => tx.query<{ attname: string }>('SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=\'\' ORDER BY attnum', [table]))).rows.map(value => value.attname);
    const insert = `INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.join(',')} FROM json_populate_record(NULL::${table},$1::json)`;
    const attack = { ...rows[0], organization_id: foreign.scope.organizationId, brand_id: foreign.scope.brandId, environment_id: foreign.scope.environmentId, product_instance_id: foreign.scope.productInstanceId, ...('id' in rows[0] ? { id: randomUUID() } : {}) };
    await denied(first.scope, insert, [JSON.stringify(attack)], '42501');
    const mutable = Boolean((await db.query<Row>("SELECT has_table_privilege('azuriya_app',$1,'UPDATE') AS allowed", [table])).rows[0].allowed);
    if (mutable) assert.equal((await db.transaction(foreign.scope, tx => tx.query(`UPDATE ${table} SET organization_id=organization_id WHERE organization_id=$1 RETURNING organization_id`, [first.scope.organizationId]))).rows.length, 0);
    else await denied(first.scope, `UPDATE ${table} SET organization_id=organization_id`, [], '42501');
    const wrongOwner: Row = { ...rows[0], ...('id' in rows[0] ? { id: randomUUID() } : {}) };
    if ('connection_id' in wrongOwner) wrongOwner.connection_id = foreign.connectionId;
    else if ('document_id' in wrongOwner) wrongOwner.document_id = foreign.documentId;
    else wrongOwner.brand_id = foreign.scope.brandId;
    if ('provider_idempotency_key' in wrongOwner) wrongOwner.provider_idempotency_key = randomUUID();
    if ('provider_event_id' in wrongOwner) wrongOwner.provider_event_id = `evt_foreign_${randomUUID().replaceAll('-', '')}`;
    if ('evidence_fingerprint' in wrongOwner) wrongOwner.evidence_fingerprint = randomBytes(32).toString('hex');
    await denied({ core: true }, insert, [JSON.stringify(wrongOwner)], '23503');
    rls.push({ table, positive_rows: rows.length, force_rls: true, bad_scope_read_controls: 10, wrong_scope_insert: '42501', foreign_update_or_immutable_control: 'passed' });
    composites.push({ table, wrong_resource_or_parent_owner: '23503' });
  }
  for (const table of ['connector_payment_observations', 'connector_health_history', 'brokerage_kyc_scan_evidence']) await denied({ core: true }, `UPDATE ${table} SET organization_id=organization_id`, [], '42501');
  const wrongProviderEnvelope = await connectorVault(db, first.scope).store({ organizationId: first.scope.organizationId, providerId: trading, productInstanceId: first.scope.productInstanceId }, { purpose: 'protocol_fixture_ownership_probe', value: 'not_external_provider_credentials' });
  const foreignEnvelope = await connectorVault(db, foreign.scope).store({ organizationId: foreign.scope.organizationId, providerId: stripe, productInstanceId: foreign.scope.productInstanceId }, { purpose: 'protocol_fixture_ownership_probe', value: 'not_external_provider_credentials' });
  await denied({ core: true }, 'UPDATE brokerage_connections SET credential_reference=$1 WHERE id=$2', [wrongProviderEnvelope, first.connectionId], '23503');
  await denied({ core: true }, 'UPDATE brokerage_connections SET credential_reference=$1 WHERE id=$2', [foreignEnvelope, first.connectionId], '23503');
  await denied({ core: true }, 'UPDATE connector_operations SET secret_reference=$1 WHERE connection_id=$2', [foreignEnvelope, first.connectionId], '23503');
  await denied({ core: true }, 'UPDATE brokerage_offerings SET connection_id=$1 WHERE id=$2', [first.connectionId, first.offeringId], '23503');
  await denied({ core: true }, 'UPDATE connector_reconciliations SET resource_id=$1 WHERE connection_id=$2', [foreign.paymentId, first.connectionId], '23503');
  evidence.rls = rls; evidence.composite_ownership = composites; evidence.immutable_evidence = 'Payment observations, health history and scan evidence reject UPDATE with 42501';
  evidence.additional_ownership = ['Wrong-provider encrypted credential rejected 23503', 'Foreign-instance credential rejected 23503', 'Foreign operation secret rejected 23503', 'Offering/provider connection mismatch rejected 23503', 'Foreign reconciliation payment rejected 23503'];
  stage = 'api_acceptance';
  const a = `/api/v1/instances/${first.scope.productInstanceId}/brokerage`, b = `/api/v1/instances/${foreign.scope.productInstanceId}/brokerage`;
  const own = { cookie: first.maker.cookie }, client = { cookie: first.client.cookie };
  const controls: Row[] = [];
  for (const path of ['connectors', 'connector-operations', 'reconciliation']) {
    const deniedRead: LightMyRequestResponse = await app.inject({ url: `${b}/${path}`, headers: own, remoteAddress: address() }); assert.equal(deniedRead.statusCode, 403); controls.push({ path, foreign_workspace_read: 403 });
  }
  assert.equal((await app.inject({ url: `${a}/connectors/${foreign.connectionId}/history`, headers: own, remoteAddress: address() })).statusCode, 404);
  assert.equal((await app.inject({ url: `${a}/kyc/documents?case_id=${foreign.kycId}`, headers: own, remoteAddress: address() })).statusCode, 404);
  const paymentPortal = `/api/v1/client/instances/${first.scope.productInstanceId}/brokerage/deposits`;
  assert.equal((await app.inject({ url: `${paymentPortal}/${foreign.paymentId}/provider`, headers: client, remoteAddress: address() })).statusCode, 404);
  controls.push({ foreign_connector_history: 404, foreign_kyc_metadata: 404, foreign_client_payment: 404 }); evidence.api_adversarial = controls;
  const metadata = await app.inject({ url: `${a}/kyc/documents?case_id=${first.kycId}`, headers: own, remoteAddress: address() }); assert.equal(metadata.statusCode, 200); assert.equal(metadata.json().data.length, 45); assert.equal(metadata.json().storage.configured, false); assert.equal(metadata.json().storage.scanner_configured, false);
  const requestNoStorage = await app.inject({ method: 'PUT', url: `/api/v1/client/instances/${first.scope.productInstanceId}/brokerage/kyc/documents/${first.documentId}/upload`, headers: { cookie: first.client.cookie, 'x-csrf-token': first.client.csrf, 'idempotency-key': randomUUID(), 'content-type': 'application/octet-stream' }, payload: Buffer.from('%PDF-1.7\nFixture upload\n%%EOF\n'), remoteAddress: address() }); assert.equal(requestNoStorage.statusCode, 503); assert.equal(requestNoStorage.json().error.code, 'PRIVATE_DOCUMENT_STORAGE_UNAVAILABLE');
  evidence.external_acceptance = { trading: 'blocked: no authorized Brand API credentials configured', payment: 'blocked: no authorized sandbox API/signing credentials configured', storage: 'blocked: private object storage not configured', scanner: 'blocked: malware scanner not configured', upload_safely_rejected: 503, no_clean_document_or_funds_or_external_account_created: true };
  stage = 'internal_performance';
  const benchmarks = [['connection_listing', `${a}/connectors?limit=20&offset=20`, true], ['reconciliation_worklist', `${a}/reconciliation?limit=20&offset=20`, true], ['kyc_document_metadata', `${a}/kyc/documents?case_id=${first.kycId}`, false], ['payment_history', `${a}/deposits?limit=20&offset=20`, true]] as const;
  const measurements: Row[] = [];
  for (const [operation, url, paginated] of benchmarks) {
    const permission = operation === 'payment_history' ? 'brokerage.finance.read' : operation === 'kyc_document_metadata' ? 'brokerage.kyc.read' : 'brokerage.connections.read';
    // Independent least-privilege read credentials respect the normal per-key
    // rate limits; no limiter is disabled or changed for the benchmark.
    const credential = await foundation.createApiKey(first.scope, { name: `Internal acceptance ${operation}`, scopes: [permission] });
    const benchmarkHeaders = { authorization: `Bearer ${credential.secret}` };
    const positive: LightMyRequestResponse = await app.inject({ url, headers: benchmarkHeaders, remoteAddress: address() }); assert.equal(positive.statusCode, 200);
    if (paginated) { assert.equal(positive.json().pagination.limit, 20); assert.equal(positive.json().pagination.offset, 20); assert.ok(positive.json().data.length > 0); }
    const durations: number[] = []; let errors = 0; const started = performance.now();
    for (let batch = 0; batch < 10; batch++) await Promise.all(Array.from({ length: 5 }, async () => { const begin = performance.now(); const response = await app!.inject({ url, headers: benchmarkHeaders, remoteAddress: address() }); durations.push(performance.now() - begin); if (response.statusCode !== 200) errors++; }));
    durations.sort((left, right) => left - right); assert.equal(errors, 0);
    const percentile = (fraction: number) => Number(durations[Math.ceil(durations.length * fraction) - 1].toFixed(2));
    measurements.push({ operation, requests: 50, concurrency: 5, p50_ms: percentile(.5), p95_ms: percentile(.95), p99_ms: percentile(.99), throughput_rps: Number((50 / ((performance.now() - started) / 1000)).toFixed(2)), errors, pagination_verified: paginated });
  }
  evidence.performance = { method: 'Fastify injection + four least-privilege read API credentials + real TLS PostgreSQL; normal limiters enabled; no external provider calls or external latency included', requests: 200, measurements };
  evidence.fixture = { businesses: businesses.map(value => value.name), connections_per_business: 26, payment_requests_per_business: 45, documents_per_case: 45, staff_mfa_enrollments: 2 };
  evidence.status = 'passed'; await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status: 'passed', evidence: 'artifacts/connector-acceptance/evidence.json', rls_tables: tables.length, performance: measurements }, null, 2));
} catch (error) {
  evidence.status = 'failed'; evidence.failure = { stage, code: (error as { code?: string }).code ?? 'ACCEPTANCE_FAILED', message: error instanceof assert.AssertionError ? error.message : 'Acceptance step failed; no secret or raw query logged.' };
  await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.error(JSON.stringify(evidence.failure)); process.exitCode = 1;
} finally { await app?.close(); await db?.close(); await owner.end(); }
