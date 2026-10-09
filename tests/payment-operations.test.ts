import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import type { TenantContext } from '../src/shared/types.js';
import { createDatabase,type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { BrokerageFinanceService } from '../src/server/brokerage/finance.js';
import { ConnectorRuntime } from '../src/server/connectors/runtime.js';
import type { ConnectorConnection,ExternalOperation,OperationExecution } from '../src/server/connectors/types.js';
import { stripeScopeFingerprint } from '../src/server/connectors/stripe-payment.js';

type Json=Record<string,unknown>;
async function execute(execution:OperationExecution){
  const module=await import('../src/server/connectors/payment-operations.js').catch(()=>undefined);
  expect(module?.executePaymentOperation,'Durable payment operations must exist.').toBeTypeOf('function');
  return module!.executePaymentOperation(execution);
}
describe('Persisted payment orchestration boundaries',()=>{
  let db:Database;let scope:TenantContext;let connection:ConnectorConnection;let providerId:string;let clientId:string;let accountId:string;let methodId:string;let transactionDepth=0;
  const sessions=new Map<string,Json>();const calls:Array<{method:string;url:string;key:string|null}>=[];
  const refundRecords=new Map<string,Json>();
  let lastReadSession:Json|undefined;
  const actor=randomUUID();
  const runtime=new ConnectorRuntime({maxAttempts:1,fetcher:async(url,options)=>{
    expect(transactionDepth,'Provider I/O must happen after the loading transaction commits.').toBe(0);
    const path=new URL(String(url));const headers=new Headers(options?.headers);const method=options?.method??'GET';calls.push({method,url:path.href,key:headers.get('Idempotency-Key')});
    let value:Json;
    if(method==='POST'&&path.pathname==='/v1/checkout/sessions'){
      const form=new URLSearchParams(String(options?.body));const reference=`cs_test_${randomUUID().replaceAll('-','')}`;
      const metadata=Object.fromEntries(['azuriya_scope','azuriya_connection','azuriya_request','azuriya_account'].map(key=>[key,form.get(`metadata[${key}]`)]));
      value={id:reference,object:'checkout.session',mode:'payment',livemode:false,amount_total:Number(form.get('line_items[0][price_data][unit_amount]')),currency:form.get('line_items[0][price_data][currency]'),status:'open',payment_status:'unpaid',expires_at:Math.floor(Date.now()/1000)+3600,url:`https://checkout.stripe.com/c/pay/${reference}`,client_reference_id:form.get('client_reference_id'),metadata,payment_intent:null};sessions.set(reference,value);
    }else if(method==='GET'&&path.pathname.startsWith('/v1/checkout/sessions/')){value=sessions.get(path.pathname.split('/').at(-1)!)!;lastReadSession=value;}
    else if(method==='POST'&&path.pathname.endsWith('/expire')){value=sessions.get(path.pathname.split('/').at(-2)!)!;value.status='expired';value.url=null;}
    else if(method==='GET'&&path.pathname==='/v1/disputes'){
      value={data:lastReadSession?.dispute_evidence??[],has_more:false};
    }
    else if(method==='GET'&&path.pathname.startsWith('/v1/refunds/'))value=refundRecords.get(path.pathname.split('/').at(-1)!)!;
    else throw new Error(`Unexpected fixture request ${method} ${path.pathname}`);
    if(!value)throw new Error('Provider record missing in fixture');return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  }});
  beforeAll(async()=>{
    const actual=await createDatabase();db={query:actual.query,close:()=>actual.close(),transaction:async(context,work)=>actual.transaction(context,async tx=>{transactionDepth++;try{return await work(tx);}finally{transactionDepth--;}})};
    await migrate(actual);await seedCatalog(db);
    await db.transaction({core:true},tx=>tx.query("INSERT INTO users(id,email,password_hash,display_name) VALUES($1,'payment-ops@test.local','unused','Payment operator')",[actor]));
    const organization=await new FoundationService(db).createOrganization({core:true,userId:actor,requestId:randomUUID()},{name:'Payment operations',slug:'payment-operations',business_type:'brokerage',brand_name:'Payment operations',environment_name:'Sandbox',environment_kind:'sandbox',products:['brokerage-crm'],plan:'test',owner_email:'payment-ops@test.local'});
    const instance=(await db.transaction({core:true},tx=>tx.query<Json>('SELECT * FROM product_instances WHERE organization_id=$1',[organization.id]))).rows[0];
    scope={core:false,userId:actor,requestId:randomUUID(),organizationId:String(organization.id),brandId:String(instance.brand_id),environmentId:String(instance.environment_id),productInstanceId:String(instance.id),productSlug:'brokerage-crm',permissions:[]};
    providerId=randomUUID();clientId=randomUUID();accountId=randomUUID();const offering=randomUUID();const connectionId=randomUUID();
    await db.transaction({core:true},async tx=>{
      await tx.query("INSERT INTO integration_providers(id,slug,name,category,description,status,connection_mode,supported_products,managed,connector_available) VALUES($1,'stripe','Stripe','payments','Payment protocol','active','api_key','[\"brokerage-crm\"]',false,true)",[providerId]);
      await tx.query("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,client_number,full_name,email,status,country,kyc_status,onboarding_status) VALUES($1,$2,$3,$4,$5,'PAY-ONE','Payment Client','payment-client@test.local','active','GB','approved','complete')",[clientId,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId]);
      await tx.query("INSERT INTO brokerage_connections(id,organization_id,brand_id,environment_id,product_instance_id,provider_id,label,status,provider_environment,credential_revision,created_by) VALUES($1,$2,$3,$4,$5,$6,'Stripe sandbox','connected','sandbox',1,$7)",[connectionId,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId,providerId,actor]);
      await tx.query("INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES($1,$2,$3,$4,$5,'Live account',$6,'live','[\"USD\"]','[100]',$7)",[offering,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId,providerId,actor]);
      await tx.query("INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,status,external_account_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PAY-ACCOUNT','live','USD',100,'active','external-one',$9)",[accountId,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId,clientId,offering,providerId,actor]);
    });
    connection={id:connectionId,organization_id:scope.organizationId,brand_id:scope.brandId,environment_id:scope.environmentId,product_instance_id:scope.productInstanceId,provider_id:providerId,provider_slug:'stripe',provider_environment:'sandbox',label:'Stripe sandbox',status:'connected',credential_reference:null,candidate_credential_reference:null,credential_revision:1,provider_account_reference:null,connector_version:'1.0.0',capabilities:['payment.create','payment.read'],created_by:actor};
    methodId=String((await new BrokerageFinanceService(db).savePaymentMethod(scope,{name:'Stripe test',kind:'provider',provider_id:providerId,currencies:['USD']})).id);
    await db.transaction(scope,tx=>tx.query('UPDATE brokerage_payment_methods SET connection_id=$1 WHERE id=$2',[connection.id,methodId]));
  });
  afterAll(async()=>{await db?.close();});
  async function operation(type='payment.create',paymentId?:string,override:Partial<ExternalOperation>={}){
    const payment=paymentId?{id:paymentId}:await new BrokerageFinanceService(db).createPayment(scope,'deposit',{client_id:clientId,account_id:accountId,payment_method_id:methodId,amount:'12.34000000',currency:'USD'});
    const id=randomUUID();const op:ExternalOperation={id,organization_id:scope.organizationId,brand_id:scope.brandId,environment_id:scope.environmentId,product_instance_id:scope.productInstanceId,connection_id:connection.id,operation_type:type,resource_type:'payment',resource_id:String(payment.id),account_id:null,payment_request_id:String(payment.id),provider_idempotency_key:randomUUID(),provider_reference:null,provider_secondary_reference:null,credential_revision:1,secret_reference:null,state:'running',attempt:1,max_attempts:8,lease_token:randomUUID(),started_at:new Date().toISOString(),created_at:new Date().toISOString(),created_by:actor,safe_evidence:{},...override};
    await db.transaction(scope,tx=>tx.query("INSERT INTO connector_operations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_type,resource_type,resource_id,payment_request_id,provider_idempotency_key,state,attempt,credential_revision,created_by,safe_evidence,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,$8,$9,'succeeded',$10,1,$11,$12,$13)",[id,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId,connection.id,type,op.resource_id,op.provider_idempotency_key,op.attempt,actor,JSON.stringify(op.safe_evidence),op.started_at]));
    return {db,scope,connection,operation:op,runtime,origin:'https://broker.test',credentials:{secret_key:'sk_test_protocol_fixture',webhook_secret:'whsec_fixture',environment:'sandbox'},providerContext:{scope:{organizationId:scope.organizationId,providerId,productInstanceId:scope.productInstanceId},credentialReference:'fixture',requestId:op.id,vault:{store:async()=>'',read:async()=>({})}}} satisfies OperationExecution;
  }
  async function apply(execution:OperationExecution){const result=await execute(execution);await db.transaction(scope,tx=>result.apply(tx));return result;}
  async function payment(id:string){return(await db.transaction(scope,tx=>tx.query<Json>('SELECT *,amount::text FROM brokerage_payment_requests WHERE id=$1',[id]))).rows[0];}
  function paid(reference:string,refund=0){const session=sessions.get(reference)!;session.status='complete';session.payment_status='paid';session.payment_intent={id:'pi_fixture',status:'succeeded',amount:1234,amount_received:1234,currency:'usd',livemode:false,metadata:session.metadata,latest_charge:{id:'ch_fixture',amount:1234,amount_captured:1234,amount_refunded:refund,currency:'usd',livemode:false,paid:true,disputed:false,payment_intent:'pi_fixture'}};}
  it('commits the request before provider I/O and persists a safe hosted action separately from funding',async()=>{
    const execution=await operation();const result=await apply(execution);const row=await payment(execution.operation.resource_id);
    expect(row).toMatchObject({status:'requires_action',provider_payment_reference:result.provider_reference,funding_status:'not_applicable'});expect(row.payment_action_url).toMatch(/^https:\/\/checkout.stripe.com\//);
    expect(calls.at(-1)?.key).toBe(execution.operation.provider_idempotency_key);expect(JSON.stringify(result.evidence)).not.toMatch(/sk_test|whsec|client_secret|payment_action_url|https:/);
  });
  it('deduplicates repeated completion and distinct callback types without duplicate deposits or funding',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);
    const sync=await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!,safe_evidence:{source:'webhook'}});await apply(sync);
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!,safe_evidence:{source:'reconciliation'}}));
    expect(await payment(create.operation.resource_id)).toMatchObject({status:'completed',funding_status:'funding_pending'});
    const rows=await db.transaction(scope,tx=>tx.query<Json>("SELECT * FROM brokerage_transactions WHERE request_id=$1 AND status='completed'",[create.operation.resource_id]));expect(rows.rows).toHaveLength(1);
    const observations=await db.transaction(scope,tx=>tx.query<Json>("SELECT * FROM connector_payment_observations WHERE payment_request_id=$1 AND canonical_status='completed'",[create.operation.resource_id]));expect(observations.rows).toHaveLength(1);
  });
  it('records only incremental partial-refund amounts and preserves the original completed observation',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    for(const refund of [200,200,500]){paid(first.provider_reference!,refund);await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));}
    const refunds=(await db.transaction(scope,tx=>tx.query<{amount:string}>("SELECT amount::text FROM brokerage_transactions WHERE request_id=$1 AND kind='refund' ORDER BY created_at,id",[create.operation.resource_id]))).rows;
    expect(refunds.map(row=>row.amount)).toEqual(['2.00000000','3.00000000']);expect(await payment(create.operation.resource_id)).toMatchObject({status:'completed',funding_status:'review_required'});
  });
  it('continues authoritative reconciliation after a client suspension',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);await db.transaction(scope,tx=>tx.query("UPDATE brokerage_clients SET status='suspended' WHERE id=$1",[clientId]));
    try{await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));expect(await payment(create.operation.resource_id)).toMatchObject({status:'completed'});}finally{await db.transaction(scope,tx=>tx.query("UPDATE brokerage_clients SET status='active' WHERE id=$1",[clientId]));}
  });
  it('rejects wrong amount and callback session substitution before financial effects',async()=>{
    const create=await operation();const first=await apply(create);const session=sessions.get(first.provider_reference!)!;session.amount_total=999;
    await expect(execute(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}))).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
    expect(await payment(create.operation.resource_id)).toMatchObject({status:'requires_action'});
  });
  it('refuses ambiguous creation older than the provider idempotency window',async()=>{
    const execution=await operation('payment.create',undefined,{attempt:2,started_at:new Date(Date.now()-25*3600000).toISOString(),created_at:new Date(Date.now()-25*3600000).toISOString()});const count=calls.length;
    await expect(execute(execution)).rejects.toMatchObject({code:'PAYMENT_CREATION_RECONCILIATION_REQUIRED',retryable:false});expect(calls).toHaveLength(count);
  });
  it('rejects connection environment mismatch and another tenant before provider I/O',async()=>{
    const execution=await operation();const count=calls.length;
    await expect(execute({...execution,credentials:{...execution.credentials,environment:'production'}})).rejects.toMatchObject({code:'PAYMENT_ENVIRONMENT_MISMATCH'});
    await expect(execute({...execution,scope:{...scope,brandId:randomUUID()}})).rejects.toMatchObject({code:'PAYMENT_SCOPE_MISMATCH'});expect(calls).toHaveLength(count);
  });
  it('preserves a completed payment against a stale pending provider observation',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    const session=sessions.get(first.provider_reference!)!;session.status='open';session.payment_status='unpaid';session.payment_intent=null;
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));expect(await payment(create.operation.resource_id)).toMatchObject({status:'completed',funding_status:'funding_pending',payment_action_url:null});
  });
  it('records exact immutable observations that cannot be updated',async()=>{
    const create=await operation();await apply(create);const observation=(await db.transaction(scope,tx=>tx.query<{id:string}>('SELECT id FROM connector_payment_observations WHERE payment_request_id=$1',[create.operation.resource_id]))).rows[0];
    await expect(db.transaction({core:true},tx=>tx.query('UPDATE connector_payment_observations SET amount=99 WHERE id=$1',[observation.id]))).rejects.toThrow();
  });
  it('binds the same normalized payment metadata to all four tenant dimensions',async()=>{
    expect(stripeScopeFingerprint(scope)).not.toBe(stripeScopeFingerprint({...scope,environmentId:randomUUID()}));
    const execution=await operation();const result=await execute(execution);const session=sessions.get(result.provider_reference!)!;
    expect(session.metadata).toMatchObject({azuriya_scope:stripeScopeFingerprint(scope),azuriya_request:execution.operation.resource_id,azuriya_account:accountId,azuriya_connection:connection.id});
  });
  it('restores a won partial chargeback through an adjustment without creating a second completed deposit',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    const session=sessions.get(first.provider_reference!)!;const intent=session.payment_intent as Json;(intent.latest_charge as Json).disputed=true;session.dispute_evidence=[{id:'du_fixture',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:200,currency:'usd',livemode:false,status:'under_review'}];
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    const chargeback=(await db.transaction(scope,tx=>tx.query<{amount:string}>("SELECT amount::text FROM brokerage_transactions WHERE request_id=$1 AND status='chargeback'",[create.operation.resource_id]))).rows;
    expect(chargeback.map(row=>row.amount)).toEqual(['2.00000000']);
    (session.dispute_evidence as Json[])[0].status='won';await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    expect(await payment(create.operation.resource_id)).toMatchObject({status:'completed',funding_status:'review_required'});
    expect((await db.transaction(scope,tx=>tx.query("SELECT id FROM brokerage_transactions WHERE request_id=$1 AND status='completed'",[create.operation.resource_id]))).rows).toHaveLength(1);
    expect((await db.transaction(scope,tx=>tx.query<{amount:string}>("SELECT amount::text FROM brokerage_transactions WHERE request_id=$1 AND status='chargeback_reinstated'",[create.operation.resource_id]))).rows[0].amount).toBe('2.00000000');delete session.dispute_evidence;
  });
  it('preserves local cancellation while reconciling an already created unpaid provider session',async()=>{
    const create=await operation();const result=await execute(create);await db.transaction(scope,tx=>tx.query("UPDATE brokerage_payment_requests SET status='cancelled' WHERE id=$1",[create.operation.resource_id]));await db.transaction(scope,tx=>result.apply(tx));
    expect(await payment(create.operation.resource_id)).toMatchObject({status:'cancelled',payment_action_url:null,provider_payment_reference:result.provider_reference});
  });
  it('detects request changes between external I/O and the result commit',async()=>{
    const create=await operation();const result=await execute(create);await db.transaction(scope,tx=>tx.query('UPDATE brokerage_payment_requests SET amount=13 WHERE id=$1',[create.operation.resource_id]));
    await expect(db.transaction(scope,tx=>result.apply(tx))).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
    expect((await db.transaction(scope,tx=>tx.query('SELECT id FROM connector_payment_observations WHERE payment_request_id=$1',[create.operation.resource_id]))).rows).toHaveLength(0);
  });
  it('refuses disconnected connections before external I/O',async()=>{
    const execution=await operation();const count=calls.length;await expect(execute({...execution,connection:{...connection,status:'disconnected'}})).rejects.toMatchObject({code:'PAYMENT_CONNECTION_UNAVAILABLE'});expect(calls).toHaveLength(count);
  });
  it('refuses ambiguous refunds outside the PSP idempotency retention window',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    const refund=await operation('payment.refund',create.operation.resource_id,{provider_reference:first.provider_reference!,attempt:2,created_at:new Date(Date.now()-25*3600000).toISOString(),safe_evidence:{amount:'2.00'}});const count=calls.length;
    await expect(execute(refund)).rejects.toMatchObject({code:'PAYMENT_REFUND_RECONCILIATION_REQUIRED',ambiguous:true});expect(calls).toHaveLength(count);
  });
  it.each(['refund','chargeback'])('records the original completed deposit when the first paid observation is a %s',async kind=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!,kind==='refund'?1234:0);
    const session=sessions.get(first.provider_reference!)!;
    if(kind==='chargeback'){
      ((session.payment_intent as Json).latest_charge as Json).disputed=true;
      session.dispute_evidence=[{id:'du_first',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:1234,currency:'usd',livemode:false,status:'under_review'}];
    }
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    const rows=(await db.transaction(scope,tx=>tx.query<{kind:string;status:string;amount:string}>("SELECT kind,status,amount::text FROM brokerage_transactions WHERE request_id=$1",[create.operation.resource_id]))).rows;
    expect(rows.filter(row=>row.kind==='deposit'&&row.status==='completed')).toEqual([{kind:'deposit',status:'completed',amount:'12.34000000'}]);
    expect(rows).toContainEqual({kind:kind==='refund'?'refund':'adjustment',status:kind==='refund'?'refunded':'chargeback',amount:'12.34000000'});
    expect(await payment(create.operation.resource_id)).toMatchObject({status:'reversed',funding_status:'review_required'});
    delete session.dispute_evidence;
  });
  it('records a partial dispute reinstatement while a second dispute remains active',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);
    const session=sessions.get(first.provider_reference!)!;((session.payment_intent as Json).latest_charge as Json).disputed=true;
    session.dispute_evidence=[{id:'du_one',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:200,currency:'usd',livemode:false,status:'under_review'},{id:'du_two',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:300,currency:'usd',livemode:false,status:'under_review'}];
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    (session.dispute_evidence as Json[])[0].status='won';
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    const rows=(await db.transaction(scope,tx=>tx.query<{status:string;amount:string}>("SELECT status,amount::text FROM brokerage_transactions WHERE request_id=$1 AND kind='adjustment' ORDER BY created_at,id",[create.operation.resource_id]))).rows;
    expect(rows).toEqual([{status:'chargeback',amount:'5.00000000'},{status:'chargeback_reinstated',amount:'2.00000000'}]);
    expect(await payment(create.operation.resource_id)).toMatchObject({status:'reversed',funding_status:'review_required'});
    delete session.dispute_evidence;
  });
  it('recovers a historical pending refund failure without its webhook or the recent-charge refund list',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    const refund=await operation('payment.refund',create.operation.resource_id,{provider_reference:first.provider_reference!,safe_evidence:{amount:'2.00',refund_operation:{reference:'re_historical',status:'pending',amount:'2.00000000'}}});
    refundRecords.set('re_historical',{id:'re_historical',object:'refund',payment_intent:'pi_fixture',charge:'ch_fixture',amount:200,currency:'usd',status:'failed'});
    const result=await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    expect(result.evidence).toMatchObject({refund_operations:[{reference:'re_historical',status:'failed',amount:'2.00000000'}]});
    const journal=(await db.transaction(scope,tx=>tx.query<{safe_evidence:Json}>('SELECT safe_evidence FROM connector_operations WHERE id=$1',[refund.operation.id]))).rows[0].safe_evidence;
    expect(journal).toMatchObject({refund_operation:{status:'pending'},refund_reconciliation:{reference:'re_historical',status:'failed'}});
    const observed=(await db.transaction(scope,tx=>tx.query("SELECT id FROM brokerage_transactions WHERE request_id=$1 AND kind='refund'",[create.operation.resource_id]))).rows;
    expect(observed).toHaveLength(0);expect(await payment(create.operation.resource_id)).toMatchObject({status:'completed',funding_status:'funding_pending'});
  });
  it('resolves verified payment discrepancies while preserving funding obligations and unproved refund ambiguity',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);
    const ids=new Map<string,string>();
    await db.transaction(scope,async tx=>{
      for(const kind of ['payment_mismatch','missing_callback','ambiguous_operation','funding_pending']){
        const id=randomUUID();ids.set(kind,id);await tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,$9,'requires_action','unknown','manual_review','provider_read_required',$10,$11)",[id,...[scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId],connection.id,create.operation.id,create.operation.resource_id,kind,first.provider_reference,actor]);
      }
    });
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    const rows=(await db.transaction(scope,tx=>tx.query<{kind:string;status:string;resolved_at:string|null}>('SELECT kind,status,resolved_at::text FROM connector_reconciliations WHERE resource_id=$1',[create.operation.resource_id]))).rows;
    for(const kind of ['payment_mismatch','missing_callback','ambiguous_operation'])expect(rows.find(row=>row.kind===kind)).toMatchObject({status:'resolved',resolved_at:expect.any(String)});
    expect(rows.find(row=>row.kind==='funding_pending')).toMatchObject({status:'open',resolved_at:null});
    const other=await operation();const otherSession=await apply(other);paid(otherSession.provider_reference!);
    const refund=await operation('payment.refund',other.operation.resource_id,{safe_evidence:{amount:'2.00'}}), ambiguousId=randomUUID();
    await db.transaction(scope,tx=>tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,'ambiguous_operation','running','unknown','manual_review','refund_receipt_required',$9,$10)",[ambiguousId,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId,connection.id,refund.operation.id,other.operation.resource_id,otherSession.provider_reference,actor]));
    await apply(await operation('payment.sync',other.operation.resource_id,{provider_reference:otherSession.provider_reference!}));
    expect((await db.transaction(scope,tx=>tx.query('SELECT status FROM connector_reconciliations WHERE id=$1',[ambiguousId]))).rows[0]).toEqual({status:'open'});
    expect((await db.transaction(scope,tx=>tx.query("SELECT id FROM audit_events WHERE action='brokerage.payment.reconciliation_resolved' AND resource_id=$1",[create.operation.resource_id]))).rows).toHaveLength(1);
  });
  it('keeps local intent review open even when the current provider payment matches',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);const discrepancy=randomUUID();
    await db.transaction(scope,tx=>tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,'payment_mismatch','cancelled','completed','local_intent_preserved','financial_observation_review',$9,$10)",[discrepancy,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId,connection.id,create.operation.id,create.operation.resource_id,first.provider_reference,actor]));
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    expect((await db.transaction(scope,tx=>tx.query('SELECT status,resolved_at FROM connector_reconciliations WHERE id=$1',[discrepancy]))).rows[0]).toEqual({status:'open',resolved_at:null});
  });
  it('resolves an exact current-state mismatch even when its financial observation is already deduplicated',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));const discrepancy=randomUUID();
    await db.transaction(scope,tx=>tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,'missing_callback','completed','unknown','manual_review','provider_read_required',$9,$10)",[discrepancy,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId,connection.id,create.operation.id,create.operation.resource_id,first.provider_reference,actor]));
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    expect((await db.transaction(scope,tx=>tx.query('SELECT status FROM connector_reconciliations WHERE id=$1',[discrepancy]))).rows[0]).toEqual({status:'resolved'});
    expect((await db.transaction(scope,tx=>tx.query("SELECT id FROM connector_payment_observations WHERE payment_request_id=$1 AND canonical_status='completed'",[create.operation.resource_id]))).rows).toHaveLength(1);
  });
  it('keeps a payment discrepancy open when a deduplicated provider snapshot is actually stale',async()=>{
    const create=await operation();const first=await apply(create);paid(first.provider_reference!);await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));const discrepancy=randomUUID();
    await db.transaction(scope,tx=>tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,'payment_mismatch','completed','requires_action','manual_review','provider_read_required',$9,$10)",[discrepancy,scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId,connection.id,create.operation.id,create.operation.resource_id,first.provider_reference,actor]));
    const session=sessions.get(first.provider_reference!)!;session.status='open';session.payment_status='unpaid';session.payment_intent=null;
    await apply(await operation('payment.sync',create.operation.resource_id,{provider_reference:first.provider_reference!}));
    expect((await db.transaction(scope,tx=>tx.query('SELECT status FROM connector_reconciliations WHERE id=$1',[discrepancy]))).rows[0]).toEqual({status:'open'});
    expect(await payment(create.operation.resource_id)).toMatchObject({status:'completed'});
  });
});
