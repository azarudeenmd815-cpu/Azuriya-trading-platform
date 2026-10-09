import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { buildApp } from '../src/server/app.js';
import { hashPassword } from '../src/server/security/crypto.js';
import { totp } from '../src/server/security/totp.js';
import { ActivationService } from '../src/server/domain/activation-service.js';
import { BrokerageFinanceService, exactAmount, UnavailablePaymentProvider } from '../src/server/brokerage/finance.js';
import { permissions, type Row, type TenantContext } from '../src/shared/types.js';

describe('Brokerage finance and IB persisted security boundaries',()=>{
  let db:Database;let app:FastifyInstance;let service:BrokerageFinanceService;
  let first:TenantContext;let second:TenantContext;let reviewer:TenantContext;let approver:TenantContext;let ownerClient:TenantContext;let otherClient:TenantContext;
  let method:string;let providerMethod:string;let account:string;let destinationAccount:string;let foreignAccount:string;let clientId:string;let otherClientId:string;
  let staffCookie='';let clientCookie='';let clientCsrf='';
  let partner:Row;let plan:Row;let accrual:Row;
  const makerId=randomUUID(),reviewerId=randomUUID(),approverId=randomUUID(),userId=randomUUID(),otherUserId=randomUUID();
  const password='finance-test-password-123';const secretAccount='GB82WEST12345698765432';
  const key=Buffer.alloc(32,41).toString('base64');const previousKey=process.env.SECRET_ENCRYPTION_KEY;
  const destination={beneficiary:'Ada Trader',iban:secretAccount,bank_name:'Private Bank'};
  const scopeValues=(scope:TenantContext)=>[scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId];
  const depositInput=(amount='10.00000001')=>({client_id:clientId,account_id:account,payment_method_id:method,amount,currency:'USD'});
  const withdrawalInput=()=>({...depositInput('0.10000001'),destination});
  beforeAll(async()=>{
    process.env.SECRET_ENCRYPTION_KEY=key;db=await createDatabase();await migrate(db);await seedCatalog(db);
    await db.transaction({core:true},async tx=>{
      const hash=await hashPassword(password);
      for(const[id,email]of[[makerId,'finance-maker@test.local'],[reviewerId,'finance-reviewer@test.local'],[approverId,'finance-approver@test.local'],[userId,'finance-client@test.local'],[otherUserId,'finance-other@test.local']])await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',[id,email,hash,email]);
    });
    const foundation=new FoundationService(db);
    for(const slug of ['finance-alpha','finance-beta']){
      const organization=await foundation.createOrganization({core:true,userId:makerId,requestId:randomUUID()},{name:slug,slug,business_type:'brokerage',brand_name:slug,environment_name:'Production',environment_kind:'production',products:['brokerage-crm'],plan:'test',owner_email:'finance-maker@test.local'});
      const instance=(await db.transaction({core:true},tx=>tx.query<Row>('SELECT * FROM product_instances WHERE organization_id=$1',[organization.id]))).rows[0];
      const scope:TenantContext={core:false,userId:makerId,requestId:randomUUID(),organizationId:String(organization.id),brandId:String(instance.brand_id),environmentId:String(instance.environment_id),productInstanceId:String(instance.id),productSlug:'brokerage-crm',permissions:[...permissions]};
      if(!first)first=scope;else second=scope;
    }
    reviewer={...first,userId:reviewerId};approver={...first,userId:approverId};ownerClient={...first,userId};otherClient={...first,userId:otherUserId};
    clientId=randomUUID();otherClientId=randomUUID();account=randomUUID();destinationAccount=randomUUID();foreignAccount=randomUUID();
    await db.transaction({core:true},async tx=>{
      const role=(await tx.query<{role_id:string}>('SELECT role_id FROM staff_memberships WHERE organization_id=$1 AND user_id=$2',[first.organizationId,makerId])).rows[0].role_id;
      for(const staff of [reviewerId,approverId])await tx.query('INSERT INTO staff_memberships(id,organization_id,user_id,role_id,environment_id,product_instance_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),first.organizationId,staff,role,first.environmentId,first.productInstanceId]);
      for(const[id,user,email]of[[clientId,userId,'finance-client@test.local'],[otherClientId,otherUserId,'finance-other@test.local']]){
        await tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)',[randomUUID(),first.organizationId,user,first.productInstanceId]);
        await tx.query("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,kyc_status,onboarding_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active','GB','approved','complete')",[id,...scopeValues(first),user,`CLI-${id}`,'Ada Trader',email]);
      }
      const provider=(await tx.query<{id:string}>('SELECT id FROM integration_providers ORDER BY slug LIMIT 1')).rows[0].id;
      const offering=randomUUID();await tx.query("INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES($1,$2,$3,$4,$5,'Live', $6,'live','[\"USD\"]','[100]',$7)",[offering,...scopeValues(first),provider,makerId]);
      for(const[id,client]of[[account,clientId],[destinationAccount,clientId],[foreignAccount,otherClientId]])await tx.query("INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,status,external_account_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'live','USD',100,'active',$10,$11)",[id,...scopeValues(first),client,offering,provider,`ACC-${id}`,`confirmed-${id}`,makerId]);
      providerMethod=String((await new BrokerageFinanceService({query:tx.query,close:async()=>{},transaction:async(_scope,work)=>work(tx)},key).savePaymentMethod(first,{name:'Unimplemented provider',kind:'provider',provider_id:provider,currencies:['USD']})).id);
    });
    service=new BrokerageFinanceService(db,key);method=String((await service.savePaymentMethod(first,{name:'Confirmed offline transfer',kind:'manual',currencies:['USD']})).id);
    app=await buildApp({db,origin:'http://localhost',production:false,requireWorker:false});
    for(const[email,staff]of[['finance-maker@test.local',true],['finance-client@test.local',false]]as const){const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{email,password}});expect(login.statusCode,login.body).toBe(200);const cookie=login.cookies.map(item=>`${item.name}=${item.value}`).join('; ');if(staff){staffCookie=cookie;}else{clientCookie=cookie;clientCsrf=login.json().data.csrf_token;}}
  });
  afterAll(async()=>{await app?.close();await db?.close();if(previousKey===undefined)delete process.env.SECRET_ENCRYPTION_KEY;else process.env.SECRET_ENCRYPTION_KEY=previousKey;});
  it('uses exact decimal strings and rejects floats, zero, exponent, signs and excessive precision',()=>{
    expect(exactAmount.parse('99999999999999999999.99999999')).toBe('99999999999999999999.99999999');
    for(const value of [0.1,'0','0.00000000','-1','+1','1e3','01.00','0.123456789','100000000000000000000'])expect(exactAmount.safeParse(value).success).toBe(false);
  });
  it('persists deposits and immutable observations without creating account balances',async()=>{
    const payment=await service.createPayment(first,'deposit',depositInput());expect(payment).toMatchObject({client_id:clientId,status:'pending',amount:'10.00000001',currency:'USD'});
    expect((await service.listPayments(first,'transactions',{client_id:clientId})).data.some(row=>row.request_id===payment.id&&row.status==='pending')).toBe(true);
    expect((await db.transaction(first,tx=>tx.query("SELECT column_name FROM information_schema.columns WHERE table_name='brokerage_accounts' AND column_name IN('balance','equity')"))).rows).toEqual([]);
  });
  it('validates account ownership, currency, client state and payment-method eligibility',async()=>{
    await expect(service.createPayment(first,'deposit',{...depositInput(),account_id:foreignAccount})).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(service.createPayment(first,'deposit',{...depositInput(),currency:'EUR'})).rejects.toMatchObject({code:'ACCOUNT_INELIGIBLE'});
    await expect(service.createPayment(first,'deposit',{...depositInput(),payment_method_id:randomUUID()})).rejects.toMatchObject({code:'PAYMENT_METHOD_INELIGIBLE'});
    await db.transaction(first,tx=>tx.query("UPDATE brokerage_clients SET status='suspended' WHERE id=$1",[clientId]));
    await expect(service.createPayment(first,'deposit',depositInput())).rejects.toMatchObject({code:'CLIENT_INELIGIBLE'});
    await db.transaction(first,tx=>tx.query("UPDATE brokerage_clients SET status='active' WHERE id=$1",[clientId]));
  });
  it('requires idempotency on client monetary requests and safely replays one persisted result',async()=>{
    const url=`/api/v1/client/instances/${first.productInstanceId}/brokerage/deposits`;const headers={cookie:clientCookie,'x-csrf-token':clientCsrf};const payload={account_id:account,payment_method_id:method,amount:'0.10000001',currency:'USD'};
    expect((await app.inject({method:'POST',url,headers,payload})).json().error.code).toBe('IDEMPOTENCY_REQUIRED');
    const idem={...headers,'idempotency-key':`deposit-${randomUUID()}`};const original=await app.inject({method:'POST',url,headers:idem,payload});expect(original.statusCode,original.body).toBe(200);
    const replay=await app.inject({method:'POST',url,headers:idem,payload});expect(replay.json()).toEqual(original.json());expect(replay.headers['idempotency-replayed']).toBe('true');
    expect((await app.inject({method:'POST',url,headers:idem,payload:{...payload,amount:'2'}})).json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('blocks cross-client and cross-tenant access, including forged ownership and own transaction lists',async()=>{
    const payment=await service.createPayment(first,'deposit',depositInput());
    await expect(service.createPayment(otherClient,'deposit',depositInput(),true)).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(service.changePaymentStatus(otherClient,'deposit',String(payment.id),{status:'cancelled',reason:'Cancel another client'},true)).rejects.toMatchObject({code:'NOT_FOUND'});
    expect((await service.listPayments(otherClient,'transactions',{},true)).data).toEqual([]);
    expect((await service.listPayments(second,'deposit',{})).data).toEqual([]);
    await expect(service.changePaymentStatus(second,'deposit',String(payment.id),{status:'cancelled',reason:'Wrong tenant'})).rejects.toMatchObject({code:'NOT_FOUND'});
    const response=await app.inject({method:'POST',url:`/api/v1/client/instances/${first.productInstanceId}/brokerage/deposits`,headers:{cookie:clientCookie,'x-csrf-token':clientCsrf,'idempotency-key':randomUUID()},payload:depositInput()});expect(response.json().error.code).toBe('CLIENT_SCOPE_IMMUTABLE');
  });
  it('enforces clearance, maker/checker separation, reference confirmation and terminal transitions',async()=>{
    const payment=await service.createPayment(first,'deposit',depositInput());const id=String(payment.id);
    await expect(service.reviewPayment(first,'deposit',id,{decision:'clear',reason:'Same maker'})).rejects.toMatchObject({code:'MAKER_CHECKER_REQUIRED'});
    await service.changePaymentStatus(approver,'deposit',id,{status:'processing',reason:'Review offline payment'});
    await expect(service.changePaymentStatus(approver,'deposit',id,{status:'completed',reason:'No review',reference:'BANK-001'})).rejects.toMatchObject({code:'REVIEW_REQUIRED'});
    await service.reviewPayment(reviewer,'deposit',id,{decision:'clear',reason:'Independent receipt checked'});
    await expect(service.changePaymentStatus(approver,'deposit',id,{status:'completed',reason:'Missing reference'})).rejects.toMatchObject({code:'PAYMENT_REFERENCE_REQUIRED'});
    const complete=await service.changePaymentStatus(approver,'deposit',id,{status:'completed',reason:'Offline payment independently confirmed',reference:'BANK-001'});expect(complete.status).toBe('completed');
    await expect(service.changePaymentStatus(approver,'deposit',id,{status:'completed',reason:'Duplicate',reference:'BANK-001'})).rejects.toMatchObject({code:'INVALID_TRANSITION'});
    const reversed=await service.changePaymentStatus(approver,'deposit',id,{status:'reversed',reason:'Confirmed offline return',reference:'RETURN-001'});expect(reversed.status).toBe('reversed');
    const observations=(await service.listPayments(first,'transactions',{client_id:clientId})).data.filter(row=>row.request_id===id);expect(observations.some(row=>row.kind==='refund'&&row.status==='reversed')).toBe(true);
  });
  it('keeps transaction facts immutable in PostgreSQL even with Core context',async()=>{
    const observation=(await service.listPayments(first,'transactions',{})).data[0];
    await expect(db.transaction({core:true},tx=>tx.query('UPDATE brokerage_transactions SET amount=999 WHERE id=$1',[observation.id]))).rejects.toMatchObject({code:'42501'});
    await expect(db.transaction({core:true},tx=>tx.query('DELETE FROM brokerage_transactions WHERE id=$1',[observation.id]))).rejects.toMatchObject({code:'42501'});
  });
  it('encrypts and redacts withdrawal destinations from responses, observations, audit and replay records',async()=>{
    const url=`/api/v1/client/instances/${first.productInstanceId}/brokerage/withdrawals`;const headers={cookie:clientCookie,'x-csrf-token':clientCsrf,'idempotency-key':`withdraw-${randomUUID()}`};
    const payload={account_id:account,payment_method_id:method,amount:'10',currency:'USD',destination};const response=await app.inject({method:'POST',url,headers,payload});expect(response.statusCode,response.body).toBe(200);expect(response.body).not.toContain(secretAccount);expect(response.json().data.destination_summary).toBe('Bank ending 5432');
    const id=response.json().data.id;const envelope=(await db.transaction(first,tx=>tx.query<{destination_encrypted:string}>('SELECT destination_encrypted FROM brokerage_payment_requests WHERE id=$1',[id]))).rows[0].destination_encrypted;expect(envelope).toMatch(/^v1\./);expect(envelope).not.toContain(secretAccount);
    expect((await service.paymentDestination(approver,id)).destination).toEqual(destination);
    const stored=await db.transaction({core:true},async tx=>({audit:(await tx.query('SELECT metadata FROM audit_events WHERE resource_id=$1',[id])).rows,outbox:(await tx.query("SELECT payload FROM outbox_events WHERE payload->>'resource_id'=$1",[id])).rows,idem:(await tx.query('SELECT response FROM idempotency_records WHERE key=$1',[headers['idempotency-key']])).rows}));expect(JSON.stringify(stored)).not.toContain(secretAccount);expect(JSON.stringify(stored)).not.toContain('Private Bank');
    const replay=await app.inject({method:'POST',url,headers,payload});expect(replay.json()).toEqual(response.json());
  });
  it('authenticates destination envelopes against request, client and tenant binding',async()=>{
    const firstPayment=await service.createPayment(first,'withdrawal',withdrawalInput());const secondPayment=await service.createPayment(first,'withdrawal',withdrawalInput());
    const envelope=(await db.transaction(first,tx=>tx.query<{destination_encrypted:string}>('SELECT destination_encrypted FROM brokerage_payment_requests WHERE id=$1',[firstPayment.id]))).rows[0].destination_encrypted;
    await db.transaction(first,tx=>tx.query('UPDATE brokerage_payment_requests SET destination_encrypted=$1 WHERE id=$2',[envelope,secondPayment.id]));
    await expect(service.paymentDestination(approver,String(secondPayment.id))).rejects.toMatchObject({code:'DESTINATION_AUTHENTICATION_FAILED'});
    await expect(service.paymentDestination(second,String(firstPayment.id))).rejects.toMatchObject({code:'NOT_FOUND'});
  });
  it('requires separate withdrawal reviewer and approver and records confirmed manual payment',async()=>{
    const payment=await service.createPayment(first,'withdrawal',withdrawalInput());const id=String(payment.id);
    await service.reviewPayment(reviewer,'withdrawal',id,{decision:'clear',reason:'Destination and offline instruction verified'});
    await expect(service.changePaymentStatus(reviewer,'withdrawal',id,{status:'approved',reason:'Review and approve by same person'})).rejects.toMatchObject({code:'MAKER_CHECKER_REQUIRED'});
    await service.changePaymentStatus(approver,'withdrawal',id,{status:'approved',reason:'Independent approval'});
    await service.changePaymentStatus(reviewer,'withdrawal',id,{status:'processing',reason:'Manual bank operation queued'});
    await expect(service.changePaymentStatus(reviewer,'withdrawal',id,{status:'paid',reason:'No bank reference'})).rejects.toMatchObject({code:'PAYMENT_REFERENCE_REQUIRED'});
    expect((await service.changePaymentStatus(reviewer,'withdrawal',id,{status:'paid',reason:'Bank payment independently confirmed',reference:'WIRE-003'})).status).toBe('paid');
  });
  it('rejects staff high-risk HTTP actions without password and recently enrolled MFA',async()=>{
    const payment=await service.createPayment(first,'withdrawal',withdrawalInput());const url=`/api/v1/instances/${first.productInstanceId}/brokerage/withdrawals/${payment.id}/destination`;
    expect((await app.inject({url,headers:{cookie:staffCookie}})).json().error.code).toBe('REAUTH_REQUIRED');
    expect((await app.inject({url,headers:{cookie:staffCookie,'x-reauth-password':password}})).json().error.code).toBe('RECENT_MFA_REQUIRED');
    expect((await app.inject({url,headers:{cookie:clientCookie}})).statusCode).toBe(403);
    const denied=await app.inject({method:'POST',url:`/api/v1/client/instances/${first.productInstanceId}/brokerage/withdrawals/${payment.id}/status`,headers:{cookie:clientCookie,'x-csrf-token':clientCsrf,'idempotency-key':randomUUID()},payload:{status:'approved',reason:'Client approval attempt'}});expect(denied.json().error.code).toBe('CLIENT_FINANCE_DECISION_DENIED');
  });
  it('permits actual MFA-confirmed approval and rejects service credentials even with approve permission',async()=>{
    const payment=await service.createPayment(first,'withdrawal',withdrawalInput());await service.reviewPayment(reviewer,'withdrawal',String(payment.id),{decision:'clear',reason:'Independent clearance'});
    const url=`/api/v1/instances/${first.productInstanceId}/brokerage/withdrawals/${payment.id}/status`;
    const credential=await new ActivationService(db,key).createAccount(first,{name:'Finance integration',scopes:['brokerage.finance.approve','brokerage.finance.read','brokerage.finance.process']});
    const payload={status:'approved',reason:'Independent approval'};
    const denied=await app.inject({method:'POST',url,headers:{authorization:`Bearer ${credential.secret}`,'idempotency-key':randomUUID(),'x-reauth-password':password},payload});expect(denied.json().error.code).toBe('INTERACTIVE_APPROVAL_REQUIRED');
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{email:'finance-approver@test.local',password}});const cookie=login.cookies.map(item=>`${item.name}=${item.value}`).join('; ');const csrf=login.json().data.csrf_token;
    const challenge=await app.inject({method:'POST',url:'/api/v1/auth/mfa/enroll',headers:{cookie,'x-csrf-token':csrf},payload:{password}});expect(challenge.statusCode,challenge.body).toBe(200);
    const setup=await app.inject({method:'POST',url:'/api/v1/auth/mfa/setup',payload:{challenge_token:challenge.json().data.challenge_token}});
    const verify=await app.inject({method:'POST',url:'/api/v1/auth/mfa/verify',payload:{challenge_token:challenge.json().data.challenge_token,code:totp(setup.json().data.secret)}});expect(verify.statusCode,verify.body).toBe(200);
    const headers={cookie:verify.cookies.map(item=>`${item.name}=${item.value}`).join('; '),'x-csrf-token':verify.json().data.csrf_token,'idempotency-key':randomUUID(),'x-reauth-password':password};
    const approved=await app.inject({method:'POST',url,headers,payload});expect(approved.statusCode,approved.body).toBe(200);expect(approved.json().data.status).toBe('approved');
    const revealed=await app.inject({url:`/api/v1/instances/${first.productInstanceId}/brokerage/withdrawals/${payment.id}/destination`,headers});expect(revealed.statusCode,revealed.body).toBe(200);expect(revealed.json().data.destination).toEqual(destination);
  });
  it('keeps unavailable provider deposits pending and blocks changing their execution strategy',async()=>{
    const payment=await service.createPayment(first,'deposit',{...depositInput(),payment_method_id:providerMethod});expect(payment.status).toBe('provider_pending');
    await expect(service.changePaymentStatus(approver,'deposit',String(payment.id),{status:'completed',reason:'Fabricated provider success',reference:'INVALID'})).rejects.toMatchObject({code:'INVALID_TRANSITION'});
    await expect(service.savePaymentMethod(first,{name:'Flip provider to manual',kind:'manual',currencies:['USD']},providerMethod)).rejects.toMatchObject({code:'PAYMENT_METHOD_IN_USE'});
    expect(await new UnavailablePaymentProvider('example').createPayment()).toMatchObject({status:'unavailable'});
  });
  it('accepts the complete operational UI list query and returns scoped client names while rejecting forged client query scope',async()=>{
    const query='?search=&status=&limit=5&offset=0&sort=created_at&direction=desc';
    for(const resource of ['deposits','withdrawals','transfers','transactions','partners','referrals','commission-plans','accruals','payouts']){
      const response=await app.inject({url:`/api/v1/instances/${first.productInstanceId}/brokerage/${resource}${query}`,headers:{cookie:staffCookie}});expect(response.statusCode,response.body).toBe(200);expect(Array.isArray(response.json().data)).toBe(true);expect(response.json().pagination.limit).toBe(5);
    }
    const deposits=await app.inject({url:`/api/v1/instances/${first.productInstanceId}/brokerage/deposits${query}`,headers:{cookie:staffCookie}});expect(deposits.json().data[0].client_name).toBe('Ada Trader');
    for(const resource of ['deposits','withdrawals','transfers','transactions','payouts']){
      const response=await app.inject({url:`/api/v1/client/instances/${first.productInstanceId}/brokerage/${resource}${query}`,headers:{cookie:clientCookie}});expect(response.statusCode,response.body).toBe(200);
      const forged=await app.inject({url:`/api/v1/client/instances/${first.productInstanceId}/brokerage/${resource}?client_id=${clientId}`,headers:{cookie:clientCookie}});expect(forged.statusCode,forged.body).toBe(400);
    }
  });
  it('persists transfer intent and blocks cross-client accounts and fabricated completion',async()=>{
    await expect(service.createPayment(first,'transfer',{client_id:clientId,source_account_id:account,destination_account_id:foreignAccount,amount:'1',currency:'USD'})).rejects.toMatchObject({code:'NOT_FOUND'});
    const transfer=await service.createPayment(first,'transfer',{client_id:clientId,source_account_id:account,destination_account_id:destinationAccount,amount:'1',currency:'USD'});expect(transfer.status).toBe('provider_pending');
    await expect(service.changePaymentStatus(approver,'transfer',String(transfer.id),{status:'completed',reason:'No balance capability'})).rejects.toMatchObject({code:'INVALID_TRANSITION'});
    expect((await service.changePaymentStatus(ownerClient,'transfer',String(transfer.id),{status:'cancelled',reason:'Client cancelled'},true)).status).toBe('cancelled');
  });
  it('uses exact-scope RLS and composite client/account ownership in direct PostgreSQL queries',async()=>{
    expect((await db.query('SELECT id FROM brokerage_payment_requests')).rows).toEqual([]);
    expect((await db.transaction({organizationId:first.organizationId},tx=>tx.query('SELECT id FROM brokerage_payment_requests'))).rows).toEqual([]);
    expect((await db.transaction({...first,brandId:randomUUID()},tx=>tx.query('SELECT id FROM brokerage_payment_requests'))).rows).toEqual([]);
    await expect(db.transaction(first,tx=>tx.query("INSERT INTO brokerage_payment_requests(id,organization_id,brand_id,environment_id,product_instance_id,client_id,kind,account_id,payment_method_id,amount,currency,status,created_by) VALUES($1,$2,$3,$4,$5,$6,'deposit',$7,$8,1,'USD','pending',$9)",[randomUUID(),...scopeValues(first),clientId,foreignAccount,method,makerId]))).rejects.toMatchObject({code:'23503'});
    await expect(db.transaction(second,tx=>tx.query("INSERT INTO brokerage_payment_methods(id,organization_id,brand_id,environment_id,product_instance_id,name,kind,currencies,created_by) VALUES($1,$2,$3,$4,$5,'Scope escape','manual','[\"USD\"]',$6)",[randomUUID(),...scopeValues(first),makerId]))).rejects.toMatchObject({code:'42501'});
  });
  it('persists partner applications, controlled approval and immutable first-touch referrals',async()=>{
    partner=await service.applyPartner(ownerClient,{},true);expect(partner.status).toBe('applicant');
    await service.changePartnerStatus(reviewer,String(partner.id),{status:'review',reason:'Application reviewed'});
    await service.changePartnerStatus(approver,String(partner.id),{status:'approved',reason:'Approved partner'});
    await service.changePartnerStatus(approver,String(partner.id),{status:'active',reason:'Agreement completed'});
    const referral=await service.attributeReferral(otherClient,{referral_code:partner.referral_code,source:'campaign'},true);expect(referral.client_id).toBe(otherClientId);
    await expect(service.attributeReferral(ownerClient,{referral_code:partner.referral_code},true)).rejects.toMatchObject({code:'SELF_REFERRAL_DENIED'});
    await expect(service.attributeReferral(second,{client_id:otherClientId,referral_code:partner.referral_code})).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(service.attributeReferral(otherClient,{referral_code:partner.referral_code},true)).rejects.toMatchObject({code:'23505'});
    await expect(db.transaction({core:true},tx=>tx.query("UPDATE brokerage_referrals SET source='overwrite' WHERE id=$1",[referral.id]))).rejects.toMatchObject({code:'42501'});
    expect((await service.ownIb(ownerClient)).referrals).toHaveLength(1);
  });
  it('rejects referral attribution after the configured registration window',async()=>{
    const oldClient=randomUUID();await db.transaction(first,tx=>tx.query("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,client_number,full_name,email,status,created_at) VALUES($1,$2,$3,$4,$5,$6,'Old client','old-finance@test.local','registered',now()-interval '40 days')",[oldClient,...scopeValues(first),`CLI-${oldClient}`]));
    await expect(service.attributeReferral(first,{client_id:oldClient,referral_code:partner.referral_code})).rejects.toMatchObject({code:'ATTRIBUTION_WINDOW_CLOSED'});
  });
  it('models decimal commission configuration and immutable evidenced accruals without trading calculations',async()=>{
    plan=await service.saveCommissionPlan(first,{name:'CPA evidence',kind:'cpa',currency:'USD',configuration:{cpa_amount:'0.10000001'}});await service.assignPartnerPlan(first,String(partner.id),String(plan.id));
    accrual=await service.createAccrual(approver,{partner_id:partner.id,commission_plan_id:plan.id,client_id:otherClientId,amount:'0.10000001',currency:'USD',source_reference:'EVIDENCE-001',reason:'Confirmed qualifying referral'});expect(accrual).toMatchObject({amount:'0.10000001',origin:'manual_evidence'});
    await expect(service.createAccrual(approver,{partner_id:partner.id,commission_plan_id:plan.id,amount:'0.1',currency:'EUR',source_reference:'OTHER',reason:'Wrong currency'})).rejects.toMatchObject({code:'COMMISSION_CURRENCY_MISMATCH'});
    await expect(service.saveCommissionPlan(first,{name:'Rewrite accrued plan',kind:'cpa',currency:'USD',configuration:{cpa_amount:'2'}},String(plan.id))).rejects.toMatchObject({code:'PLAN_IN_USE'});
    await expect(db.transaction({core:true},tx=>tx.query('DELETE FROM brokerage_commission_accruals WHERE id=$1',[accrual.id]))).rejects.toMatchObject({code:'42501'});
    expect((await service.listPartners(second,'accruals')).data).toEqual([]);
  });
  it('sums payout accruals exactly, prevents duplicate allocation and preserves release history',async()=>{
    const secondAccrual=await service.createAccrual(approver,{partner_id:partner.id,commission_plan_id:plan.id,amount:'0.20000002',currency:'USD',source_reference:'EVIDENCE-002',reason:'Additional independently confirmed accrual'});
    const payout=await service.createPayout(ownerClient,{accrual_ids:[accrual.id,secondAccrual.id],destination},true);expect(payout.amount).toBe('0.30000003');expect(JSON.stringify(payout)).not.toContain(secretAccount);
    await expect(service.createPayout(ownerClient,{accrual_ids:[accrual.id],destination},true)).rejects.toMatchObject({code:'ACCRUAL_ALREADY_ALLOCATED'});
    await service.changePayoutStatus(ownerClient,String(payout.id),{status:'cancelled',reason:'Cancel before review'},true);
    const released=(await db.transaction(first,tx=>tx.query<{released_at:string|null}>('SELECT released_at FROM brokerage_payout_allocations WHERE payout_id=$1',[payout.id]))).rows;expect(released.every(row=>row.released_at!==null)).toBe(true);
    const replacement=await service.createPayout(ownerClient,{accrual_ids:[accrual.id],destination},true);expect(replacement.amount).toBe('0.10000001');
    await service.reviewPayout(reviewer,String(replacement.id),{decision:'clear',reason:'Accrual evidence and destination checked'});await service.changePayoutStatus(approver,String(replacement.id),{status:'approved',reason:'Independent finance approval'});await service.changePayoutStatus(reviewer,String(replacement.id),{status:'processing',reason:'Manual bank payment requested'});
    expect((await service.changePayoutStatus(reviewer,String(replacement.id),{status:'paid',reason:'Offline bank payment confirmed',reference:'PARTNER-WIRE-001'})).status).toBe('paid');
    expect((await service.listPartners(otherClient,'payouts',{},true)).data).toEqual([]);
    await expect(service.changePayoutStatus(otherClient,String(replacement.id),{status:'cancelled',reason:'Other partner'},true)).rejects.toMatchObject({code:'NOT_FOUND'});
  });
});
