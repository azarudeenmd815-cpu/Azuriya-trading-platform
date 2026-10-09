import { randomBytes,randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import type { Actor,Row,TenantContext } from '../src/shared/types.js';
import { createDatabase,type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { scopeValues } from '../src/server/brokerage/common.js';
import { connectorVault,loadConnector,connectionCapabilities } from '../src/server/connectors/connection-service.js';
import { ConnectorRuntime } from '../src/server/connectors/runtime.js';
import type { ConnectorConnection,ExternalOperation,OperationExecution,OperationResult } from '../src/server/connectors/types.js';

type Json=Record<string,unknown>;
async function execute(execution:OperationExecution):Promise<OperationResult> {
  const module=await import('../src/server/connectors/trading-operations.js').catch(()=>undefined);
  expect(module?.executeTradingOperation,'Durable trading operations must exist.').toBeTypeOf('function');return module!.executeTradingOperation(execution);
}

describe('Durable TradeLocker account orchestration',()=>{
  let db:Database;let scope:TenantContext;let connection:ConnectorConnection;let clientId:string;let offeringId:string;let providerId:string;let transactionDepth=0;
  const userId=randomUUID();const actorId=randomUUID();const secretKey=randomBytes(32).toString('base64');const credential={brand_api_key:'protocol-test-brand-key',environment:'sandbox'};
  const identities=new Map<string,string>();const accounts=new Map<string,Json>();const calls:Array<{path:string;body:Json;key:string|null}>=[];let externalSequence=1000;let loseCreateResponse=false;let loseUserResponse=false;let rateLimitCreate=false;let tradingRows:{orders:Json[];positions:Json[];trades:Json[]}|undefined;let denyTradingData=false;
  const runtime=new ConnectorRuntime({maxAttempts:1,fetcher:async(url,options)=>{
    expect(transactionDepth,'External provider I/O must not hold a database transaction.').toBe(0);
    const path=new URL(String(url)).pathname;const body=JSON.parse(String(options?.body)) as Json;const key=new Headers(options?.headers).get('Idempotency-Key');calls.push({path,body,key});let value:unknown;
    if(path==='/brand-api/v1/users/check-by-email'){const found=identities.get(String(body.email));if(!found)return new Response('{}',{status:404});value={userId:found};}
    else if(path==='/brand-api/v1/users/create'){const newUser=randomUUID();identities.set(String(body.email),newUser);value={userId:newUser};if(loseUserResponse){loseUserResponse=false;throw new Error('Injected user response loss');}}
    else if(path==='/brand-api/v1/accounts/all')value={data:[...accounts.values()].filter(row=>row.userId===body.userId)};
    else if(path==='/brand-api/v1/accounts/create'){
      if(rateLimitCreate){rateLimitCreate=false;return new Response('{}',{status:429,headers:{'Retry-After':'2'}});}
      const accountId=`L#${++externalSequence}`;value={accountId,accountName:body.accountName,userId:body.userId,userGroupId:body.groupId??'100',type:body.type,status:'ACTIVE',tradingDisabledReason:null,currency:body.currency,balance:'12.12345678',equity:'13.12345679',marginUsed:'0.00000001',marginAvailable:'13.12345678',externalId:body.externalId};accounts.set(accountId,value as Json);if(loseCreateResponse){loseCreateResponse=false;throw new Error('Injected response loss');}
    }else if(path==='/brand-api/v1/accounts/details'){value=accounts.get(String(body.accountId));if(!value)return new Response('{}',{status:404});}
    else if(path==='/brand-api/v1/accounts/activate'||path==='/brand-api/v1/accounts/suspend'){const account=accounts.get(String(body.accountId));if(!account)return new Response('{}',{status:404});account.status=path.endsWith('/activate')?'ACTIVE':'SUSPENDED';value={accountId:body.accountId,status:account.status};}
    else if(path==='/brand-api/v1/orders/all'||path==='/brand-api/v2/positions/get-open-positions'||path==='/brand-api/v2/reports/trades-history-report'){if(denyTradingData)return new Response('{}',{status:403});value={data:tradingRows?.[path.includes('/orders/')?'orders':path.includes('/positions/')?'positions':'trades']??[]};}
    else throw new Error('Unexpected provider protocol route');
    return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  }});
  beforeAll(async()=>{
    const raw=await createDatabase();await migrate(raw);db={...raw,transaction:async(context,work)=>{transactionDepth++;try{return await raw.transaction(context,work);}finally{transactionDepth--;}}};await seedCatalog(db);
    const core:Actor={userId:actorId,requestId:randomUUID(),core:true};await db.transaction({core:true},async tx=>{for(const [id,email] of [[actorId,'trading-operator@tests.local'],[userId,'trading-client@tests.local']])await tx.query('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,\'unused\',\'Trading acceptance\',$3)',[id,email,id===actorId?'super_admin':null]);});
    const foundation=new FoundationService(db);const organization=await foundation.createOrganization(core,{name:'Trading Protocol Test',slug:'trading-protocol-test',business_type:'brokerage',brand_name:'Trading Protocol Test',environment_name:'sandbox',environment_kind:'sandbox',products:['brokerage-crm'],plan:'foundation'});const instances=await foundation.coreList('product-instances',{limit:100},core);const instance=instances.data.find((row:Row)=>row.organization_id===organization.id)!;scope={userId:actorId,requestId:randomUUID(),core:false,organizationId:String(organization.id),brandId:String(instance.brand_id),environmentId:String(instance.environment_id),productInstanceId:String(instance.id),productSlug:'brokerage-crm',permissions:[]};
    providerId=(await db.transaction({core:true},tx=>tx.query<{id:string}>('SELECT id FROM integration_providers WHERE slug=\'tradelocker\''))).rows[0].id;
    const vault=connectorVault(db,scope,secretKey);const reference=await vault.store({organizationId:scope.organizationId,providerId,productInstanceId:scope.productInstanceId},credential);clientId=randomUUID();offeringId=randomUUID();const connectionId=randomUUID();
    await db.transaction(scope,async tx=>{
      await tx.query('INSERT INTO brokerage_connections(id,organization_id,brand_id,environment_id,product_instance_id,provider_id,label,status,provider_environment,credential_reference,capabilities,created_by) VALUES($1,$2,$3,$4,$5,$6,\'Protocol TradeLocker\',\'connected\',\'sandbox\',$7,$8::jsonb,$9)',[connectionId,...scopeValues(scope),providerId,reference,JSON.stringify(connectionCapabilities.tradelocker),actorId]);
      await tx.query('INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,birth_date,kyc_status) VALUES($1,$2,$3,$4,$5,$6,\'CLI-TRADE\',\'Trading Client\',\'trading-client@tests.local\',\'active\',\'GB\',\'1990-01-01\',\'approved\')',[clientId,...scopeValues(scope),userId]);
      await tx.query('INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,connection_id,account_type,currencies,leverage_options,provider_mapping,created_by) VALUES($1,$2,$3,$4,$5,\'TradeLocker test\',$6,$7,\'demo\',\'["USD"]\',\'[100]\',\'{"group":"100"}\',$8)',[offeringId,...scopeValues(scope),providerId,connectionId,actorId]);
    });connection=await loadConnector(db,scope,connectionId);
  });
  afterAll(async()=>db?.close());
  async function operation(type='account.create',resourceId?:string,overrides:Partial<ExternalOperation>={}):Promise<OperationExecution> {
    const accountId=resourceId??randomUUID();const operationId=randomUUID();const leaseToken=randomUUID();
    await db.transaction(scope,async tx=>{
      if(!resourceId)await tx.query('INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,connection_id,provider_id,account_number,account_type,currency,leverage,status,provisioning_mode,provider_group,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,\'demo\',\'USD\',100,\'queued\',\'provider\',\'100\',$11)',[accountId,...scopeValues(scope),clientId,offeringId,connection.id,providerId,`ACC-${accountId.slice(0,8)}`,actorId]);
      await tx.query('INSERT INTO connector_operations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_type,resource_type,resource_id,account_id,provider_idempotency_key,credential_revision,state,attempt,lease_token,lease_until,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,\'account\',$8,$8,$9,0,\'running\',1,$10,now()+interval \'3 minutes\',$11)',[operationId,...scopeValues(scope),connection.id,type,accountId,randomUUID(),leaseToken,actorId]);
    });const loaded=(await db.transaction(scope,tx=>tx.query<ExternalOperation>('SELECT * FROM connector_operations WHERE id=$1',[operationId]))).rows[0];const actual={...loaded,...overrides};
    if(overrides.attempt||overrides.created_at||overrides.started_at)await db.transaction(scope,tx=>tx.query('UPDATE connector_operations SET attempt=$2,created_at=$3,started_at=$4 WHERE id=$1',[operationId,actual.attempt,actual.created_at,actual.started_at]));
    return {db,scope,connection,operation:actual,runtime,origin:'https://acceptance.invalid',credentials:credential,providerContext:{scope:{organizationId:scope.organizationId,providerId,productInstanceId:scope.productInstanceId},credentialReference:connection.credential_reference!,vault:connectorVault(db,scope,secretKey),requestId:randomUUID()}};
  }
  async function apply(execution:OperationExecution,result?:OperationResult){const receipt=result??await execute(execution);await db.transaction(scope,async tx=>{await receipt.apply(tx);await tx.query('UPDATE connector_operations SET state=\'succeeded\',lease_token=NULL,lease_until=NULL WHERE id=$1',[execution.operation.id]);});return receipt;}
  async function account(id:string){return (await db.transaction(scope,tx=>tx.query<Json>('SELECT * FROM brokerage_accounts WHERE id=$1',[id]))).rows[0];}
  it('durably links the encrypted trader credential before provider I/O and applies exact account state',async()=>{
    const execution=await operation();const receipt=await apply(execution);const row=await account(execution.operation.resource_id);
    expect(row).toMatchObject({status:'active',external_account_id:receipt.provider_reference,provisioning_mode:'provider',sync_status:'synchronized'});expect(JSON.stringify(row)).not.toContain('password');
    expect(row.provider_snapshot).toMatchObject({balance:'12.12345678',equity:'13.12345679',margin:'0.00000001'});
    const operationRow=(await db.transaction(scope,tx=>tx.query<Json>('SELECT * FROM connector_operations WHERE id=$1',[execution.operation.id]))).rows[0];expect(operationRow.provider_secondary_reference).toBe(receipt.secondary_reference);
    const password=await execution.providerContext.vault.read(execution.providerContext.scope,String(row.trader_credential_reference));expect(password).toMatchObject({purpose:'trader_credentials',account_id:row.id,client_id:clientId,organization_id:scope.organizationId,brand_id:scope.brandId,environment_id:scope.environmentId,product_instance_id:scope.productInstanceId});expect(password.password.length).toBeGreaterThanOrEqual(24);
    const creation=calls.find(call=>call.path.endsWith('/accounts/create')&&call.body.externalId===row.id)!;expect(creation.key).toBe(execution.operation.provider_idempotency_key);expect(creation.body).not.toHaveProperty('leverage');
  });
  it('reconciles a lost create response without a second provider account',async()=>{
    const execution=await operation();loseCreateResponse=true;await expect(execute(execution)).rejects.toMatchObject({ambiguous:true});
    const saved=(await db.transaction(scope,tx=>tx.query<ExternalOperation>('SELECT * FROM connector_operations WHERE id=$1',[execution.operation.id]))).rows[0];const receipt=await apply({...execution,operation:{...saved,attempt:2}});
    expect(calls.filter(call=>call.path.endsWith('/accounts/create')&&call.body.externalId===execution.operation.resource_id)).toHaveLength(1);expect(await account(execution.operation.resource_id)).toMatchObject({external_account_id:receipt.provider_reference,status:'active'});
  });
  it('does not disclose a generated password for an existing provider identity',async()=>{
    const execution=await operation();const receipt=await apply(execution);expect(receipt.secondary_reference).toBe(identities.get('trading-client@tests.local'));
    expect(await account(execution.operation.resource_id)).toMatchObject({trader_credential_reference:null});
    expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT secret_reference FROM connector_operations WHERE id=$1',[execution.operation.id]))).rows[0].secret_reference).toBeNull();
  });
  it('refuses ambiguous creation older than the conservative recovery window after a verified not-found lookup',async()=>{
    const execution=await operation('account.create',undefined,{attempt:2,created_at:new Date(Date.now()-25*3600000).toISOString(),started_at:new Date(Date.now()-25*3600000).toISOString(),provider_secondary_reference:identities.get('trading-client@tests.local')!});const count=accounts.size;
    await expect(execute(execution)).rejects.toMatchObject({code:'TRADING_CREATION_RECONCILIATION_REQUIRED',retryable:false,ambiguous:true});expect(accounts.size).toBe(count);
  });
  it('rejects wrong tenant and disabled connection before external I/O',async()=>{
    const execution=await operation();const count=calls.length;
    await expect(execute({...execution,scope:{...scope,brandId:randomUUID()}})).rejects.toMatchObject({code:'TRADING_SCOPE_MISMATCH'});
    await expect(execute({...execution,connection:{...connection,status:'disconnected'}})).rejects.toMatchObject({code:'TRADING_CONNECTION_UNAVAILABLE'});expect(calls).toHaveLength(count);
  });
  it('rejects a credential revision change or expired lease before provisioning',async()=>{
    const execution=await operation();const count=calls.length;
    await expect(execute({...execution,connection:{...connection,credential_revision:1}})).rejects.toMatchObject({code:'TRADING_CREDENTIAL_CHANGED'});
    await db.transaction(scope,tx=>tx.query('UPDATE connector_operations SET lease_until=now()-interval \'1 minute\' WHERE id=$1',[execution.operation.id]));
    await expect(execute(execution)).rejects.toMatchObject({code:'TRADING_OPERATION_LEASE_LOST'});expect(calls).toHaveLength(count);
  });
  it('detects a provider suspension and audits the source-of-truth decision',async()=>{
    const create=await operation();const receipt=await apply(create);accounts.get(receipt.provider_reference!)!.status='SUSPENDED';await apply(await operation('account.sync',create.operation.resource_id));
    expect(await account(create.operation.resource_id)).toMatchObject({status:'disabled',sync_status:'synchronized'});
    expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT kind,decision,local_state,provider_state FROM connector_reconciliations WHERE resource_id=$1',[create.operation.resource_id]))).rows).toContainEqual(expect.objectContaining({kind:'account_state_mismatch',decision:'provider_authoritative',local_state:'active',provider_state:'disabled'}));
  });
  it('preserves local restrictions when a provider remains active and deduplicates repeated observations',async()=>{
    const create=await operation();await apply(create);await db.transaction(scope,tx=>tx.query('UPDATE brokerage_accounts SET status=\'restricted\' WHERE id=$1',[create.operation.resource_id]));
    await apply(await operation('account.sync',create.operation.resource_id));const reference=(await account(create.operation.resource_id)).external_account_id;const receiptCount=(await db.transaction(scope,tx=>tx.query<Json>('SELECT id FROM connector_event_receipts WHERE provider_reference=$1',[reference]))).rows.length;
    await apply(await operation('account.sync',create.operation.resource_id));expect(await account(create.operation.resource_id)).toMatchObject({status:'restricted'});
    expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT id FROM connector_event_receipts WHERE provider_reference=$1',[reference]))).rows).toHaveLength(receiptCount);
    expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT decision,action FROM connector_reconciliations WHERE resource_id=$1',[create.operation.resource_id]))).rows).toContainEqual(expect.objectContaining({decision:'local_intent_preserved'}));
  });
  it('records a provider record missing discrepancy without erasing the registry',async()=>{
    const create=await operation();const receipt=await apply(create);accounts.delete(receipt.provider_reference!);const sync=await operation('account.sync',create.operation.resource_id);await apply(sync);
    expect(await account(create.operation.resource_id)).toMatchObject({status:'active',external_account_id:receipt.provider_reference,sync_status:'failed'});
    expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT kind,decision FROM connector_reconciliations WHERE resource_id=$1',[create.operation.resource_id]))).rows).toContainEqual(expect.objectContaining({kind:'provider_record_missing',decision:'manual_review'}));
  });
  it('uses legitimate provider disable and enable actions while preserving account ownership',async()=>{
    const create=await operation();const receipt=await apply(create);await apply(await operation('account.disable',create.operation.resource_id));expect(accounts.get(receipt.provider_reference!)!.status).toBe('SUSPENDED');expect(await account(create.operation.resource_id)).toMatchObject({status:'disabled'});
    await apply(await operation('account.enable',create.operation.resource_id));expect(accounts.get(receipt.provider_reference!)!.status).toBe('ACTIVE');expect(await account(create.operation.resource_id)).toMatchObject({status:'active'});
  });
  it('preserves revoked local intent when a client closes before a create receipt applies',async()=>{
    const create=await operation();const receipt=await execute(create);await db.transaction(scope,tx=>tx.query('UPDATE brokerage_accounts SET status=\'closed\' WHERE id=$1',[create.operation.resource_id]));await apply(create,receipt);
    expect(await account(create.operation.resource_id)).toMatchObject({status:'closed',external_account_id:receipt.provider_reference,trader_credential_reference:null});
    expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT operation_type,state FROM connector_operations WHERE account_id=$1 AND operation_type=\'account.disable\'',[create.operation.resource_id]))).rows).toContainEqual(expect.objectContaining({operation_type:'account.disable',state:'queued'}));
  });
  it('never blindly replays a started user creation after response loss and a not-found reconciliation',async()=>{
    const email='response-loss-client@tests.local';await db.transaction(scope,tx=>tx.query('UPDATE brokerage_clients SET email=$2 WHERE id=$1',[clientId,email]));
    try{
      const execution=await operation();loseUserResponse=true;await expect(execute(execution)).rejects.toMatchObject({ambiguous:true});identities.delete(email);
      const saved=(await db.transaction(scope,tx=>tx.query<ExternalOperation>('SELECT * FROM connector_operations WHERE id=$1',[execution.operation.id]))).rows[0];
      expect(saved.safe_evidence.user_creation_started).toBe(true);
      await expect(execute({...execution,operation:{...saved,attempt:2}})).rejects.toMatchObject({code:'TRADING_CREATION_RECONCILIATION_REQUIRED',ambiguous:true});
      expect(calls.filter(call=>call.path.endsWith('/users/create')&&call.body.email===email)).toHaveLength(1);
    }finally{await db.transaction(scope,tx=>tx.query('UPDATE brokerage_clients SET email=\'trading-client@tests.local\' WHERE id=$1',[clientId]));}
  });
  it('permits a delayed retry after a proven provider rate-limit rejection without hiding ambiguity',async()=>{
    const execution=await operation();rateLimitCreate=true;await expect(execute(execution)).rejects.toMatchObject({code:'PROVIDER_RATE_LIMITED',ambiguous:false});
    const saved=(await db.transaction(scope,tx=>tx.query<ExternalOperation>('SELECT * FROM connector_operations WHERE id=$1',[execution.operation.id]))).rows[0];expect(saved.safe_evidence.account_creation_started).toBe(false);
    await apply({...execution,operation:{...saved,attempt:2}});expect(await account(execution.operation.resource_id)).toMatchObject({status:'active'});
  });
  it('keeps an unknown-TTL legacy creation retry read-only even shortly after the first attempt',async()=>{
    const execution=await operation('account.create',undefined,{attempt:2,created_at:new Date(Date.now()-60000).toISOString(),provider_secondary_reference:identities.get('trading-client@tests.local')!});const count=accounts.size;
    await expect(execute(execution)).rejects.toMatchObject({code:'TRADING_CREATION_RECONCILIATION_REQUIRED',ambiguous:true});expect(accounts.size).toBe(count);
  });
  it('refuses a provider owner substitution before enabling an account',async()=>{
    const create=await operation();const receipt=await apply(create);accounts.get(receipt.provider_reference!)!.userId=randomUUID();const before=calls.length;
    await expect(execute(await operation('account.enable',create.operation.resource_id))).rejects.toMatchObject({code:'TRADING_PROVIDER_ACCOUNT_MISMATCH'});
    expect(calls.slice(before).filter(call=>call.path.endsWith('/accounts/activate'))).toHaveLength(0);
  });
  it('refuses provider owner substitution during a fresh synchronization operation',async()=>{
    const create=await operation();const receipt=await apply(create);accounts.get(receipt.provider_reference!)!.userId=randomUUID();
    await expect(execute(await operation('account.sync',create.operation.resource_id))).rejects.toMatchObject({code:'TRADING_PROVIDER_ACCOUNT_MISMATCH'});
  });
  it('preserves a local disable that arrives before a create receipt applies',async()=>{
    const create=await operation();const receipt=await execute(create);await db.transaction(scope,tx=>tx.query('UPDATE brokerage_accounts SET status=\'disabled\' WHERE id=$1',[create.operation.resource_id]));await apply(create,receipt);
    expect(await account(create.operation.resource_id)).toMatchObject({status:'disabled',trader_credential_reference:null});
    expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT operation_type,state FROM connector_operations WHERE account_id=$1 AND operation_type=\'account.disable\'',[create.operation.resource_id]))).rows).toContainEqual(expect.objectContaining({state:'queued'}));
  });
  it.each(['kyc','offering'])('compensates provider creation when %s eligibility is revoked during external I/O',async(revocation)=>{
    const create=await operation();const receipt=await execute(create);
    await db.transaction(scope,tx=>revocation==='kyc'?tx.query('UPDATE brokerage_clients SET kyc_status=\'expired\' WHERE id=$1',[clientId]):tx.query('UPDATE brokerage_offerings SET enabled=false WHERE id=$1',[offeringId]));
    try{
      await apply(create,receipt);expect(await account(create.operation.resource_id)).toMatchObject({status:'disabled',trader_credential_reference:null});
      expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT state FROM connector_operations WHERE account_id=$1 AND operation_type=\'account.disable\'',[create.operation.resource_id]))).rows).toContainEqual(expect.objectContaining({state:'queued'}));
    }finally{await db.transaction(scope,async tx=>{await tx.query('UPDATE brokerage_clients SET kyc_status=\'approved\' WHERE id=$1',[clientId]);await tx.query('UPDATE brokerage_offerings SET enabled=true WHERE id=$1',[offeringId]);});}
  });
  it('resolves only a verified recovered provider discrepancy and preserves still-mismatched intent',async()=>{
    const create=await operation();const receipt=await apply(create);accounts.get(receipt.provider_reference!)!.status='SUSPENDED';await apply(await operation('account.sync',create.operation.resource_id));
    const resolved=(await db.transaction(scope,tx=>tx.query<Json>('SELECT status,resolved_at FROM connector_reconciliations WHERE resource_id=$1 AND kind=\'account_state_mismatch\'',[create.operation.resource_id]))).rows[0];expect(resolved.status).toBe('resolved');expect(resolved.resolved_at).not.toBeNull();
    accounts.get(receipt.provider_reference!)!.status='ACTIVE';await db.transaction(scope,tx=>tx.query('UPDATE brokerage_accounts SET status=\'restricted\' WHERE id=$1',[create.operation.resource_id]));await apply(await operation('account.sync',create.operation.resource_id));
    expect((await db.transaction(scope,tx=>tx.query<Json>('SELECT status,decision FROM connector_reconciliations WHERE resource_id=$1 AND status=\'open\'',[create.operation.resource_id]))).rows).toContainEqual(expect.objectContaining({status:'open',decision:'local_intent_preserved'}));
  });
  it('persists bounded exact provider trading observations without raw comments or client data',async()=>{
    const create=await operation();const receipt=await apply(create);const accountId=receipt.provider_reference!;
    const order={accountId,orderId:'o',instrument:'EURUSD',side:'BUY',type:'LIMIT',amount:'0.12345678',price:'1.01234567',status:'STATUS_PENDING_NEW',createdDateTime:'2026-10-08T00:00:00Z',brokerComment:'Private provider comment'};
    const position={accountId,positionId:'p',instrument:'EURUSD',side:'SELL',lots:'0.01',openPrice:'1.12345678',pnl:'0.00000001',openDateTime:'2026-10-08T00:00:00Z'};
    const trade={accountId,tradeId:'t',orderId:'o',positionId:'p',instrument:'EURUSD',side:'SELL',lots:'0.01',price:'1.12345678',pnl:'0.00000001',executionFee:'0.00000002',swap:'0',tradeDateTime:'2026-10-08T00:00:00Z'};
    tradingRows={orders:Array.from({length:101},(_,index)=>({...order,orderId:`o-${index}`})),positions:Array.from({length:101},(_,index)=>({...position,positionId:`p-${index}`})),trades:Array.from({length:101},(_,index)=>({...trade,tradeId:`t-${index}`}))};
    try{
      await apply(await operation('account.sync',create.operation.resource_id));const row=await account(create.operation.resource_id);const data=row.trading_observations as Json;expect(data).toMatchObject({connector_version:'1.0.0',limited:true});expect(data.observed_at).toEqual(expect.any(String));
      for(const key of ['orders','positions','trades'])expect(data[key]).toHaveLength(100);expect((data.orders as Json[])[0]).toMatchObject({volume:'0.12345678',price:'1.01234567'});expect((data.trades as Json[])[0]).toMatchObject({commission:'0.00000002'});expect(JSON.stringify(data)).not.toContain('Private provider comment');expect(JSON.stringify(data)).not.toContain('trading-client@tests.local');expect(row.provider_snapshot).not.toHaveProperty('orders');
      denyTradingData=true;await expect(execute(await operation('account.sync',create.operation.resource_id))).rejects.toMatchObject({code:'PROVIDER_AUTHENTICATION_FAILED'});expect((await account(create.operation.resource_id)).trading_observations).toEqual(data);
    }finally{tradingRows=undefined;denyTradingData=false;}
  });
  it('rejects a substituted trading-data account beyond the output limit before committing observations',async()=>{
    const create=await operation();const receipt=await apply(create);const position={accountId:receipt.provider_reference,positionId:'p',instrument:'EURUSD',side:'SELL',lots:'0.01',openPrice:'1.12345678',openDateTime:'2026-10-08T00:00:00Z'};
    tradingRows={orders:[],positions:[...Array.from({length:100},()=>position),{...position,accountId:'L#999999'}],trades:[]};
    try{await expect(execute(await operation('account.sync',create.operation.resource_id))).rejects.toMatchObject({code:'PROVIDER_ACCOUNT_MISMATCH'});expect((await account(create.operation.resource_id)).trading_observations).toBeNull();}finally{tradingRows=undefined;}
  });
});
