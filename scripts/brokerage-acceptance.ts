/** Real PostgreSQL acceptance. Creates a new, isolated database on every invocation. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { createDatabase, type Database, type DatabaseContext } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { buildApp } from '../src/server/app.js';
import { FoundationService } from '../src/server/domain/service.js';
import { decryptSecret, hashPassword } from '../src/server/security/crypto.js';
import { totp } from '../src/server/security/totp.js';
import { permissions, type Row, type TenantContext } from '../src/shared/types.js';
import { scopeValues } from '../src/server/brokerage/common.js';
import { UnconfiguredPrivateKycStorage } from '../src/server/brokerage/accounts.js';

const root = resolve('artifacts/brokerage-acceptance');
const pgRoot = resolve('artifacts/pg-acceptance');
await mkdir(root, { recursive: true });
const caFile = join(pgRoot, 'certs/ca.crt');
const ca = await readFile(caFile, 'utf8');
const ownerPassword = (await readFile(join(pgRoot, 'owner-password.txt'), 'utf8')).trim();
const password = 'Brokerage-local-acceptance-2026!';
const encryptionKey = randomBytes(32).toString('base64');
process.env.SECRET_ENCRYPTION_KEY = encryptionKey;
const ownerBase = new URL('postgresql://127.0.0.1:54841/postgres');
ownerBase.username = 'azuriya_accept_owner'; ownerBase.password = ownerPassword;
const owner = new pg.Pool({ connectionString: ownerBase.toString(), ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 5000 });
const name = `brokerage_accept_${Date.now()}`;
const loginRole = `brokerage_accept_${randomBytes(6).toString('hex')}`;
const loginPassword = randomBytes(32).toString('hex');
const ownerUrl = new URL(ownerBase); ownerUrl.pathname = `/${name}`;
const runtimeUrl = new URL(ownerUrl); runtimeUrl.username = loginRole; runtimeUrl.password = loginPassword;
const evidence: Record<string, unknown> = {
  timestamp: new Date().toISOString(), database: name,
  environment: 'Isolated local PostgreSQL 16, verified TLS, separate non-owner NOBYPASSRLS runtime login',
  limitations: [
    'Fastify injection measures the HTTP application and real PostgreSQL, excluding network/browser rendering.',
    'Synthetic local fixture and concurrent reads are an acceptance baseline, not production capacity certification.',
    'Provider connectors, payment movement, provider balances and private KYC object storage are not configured.',
    'Manual outcomes record independently supplied operational references; no funds or trading accounts are created externally.',
    'KYC document registration persists metadata only; private object upload is separately verified unavailable.',
  ],
};
interface Session { userId: string; email: string; cookie: string; csrf: string; mfaSeed?: string; recoveryCodes?: string[] }
interface Business {
  name: string; scope: TenantContext; maker: Session; reviewer: Session; approver: Session;
  client: Session; clientId: string; referralClientId: string; accountId: string; pendingAccountId: string;
  offeringId: string; methodId: string; connectionId: string; kycId: string; partnerId: string;
}
const businesses: Business[] = [];
let db: Database | undefined; let app: FastifyInstance | undefined; let remoteIndex = 0;
function address() { const value = ++remoteIndex; return `127.19.${Math.floor(value / 200) % 200}.${value % 200 + 1}`; }
async function call(session: Session | undefined, method: InjectOptions['method'], url: string, payload?: unknown, expected = 200, risk = false, extraHeaders: Record<string,string> = {}) {
  const response = await app!.inject({ method, url, remoteAddress: address(), headers: {
    ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}),
    ...(method !== 'GET' ? { 'idempotency-key': randomUUID() } : {}),
    ...(risk ? { 'x-reauth-password': password } : {}), ...extraHeaders,
  }, ...(payload === undefined ? {} : { payload: payload as InjectOptions['payload'] }) });
  const body = response.json<{ data: Row; pagination?: { total:number; limit:number; offset:number }; error?: { code:string; details?:Row[] } }>();
  assert.equal(response.statusCode, expected, `${method} ${url}: expected ${expected}; got ${response.statusCode}, ${body.error?.code ?? 'success'}`);
  return { response, body, data: body.data };
}
async function login(userId: string, email: string, mfa = false): Promise<Session> {
  const initial = await call(undefined, 'POST', '/api/v1/auth/login', { email, password }, mfa ? 403 : 200);
  let result = initial; let seed: string | undefined;
  if (mfa) {
    const challenge = String(initial.body.error!.details![0].challenge_token);
    const setup = await call(undefined, 'POST', '/api/v1/auth/mfa/setup', { challenge_token:challenge });
    seed = String(setup.data.secret);
    result = await call(undefined, 'POST', '/api/v1/auth/mfa/verify', { challenge_token:challenge, code:totp(seed) });
  }
  return { userId, email, cookie: result.response.cookies.map(value => `${value.name}=${value.value}`).join('; '), csrf: String(result.data.csrf_token), ...(seed ? { mfaSeed: seed, recoveryCodes:result.data.recovery_codes as string[] } : {}) };
}
function routes(business: Business) { return { admin:`/api/v1/instances/${business.scope.productInstanceId}/brokerage`, client:`/api/v1/client/instances/${business.scope.productInstanceId}/brokerage` }; }
async function rejectsSql(context: DatabaseContext, sql: string, values: unknown[], code: string) {
  await assert.rejects(() => db!.transaction(context, tx => tx.query(sql, values)), error => (error as {code?:string}).code === code);
}

try {
  await owner.query(`CREATE DATABASE ${name}`);
  await owner.query(`CREATE ROLE ${loginRole} LOGIN PASSWORD '${loginPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await owner.query(`GRANT azuriya_app TO ${loginRole}`);
  db = await createDatabase({ url:runtimeUrl.toString(), migrationUrl:ownerUrl.toString(), requireTls:true, sslCa:ca });
  await migrate(db); await seedCatalog(db);
  const runtime = (await db.query<Row>(`SELECT current_user,session_user,r.rolsuper,r.rolbypassrls,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND pg_has_role(session_user,c.relowner,'MEMBER')) AS owns_tables FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
  assert.equal(runtime.current_user, 'azuriya_app'); assert.equal(runtime.rolsuper, false); assert.equal(runtime.rolbypassrls, false); assert.equal(runtime.owns_tables, false);
  evidence.runtime_role = runtime;
  const pid = Number((await db.query<Row>('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  assert.equal((await owner.query<{ssl:boolean}>('SELECT ssl FROM pg_stat_ssl WHERE pid=$1',[pid])).rows[0].ssl,true);
  evidence.tls = 'Runtime PostgreSQL connection observed encrypted; private CA and hostname verification enabled';
  app = await buildApp({ db, origin:'http://127.0.0.1:5174', production:false, requireWorker:false });
  const foundation = new FoundationService(db);
  const hash = await hashPassword(password);
  for (const [brand, slug, color, providerSlug] of [['ABC Markets','abc-markets','#2563EB','metatrader-5'],['XYZ Markets','xyz-markets','#0F766E','ctrader']] as const) {
    console.log(JSON.stringify({stage:'business_lifecycle',business:brand}));
    const ids = { maker:randomUUID(), reviewer:randomUUID(), approver:randomUUID() };
    await db.transaction({core:true},async tx => { for (const [kind,id] of Object.entries(ids)) await tx.query('INSERT INTO users(id,email,password_hash,display_name,mfa_required) VALUES($1,$2,$3,$4,true)',[id,`${slug}-${kind}@test.local`,hash,`${brand} ${kind}`]); });
    const organization = await foundation.createOrganization({core:true,userId:ids.maker,requestId:randomUUID()},{name:brand,slug,business_type:'brokerage',brand_name:brand,environment_name:'Production',environment_kind:'production',products:['brokerage-crm'],plan:'acceptance',owner_email:`${slug}-maker@test.local`});
    const instance = (organization.product_instances as Row[])[0];
    const scope: TenantContext = {core:false,userId:ids.maker,requestId:randomUUID(),organizationId:String(organization.id),brandId:String(instance.brand_id),environmentId:String(instance.environment_id),productInstanceId:String(instance.id),productSlug:'brokerage-crm',permissions:[...permissions]};
    await db.transaction({core:true},async tx => { for (const id of [ids.reviewer,ids.approver]) await tx.query('INSERT INTO staff_memberships(id,organization_id,user_id,role_id,environment_id,product_instance_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),scope.organizationId,id,organization.owner_role_id,scope.environmentId,scope.productInstanceId]); });
    await foundation.updateBranding(scope,{business_name:brand,product_display_name:`${brand} Client Office`,primary_color:color,support_email:`support@${slug}.test`,custom_footer:`${brand} customer services`});
    const maker = await login(ids.maker,`${slug}-maker@test.local`,true); const reviewer = await login(ids.reviewer,`${slug}-reviewer@test.local`,true); const approver = await login(ids.approver,`${slug}-approver@test.local`,true);
    const business = {name:brand,scope,maker,reviewer,approver} as Business; businesses.push(business);
    const {admin,client:portal} = routes(business);
    await call(maker,'PUT',`${admin}/settings`,{allowed_countries:['GB','IN'],restricted_countries:['US'],allowed_client_types:['individual'],minimum_age:18,require_kyc:true});
    await call(maker,'PATCH',`${admin}/finance-settings`,{maker_checker_required:true,referral_window_hours:720},200,true);
    await call(maker,'POST',`${admin}/email-templates`,{event_type:'brokerage.client.profile_saved',subject:'{{business_name}} profile update',body:'Hello {{client_name}}, your profile was updated.'});
    const clientEmail = `${slug}-client@test.local`;
    const created = (await call(maker,'POST',`${admin}/clients`,{full_name:`${brand} Client`,email:clientEmail,country:'GB',birth_date:'1990-01-01',client_type:'individual'},201)).data;
    business.clientId = String(created.id);
    const invitation = (await call(maker,'POST',`${admin}/clients/${created.id}/invite`,{},201)).data;
    const outbox = (await db.transaction({core:true},tx => tx.query<{payload:{encrypted_message:string}}>("SELECT payload FROM outbox_events WHERE organization_id=$1 AND event_type='invitation.email' ORDER BY created_at DESC",[scope.organizationId]))).rows;
    const message = outbox.map(row => JSON.parse(decryptSecret(row.payload.encrypted_message,encryptionKey)) as {invitation_id:string;return_url:string}).find(value => value.invitation_id===invitation.id)!;
    const token = message.return_url.split('#token=')[1];
    await call(undefined,'POST','/api/v1/auth/invitations/accept',{token,password,display_name:`${brand} Client`});
    const userId = String((await db.transaction({core:true},tx=>tx.query<Row>('SELECT id FROM users WHERE email=$1',[clientEmail]))).rows[0].id);
    business.client = await login(userId,clientEmail);
    assert.equal((await call(business.client,'GET',`${portal}/profile`)).data,null);
    assert.equal((await call(business.client,'PATCH',`${portal}/profile`,{full_name:`${brand} Client`,country:'GB',residence_country:'GB',birth_date:'1990-01-01',client_type:'individual',preferred_currency:'USD'})).data.id,created.id);
    const document = (await call(maker,'POST',`${admin}/consent-documents`,{document_type:'terms',version:'1.0',title:`${brand} Terms`,content:`${brand} exact consent terms version 1.0.`,required:true},201)).data;
    await call(business.client,'POST',`${portal}/consents`,{document_id:document.id,document_hash:'0'.repeat(64)},409);
    await call(business.client,'POST',`${portal}/consents`,{document_id:document.id,document_hash:document.document_hash},201);
    const kyc = (await call(business.client,'POST',`${portal}/kyc/cases`,{},201)).data; business.kycId = String(kyc.id);
    const metadata = (await call(business.client,'POST',`${portal}/kyc/documents`,{case_id:kyc.id,kind:'identity',filename:'identity.pdf',content_type:'application/pdf',size_bytes:1024},201)).data;
    assert.equal(metadata.storage_state,'awaiting_upload'); assert.equal(metadata.encryption_confirmed,false);
    assert.equal(((await call(business.client,'GET',`${portal}/verification`)).data.storage as Row).available,false);
    await assert.rejects(()=>new UnconfiguredPrivateKycStorage().createUpload(),error=>(error as {code?:string}).code==='PRIVATE_DOCUMENT_STORAGE_UNAVAILABLE');
    await call(reviewer,'POST',`${admin}/kyc/${kyc.id}/review`,{status:'in_review',reason:'Manual compliance review underway'},200,true);
    await call(approver,'POST',`${admin}/kyc/${kyc.id}/review`,{status:'approved',reason:'Identity independently checked in offline records',external_reference:`${slug}-offline-kyc-001`},200,true);
    await call(maker,'POST',`${admin}/clients/${created.id}/status`,{status:'active',reason:'Profile, exact consent and manual KYC completed'});
    const provider: Row = (await db.query<Row>('SELECT id,slug FROM integration_providers WHERE slug=$1',[providerSlug])).rows[0]; assert.ok(provider,`Provider catalog ${providerSlug}`);
    const secret = `acceptance-secret-${randomUUID()}`;
    const connection: Row = (await call(maker,'POST',`${admin}/connections`,{provider_id:provider.id,label:`${brand} ${providerSlug} requested connection`,credentials:{api_key:secret}},201,true)).data; business.connectionId = String(connection.id);
    assert.equal(connection.status,'requested'); assert.ok(!JSON.stringify(connection).includes(secret));
    const offering: Row = (await call(maker,'POST',`${admin}/offerings`,{name:`${brand} Standard Live`,provider_id:provider.id,connection_id:connection.id,account_type:'live',currencies:['USD'],leverage_options:[100,200],minimum_funding:'0',requires_kyc:true},201)).data; business.offeringId = String(offering.id);
    const account: Row = (await call(business.client,'POST',`${portal}/accounts/requests`,{offering_id:offering.id,currency:'USD',leverage:100},201)).data; business.accountId = String(account.id); assert.equal(account.status,'provider_pending');
    await call(maker,'POST',`${admin}/accounts/${account.id}/status`,{status:'active',reason:'Operational evidence is required'},422,true);
    await call(maker,'POST',`${admin}/accounts/${account.id}/status`,{status:'active',reason:'External account confirmed in offline provider records',external_account_id:`${slug}-external-1001`,external_login:`${slug}-1001`,external_reference:`${slug}-manual-confirmation-001`},200,true);
    const pending = (await call(business.client,'POST',`${portal}/accounts/requests`,{offering_id:offering.id,currency:'USD',leverage:200},201)).data; business.pendingAccountId = String(pending.id); assert.equal(pending.status,'provider_pending');
    const method = (await call(maker,'POST',`${admin}/payment-methods`,{name:`${brand} Offline Bank Transfer`,kind:'manual',currencies:['USD']})).data; business.methodId = String(method.id);
    const payment = {client_id:created.id,account_id:account.id,payment_method_id:method.id,amount:'100.12345678',currency:'USD'};
    const deposit = (await call(maker,'POST',`${admin}/deposits`,payment)).data;
    await call(maker,'POST',`${admin}/deposits/${deposit.id}/review`,{decision:'clear',reason:'Maker cannot review own deposit'},403);
    await call(reviewer,'POST',`${admin}/deposits/${deposit.id}/review`,{decision:'clear',reason:'Offline deposit verified separately'});
    await call(approver,'POST',`${admin}/deposits/${deposit.id}/status`,{status:'processing',reason:'Offline receipt reconciliation underway'},200,true);
    const completed = (await call(approver,'POST',`${admin}/deposits/${deposit.id}/status`,{status:'completed',reason:'Offline settlement independently verified',reference:`${slug}-bank-deposit-001`},200,true)).data; assert.equal(completed.amount,'100.12345678');
    const destination = {beneficiary:`${brand} Client`,iban:'GB82WEST12345698765432',bank_name:'Offline Acceptance Bank'};
    const withdrawal = (await call(maker,'POST',`${admin}/withdrawals`,{...payment,amount:'10.00000001',destination})).data;
    assert.ok(!JSON.stringify(withdrawal).includes(destination.iban));
    await call(reviewer,'POST',`${admin}/withdrawals/${withdrawal.id}/review`,{decision:'clear',reason:'Withdrawal source and destination reviewed'});
    await call(reviewer,'POST',`${admin}/withdrawals/${withdrawal.id}/status`,{status:'approved',reason:'Reviewer cannot also approve'},403,true);
    await call(approver,'POST',`${admin}/withdrawals/${withdrawal.id}/status`,{status:'approved',reason:'Separate approval after clear review'},200,true);
    await call(approver,'POST',`${admin}/withdrawals/${withdrawal.id}/status`,{status:'processing',reason:'Offline payout processing underway'},200,true);
    await call(approver,'POST',`${admin}/withdrawals/${withdrawal.id}/status`,{status:'paid',reason:'Offline payout independently confirmed',reference:`${slug}-bank-withdrawal-001`},200,true);
    const tag = (await call(maker,'POST',`${admin}/tags`,{name:`${brand} VIP`,color},201)).data;
    await call(maker,'POST',`${admin}/clients/${created.id}/tags/${tag.id}`,{});
    const note = (await call(maker,'POST',`${admin}/clients/${created.id}/notes`,{text:`Private internal acceptance note for ${brand}`,category:'compliance',pinned:true},201)).data;
    await call(maker,'PATCH',`${admin}/clients/${created.id}/notes/${note.id}`,{text:`Revised private internal acceptance note for ${brand}`});
    await call(maker,'POST',`${admin}/clients/${created.id}/assignments`,{role:'account_manager',staff_id:ids.maker});
    await call(maker,'POST',`${admin}/tasks`,{client_id:created.id,owner_id:ids.reviewer,title:`${brand} follow-up`,priority:'high'},201);
    const partner = (await call(business.client,'POST',`${portal}/ib/apply`,{campaign:`${slug} initial partners`})).data; business.partnerId = String(partner.id);
    await call(reviewer,'POST',`${admin}/partners/${partner.id}/status`,{status:'review',reason:'Partner due diligence underway'});
    await call(approver,'POST',`${admin}/partners/${partner.id}/status`,{status:'approved',reason:'Partner agreement independently approved'},200,true);
    await call(approver,'POST',`${admin}/partners/${partner.id}/status`,{status:'active',reason:'Partner onboarding completed'});
    const referralClient = (await call(maker,'POST',`${admin}/clients`,{full_name:`${brand} Referred Lead`,email:`${slug}-referred@test.local`,country:'GB'},201)).data; business.referralClientId = String(referralClient.id);
    await call(maker,'POST',`${admin}/referrals`,{client_id:referralClient.id,referral_code:partner.referral_code,source:'acceptance',campaign:slug});
    const plan = (await call(maker,'POST',`${admin}/commission-plans`,{name:`${brand} CPA v1`,kind:'cpa',currency:'USD',configuration:{cpa_amount:'25.00000001'}})).data;
    await call(maker,'POST',`${admin}/partners/${partner.id}/plan`,{commission_plan_id:plan.id});
    const accrual = (await call(maker,'POST',`${admin}/accruals`,{partner_id:partner.id,commission_plan_id:plan.id,client_id:referralClient.id,amount:'25.00000001',currency:'USD',source_reference:`${slug}-offline-commission-001`,reason:'Offline commission observation independently confirmed'},200,true)).data;
    const payout = (await call(maker,'POST',`${admin}/payouts`,{partner_id:partner.id,accrual_ids:[accrual.id],destination})).data;
    await call(reviewer,'POST',`${admin}/payouts/${payout.id}/review`,{decision:'clear',reason:'Commission allocation reviewed'});
    await call(approver,'POST',`${admin}/payouts/${payout.id}/status`,{status:'approved',reason:'Independent payout approval'},200,true);
    const safeProfile = await call(business.client,'GET',`${portal}/profile`);
    for (const hidden of ['risk_level','assigned_staff_id','Private internal','secret','destination_encrypted']) assert.ok(!safeProfile.response.body.includes(hidden),`Client profile excludes ${hidden}`);
    const audits = (await db.transaction(scope,tx=>tx.query<Row>("SELECT action,metadata FROM audit_events WHERE product_instance_id=$1 AND action LIKE 'brokerage.%'",[scope.productInstanceId]))).rows;
    for (const action of ['brokerage.account.requested','brokerage.deposit.completed','brokerage.withdrawal.paid','brokerage.partner.applied','brokerage.referral.attributed']) assert.ok(audits.some(row=>row.action===action),`Audit ${action}`);
    assert.ok(!JSON.stringify(audits).includes(secret)); assert.ok(!JSON.stringify(audits).includes(destination.iban));
  }
  // Private browser fixture intentionally contains only development credentials and MFA recovery material.
  await writeFile(join(root,'runtime.env'),`NODE_ENV=development\nPORT=3006\nDATABASE_URL=${runtimeUrl}\nMIGRATION_DATABASE_URL=${ownerUrl}\nDB_TLS_CA_FILE=${caFile}\nAPP_ORIGIN=http://127.0.0.1:5174\nSECRET_ENCRYPTION_KEY=${encryptionKey}\n`,{mode:0o600});
  await writeFile(join(root,'fixture.json'),JSON.stringify({password,businesses:businesses.map(business=>({...business,maker:{userId:business.maker.userId,email:business.maker.email,mfaSeed:business.maker.mfaSeed,recoveryCodes:business.maker.recoveryCodes},reviewer:{userId:business.reviewer.userId,email:business.reviewer.email,mfaSeed:business.reviewer.mfaSeed,recoveryCodes:business.reviewer.recoveryCodes},approver:{userId:business.approver.userId,email:business.approver.email,mfaSeed:business.approver.mfaSeed,recoveryCodes:business.approver.recoveryCodes},client:{userId:business.client.userId,email:business.client.email}}))},null,2),{mode:0o600});
  console.log(JSON.stringify({stage:'browser_fixture_ready',runtime_env:'artifacts/brokerage-acceptance/runtime.env',fixture:'artifacts/brokerage-acceptance/fixture.json'}));

  const first = businesses[0]; const second = businesses[1]; const a = routes(first); const b = routes(second);
  // Valid sibling hierarchy within ABC: each exact instance, brand and environment must remain isolated.
  const siblingBrand = randomUUID(); const siblingEnv = randomUUID();
  await db.transaction({core:true},async tx=>{
    await tx.query('INSERT INTO brands(id,organization_id,name) VALUES($1,$2,$3)',[siblingBrand,first.scope.organizationId,'ABC Sibling Brand']);
    await tx.query("INSERT INTO environments(id,organization_id,brand_id,name,kind) VALUES($1,$2,$3,'Sibling Sandbox','sandbox')",[siblingEnv,first.scope.organizationId,siblingBrand]);
  });
  const sibling = await foundation.provision({core:true,userId:first.maker.userId,requestId:randomUUID()},{organization_id:first.scope.organizationId,brand_id:siblingBrand,environment_id:siblingEnv,product_slug:'brokerage-crm',plan:'acceptance'});
  const siblingScope = {...first.scope,brandId:siblingBrand,environmentId:siblingEnv,productInstanceId:String(sibling.id)};
  const sameHierarchyInstance = await foundation.provision({core:true,userId:first.maker.userId,requestId:randomUUID()},{organization_id:first.scope.organizationId,brand_id:first.scope.brandId,environment_id:first.scope.environmentId,product_slug:'prop-crm',plan:'acceptance'});
  const siblingContexts: DatabaseContext[] = [{}, {organizationId:first.scope.organizationId}, {...first.scope,brandId:undefined}, {...first.scope,environmentId:undefined}, {...first.scope,productInstanceId:undefined}, {...first.scope,brandId:second.scope.brandId}, {...first.scope,environmentId:second.scope.environmentId}, {...first.scope,productInstanceId:second.scope.productInstanceId}, siblingScope, {...first.scope,productInstanceId:String(sameHierarchyInstance.id)}];
  const policies = (await db.transaction({core:true},tx=>tx.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname LIKE 'brokerage_%' AND relkind='r' ORDER BY relname"))).rows;
  const rlsEvidence: Row[] = [];
  for (const table of policies) {
    assert.ok(table.relrowsecurity && table.relforcerowsecurity,`${table.relname} FORCE RLS`);
    const rows = (await db.transaction(first.scope,tx=>tx.query<Row>(`SELECT * FROM ${table.relname}`))).rows;
    assert.ok(rows.length>0,`${table.relname} has positive-control scoped data`);
    assert.ok(rows.every(row=>row.organization_id===first.scope.organizationId&&row.brand_id===first.scope.brandId&&row.environment_id===first.scope.environmentId&&row.product_instance_id===first.scope.productInstanceId));
    for (const context of siblingContexts) assert.equal((await db.transaction(context,tx=>tx.query(`SELECT * FROM ${table.relname}`))).rows.length,0,`${table.relname} missing/tampered/sibling scope`);
    const columns = Object.keys(rows[0]);
    const attackRow = {...rows[0],organization_id:second.scope.organizationId,brand_id:second.scope.brandId,environment_id:second.scope.environmentId,product_instance_id:second.scope.productInstanceId};
    if ('id' in attackRow) attackRow.id=randomUUID();
    await rejectsSql(first.scope,`INSERT INTO ${table.relname} (${columns.join(',')}) SELECT ${columns.join(',')} FROM json_populate_record(NULL::${table.relname},$1::json)`,[JSON.stringify(attackRow)],'42501');
    const canUpdate = Boolean((await db.query<Row>("SELECT has_table_privilege('azuriya_app',$1,'UPDATE') AS allowed",[table.relname])).rows[0].allowed);
    if (canUpdate) assert.equal((await db.transaction(second.scope,tx=>tx.query(`UPDATE ${table.relname} SET organization_id=organization_id WHERE organization_id=$1 RETURNING organization_id`,[first.scope.organizationId]))).rows.length,0);
    else await rejectsSql(first.scope,`UPDATE ${table.relname} SET organization_id=organization_id`,[],'42501');
    rlsEvidence.push({table:table.relname,positive_rows:rows.length,force_rls:true,missing_and_sibling_read_controls:siblingContexts.length,cross_scope_insert_denied:true,foreign_update_or_immutable_denied:true});
  }
  evidence.rls = rlsEvidence;
  // Same instance, different client: the composite account owner FK blocks forged financial rows.
  await rejectsSql(first.scope,"INSERT INTO brokerage_payment_requests(id,organization_id,brand_id,environment_id,product_instance_id,client_id,kind,account_id,payment_method_id,amount,currency,status,created_by) VALUES($1,$2,$3,$4,$5,$6,'deposit',$7,$8,1,'USD','pending',$9)",[randomUUID(),...scopeValues(first.scope),first.referralClientId,first.accountId,first.methodId,first.maker.userId],'23503');
  await rejectsSql(first.scope,"INSERT INTO brokerage_notes(id,organization_id,brand_id,environment_id,product_instance_id,client_id,author_id,text) VALUES($1,$2,$3,$4,$5,$6,$7,'invalid foreign client')",[randomUUID(),...scopeValues(first.scope),second.clientId,first.maker.userId],'23503');
  const controls: Record<string,number> = {};
  for (const resource of ['clients','accounts','kyc','deposits','withdrawals','transactions','partners','connections','payment-methods']) controls[`foreign_staff_${resource}`]=(await call(first.maker,'GET',`${b.admin}/${resource}`,undefined,403)).response.statusCode;
  controls.client_staff_access=(await call(first.client,'GET',`${a.admin}/clients`,undefined,403)).response.statusCode;
  controls.client_foreign_portal=(await call(first.client,'GET',`${b.client}/profile`,undefined,403)).response.statusCode;
  controls.foreign_client_record=(await call(first.maker,'GET',`${a.admin}/clients/${second.clientId}`,undefined,404)).response.statusCode;
  controls.foreign_account_record=(await call(first.client,'GET',`${a.client}/accounts/${second.accountId}`,undefined,404)).response.statusCode;
  controls.overpost_client_identity=(await call(first.client,'PATCH',`${a.client}/profile`,{full_name:'Forge',status:'active',user_id:first.maker.userId},400)).response.statusCode;
  controls.client_selects_other_finance_owner=(await call(first.client,'POST',`${a.client}/deposits`,{client_id:first.referralClientId,account_id:first.accountId,payment_method_id:first.methodId,amount:'1',currency:'USD'},400)).response.statusCode;
  evidence.api_adversarial = controls;
  evidence.cross_client_foreign_keys = 'Same-instance payment with another client’s account rejected 23503; foreign-business note rejected 23503';
  evidence.lifecycle = businesses.map(business=>({business:business.name,branding:'independent business name and color',staff_mfa_enrollments:3,client:'admin-created → invitation → identity acceptance → profile → exact consent → manual KYC review/approval → active',accounts:'one manual confirmed account and one honest provider_pending',deposit:'maker → distinct clear reviewer → processing → confirmed completed',withdrawal:'maker → distinct clear reviewer → third approver → processing → confirmed paid',ib:'client application → review → approval → active → referral → plan → manual accrual → separately reviewed/approved payout',audit:'lifecycle events present; no provider secrets or unmasked destination'}));
  // Scale the client fixture without outbox side effects; UI page/filter/sort queries remain real.
  await db.transaction(first.scope,async tx=>{
    for(let index=0;index<250;index++)await tx.query("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,client_number,full_name,email,status,country) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'lead','GB')",[randomUUID(),...scopeValues(first.scope),`CLI-BENCH-${index}`,`ABC Benchmark Lead ${String(index).padStart(3,'0')}`,`abc-bench-${index}@test.local`]);
  });
  const benchmarks = [
    ['scoped_clients_list',first.maker,`${a.admin}/clients?search=ABC&status=lead&sort=full_name&direction=asc&limit=20&offset=20`,true],
    ['client_profile',first.client,`${a.client}/profile`,false],
    ['scoped_accounts',first.reviewer,`${a.admin}/accounts?search=ABC&status=provider_pending&sort=created_at&direction=desc&limit=20&offset=0`,true],
    ['scoped_transactions',first.approver,`${a.admin}/transactions?search=ABC&status=completed&sort=amount&direction=asc&limit=20&offset=0`,true],
    ['scoped_dashboard',first.maker,`${a.admin}/dashboard?from=2026-01-01&to=2026-12-31`,false],
  ] as const;
  const measurements: Row[] = [];
  for(const [operation,session,url,page] of benchmarks){
    const positive = await call(session,'GET',url); if(page)assert.ok(positive.body.pagination && positive.body.pagination.limit===20);
    const durations:number[]=[];let errors=0;const started=performance.now();
    for(let batch=0;batch<10;batch++)await Promise.all(Array.from({length:5},async()=>{const start=performance.now();const response=await app!.inject({url,headers:{cookie:session.cookie},remoteAddress:address()});durations.push(performance.now()-start);if(response.statusCode!==200)errors++;}));
    durations.sort((left,right)=>left-right);assert.equal(errors,0);
    const percentile=(fraction:number)=>Number(durations[Math.ceil(durations.length*fraction)-1].toFixed(2));
    measurements.push({operation,url,requests:50,concurrency:5,p50_ms:percentile(.5),p95_ms:percentile(.95),p99_ms:percentile(.99),throughput_rps:Number((50/((performance.now()-started)/1000)).toFixed(2)),errors,pagination_shape_verified:page});
  }
  evidence.performance = {fixture_clients:252,measurements,method:'50 requests/operation, batches of 5, real TLS PostgreSQL; query strings normalized to current CorePage UI pagination/search/status/sort'};
  evidence.database_metrics = db.metrics?.();
  evidence.status = 'passed';
  await writeFile(join(root,'evidence.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({status:'passed',businesses:businesses.map(value=>value.name),rls_tables:policies.length,performance:measurements,evidence:'artifacts/brokerage-acceptance/evidence.json'},null,2));
} catch(error) {
  evidence.status='failed'; evidence.failure={code:(error as {code?:string}).code ?? 'ACCEPTANCE_FAILED',message:error instanceof Error?error.message:'Unknown failure'};
  await writeFile(join(root,'evidence.json'),JSON.stringify(evidence,null,2));
  console.error(JSON.stringify(evidence.failure)); process.exitCode=1;
} finally { await app?.close(); await db?.close(); await owner.end(); }
