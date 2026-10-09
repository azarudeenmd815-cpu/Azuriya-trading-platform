import { describe, expect, it, vi } from 'vitest';
import { TradeLockerAdapter } from '../src/server/connectors/tradelocker.js';
import type { ProviderConnectionContext } from '../src/server/domain/integrations.js';
import { tradingOperation } from '../src/server/domain/trading-provider.js';
import { ConnectorRuntime } from '../src/server/connectors/runtime.js';

const operationId = 'dd063d18-d16a-4b44-b0ec-75be29b74ec6';
const userId = 'b7336a6d-e9bd-4454-a910-e95bf26b4ba7';
const accountId = 'L#123456';
const account = { accountId, accountName:'Acceptance account', userId, userGroupId:'100', type:'LIVE', status:'ACTIVE', tradingDisabledReason:null, currency:'USD', balance:'12345678901234567890.12345678', equity:'12345678901234567890.12345679', marginUsed:'1.00000001', marginAvailable:'3.00000003', externalId:operationId };
const input = { display_name:'Acceptance account', group_id:'100', currency:'USD', leverage:100, reason:'Authorized sandbox acceptance', idempotency_key:operationId, provider_user_id:userId, account_type:'demo' as const, external_reference:operationId };
interface RequestInput {url:string;body?:string|Uint8Array;headers?:Record<string,string>}

function setup(responses: Array<unknown> = []) {
  const request = vi.fn(async (_requestInput:RequestInput) => { void _requestInput; const next = responses.shift(); if(next instanceof Error) throw next; return { status:200, body:JSON.stringify(next??{}), headers:new Headers(), latencyMs:12 }; });
  const vault = { store:vi.fn(), read:vi.fn(async () => ({ brand_api_key:'test-protocol-key', environment:'sandbox' })) };
  const context:ProviderConnectionContext = { scope:{organizationId:'org-a',providerId:'provider-a',productInstanceId:'instance-a'}, credentialReference:'credential-a', vault, requestId:'request-a' };
  const adapter = new TradeLockerAdapter({ runtime:{request}, environment:'sandbox', connectionKey:'connection-a' });
  return { adapter, context, request, vault };
}

describe('TradeLocker Brand API documented protocol', () => {
  it('validates credentials with a nonmutating groups listing on the development API', async () => {
    const {adapter,context,request}=setup([{data:[{id:'100',name:'Acceptance group'}]}]);
    await expect(adapter.validateConnection(context)).resolves.toMatchObject({status:'connected'});
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ provider:'tradelocker', environment:'sandbox', method:'POST',url:'https://api-dev.tradelocker.com/brand-api/v1/groups/all', headers:expect.objectContaining({'brand-api-key':'test-protocol-key'}), body:'{"type":"LIVE"}',idempotent:true }));
  });
  it('never claims reset, arbitrary leverage, funding, symbols or realtime capabilities', () => {
    const {adapter}=setup();
    for(const capability of ['account.reset','account.leverage.set','balance.adjust','balance.set','symbols.read','account.events.subscribe','position.close']) expect(adapter.descriptor.capabilities).not.toContain(capability);
    expect(()=>tradingOperation(adapter,'resetAccount')).toThrow();
    expect(adapter.descriptor.capabilities).toEqual(expect.arrayContaining(['account.create','account.read','account.enable','account.disable','account.group.set','balance.read','equity.read','margin.read','orders.read','positions.read','trades.read']));
  });
  it('rejects credentials for another provider environment before network access', async () => {
    const {adapter,context,request,vault}=setup();vault.read.mockResolvedValue({brand_api_key:'test-protocol-key',environment:'production'});
    await expect(adapter.getAccount(context,accountId)).rejects.toMatchObject({code:'PROVIDER_ENVIRONMENT_MISMATCH'});
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects missing provider credentials without exposing their values', async () => {
    const {adapter,context,request,vault}=setup();vault.read.mockResolvedValue({brand_api_key:'',environment:'sandbox'});
    await expect(adapter.getAccount(context,accountId)).rejects.toMatchObject({code:'PROVIDER_CREDENTIAL_INVALID'});expect(request).not.toHaveBeenCalled();
  });
  it('reports a safe authentication failure from the shared connector runtime', async () => {
    const {adapter,context}=setup([Object.assign(new Error('PROVIDER_AUTHENTICATION_FAILED'),{code:'PROVIDER_AUTHENTICATION_FAILED',status:401})]);
    await expect(adapter.validateConnection(context)).resolves.toMatchObject({status:'failed',errorCode:'PROVIDER_AUTHENTICATION_FAILED'});
  });
  it('uses fixed production endpoints for demo accounts and rejects live account references', async () => {
    const {context,request,vault}=setup([{...account,accountId:'D#123456',type:'DEMO'}]);vault.read.mockResolvedValue({brand_api_key:'test-protocol-key',environment:'demo'});
    const adapter=new TradeLockerAdapter({runtime:{request},environment:'demo',connectionKey:'connection-a'});
    await expect(adapter.getAccount(context,'D#123456')).resolves.toMatchObject({provider_account_id:'D#123456'});
    expect(request.mock.calls[0]![0].url).toBe('https://api.tradelocker.com/brand-api/v1/accounts/details');
    await expect(adapter.getAccount(context,'L#123456')).rejects.toMatchObject({code:'PROVIDER_ACCOUNT_MISMATCH'});expect(request).toHaveBeenCalledTimes(1);
  });
  it('respects the scope-bound vault and never retries a wrong-tenant envelope', async () => {
    const {adapter,context,request,vault}=setup();vault.read.mockRejectedValue(Object.assign(new Error('Bound credential not found'),{code:'CREDENTIAL_NOT_FOUND'}));
    await expect(adapter.getAccount({...context,scope:{...context.scope,organizationId:'org-b'}},accountId)).rejects.toMatchObject({code:'CREDENTIAL_NOT_FOUND'});expect(request).not.toHaveBeenCalled();
  });
  it('uses stable UUID idempotency and external reference for real account provisioning', async () => {
    const {adapter,context,request}=setup([{data:[]},account]);
    await expect(adapter.createAccount(context,input)).resolves.toMatchObject({provider_account_id:accountId,display_name:'Acceptance account',currency:'USD',group_id:'100',status:'enabled'});
    const creation=request.mock.calls[1]![0];
    expect(creation).toMatchObject({method:'POST',url:'https://api-dev.tradelocker.com/brand-api/v1/accounts/create',headers:expect.objectContaining({'Idempotency-Key':operationId}),idempotent:false});
    expect(JSON.parse(creation.body as string)).toEqual({userId,accountName:'Acceptance account',type:'LIVE',currency:'USD',groupId:'100',externalId:operationId});
    expect(JSON.parse(creation.body as string)).not.toHaveProperty('leverage');
  });
  it('finds a previously created account after a lost response without creating again', async () => {
    const {adapter,context,request}=setup([{data:[account]}]);
    await expect(adapter.createAccount(context,input)).resolves.toMatchObject({provider_account_id:accountId});expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects an external-reference collision or wrong account ownership', async () => {
    const {adapter,context,request}=setup([{data:[{...account,userId:'another-user'}]}]);
    await expect(adapter.createAccount(context,input)).rejects.toMatchObject({code:'PROVIDER_ACCOUNT_MISMATCH'});expect(request).toHaveBeenCalledTimes(1);
  });
  it('requires a UUID provider idempotency key before creating accounts', async () => {
    const {adapter,context,request}=setup();
    await expect(adapter.createAccount(context,{...input,idempotency_key:'not-a-uuid'})).rejects.toMatchObject({code:'PROVIDER_COMMAND_INVALID'});expect(request).not.toHaveBeenCalled();
  });
  it('passes ambiguous timeout recovery to durable orchestration without a second create', async () => {
    const timeout=Object.assign(new Error('Safe timeout'),{code:'CONNECTOR_TIMEOUT',retryable:true,ambiguous:true});
    const {adapter,context,request}=setup([{data:[]},timeout]);
    await expect(adapter.createAccount(context,input)).rejects.toMatchObject({code:'CONNECTOR_TIMEOUT',ambiguous:true});expect(request).toHaveBeenCalledTimes(2);
  });
  it('commits the durable create stage before the provider mutation and supports read-only identity lookup',async()=>{
    const {adapter,context,request}=setup([{data:[]},account,{userId}]);let stageRecorded=false;
    await adapter.createAccount(context,input,async()=>{expect(request).toHaveBeenCalledTimes(1);stageRecorded=true;});expect(stageRecorded).toBe(true);
    await expect(adapter.findUserByEmail(context,'client@example.com')).resolves.toBe(userId);
  });
  it('rejects duplicate matching external accounts instead of arbitrarily attaching one', async () => {
    const {adapter,context,request}=setup([{data:[account,{...account,accountId:'L#456789'}]}]);
    await expect(adapter.createAccount(context,input)).rejects.toMatchObject({code:'PROVIDER_RECONCILIATION_AMBIGUOUS'});expect(request).toHaveBeenCalledTimes(1);
  });
  it('reuses an existing provider user by normalized email without resetting their password', async () => {
    const {adapter,context,request}=setup([{userId}]);
    await expect(adapter.ensureUser(context,{email:'CLIENT@example.com',password:'Temp-Protocol-2026!',idempotency_key:operationId})).resolves.toEqual({provider_user_id:userId,created:false});
    expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0]![0].body).toBe('{"email":"client@example.com"}');
  });
  it('creates a provider user with documented idempotency when lookup reports absence', async () => {
    const request=vi.fn(async (requestInput:RequestInput) => requestInput.url.endsWith('check-by-email')?{status:404,body:'{}',headers:new Headers(),latencyMs:1}:{status:201,body:JSON.stringify({userId}),headers:new Headers(),latencyMs:2});
    const {context}=setup();const adapter=new TradeLockerAdapter({runtime:{request},environment:'sandbox',connectionKey:'connection-a'});
    await expect(adapter.ensureUser(context,{email:'client@example.com',password:'Temp-Protocol-2026!',idempotency_key:operationId})).resolves.toEqual({provider_user_id:userId,created:true});
    expect(request.mock.calls[1]![0]).toMatchObject({url:'https://api-dev.tradelocker.com/brand-api/v1/users/create',headers:expect.objectContaining({'Idempotency-Key':operationId}),idempotent:false});
  });
  it('records the durable user-create stage only after a verified not-found identity lookup',async()=>{
    const request=vi.fn(async(requestInput:RequestInput)=>requestInput.url.endsWith('check-by-email')?{status:404,body:'{}',headers:new Headers(),latencyMs:1}:{status:201,body:JSON.stringify({userId}),headers:new Headers(),latencyMs:2});
    const {context}=setup();const adapter=new TradeLockerAdapter({runtime:{request},environment:'sandbox',connectionKey:'connection-a'});let staged=false;
    await adapter.ensureUser(context,{email:'client@example.com',password:'Temp-Protocol-2026!',idempotency_key:operationId},async()=>{expect(request).toHaveBeenCalledTimes(1);staged=true;});expect(staged).toBe(true);
  });
  it('hands ambiguous account creation to reconciliation before any transport retry',async()=>{
    const {context}=setup();let creations=0;const runtime=new ConnectorRuntime({maxAttempts:3,delay:async()=>{},fetcher:async url=>{if(String(url).endsWith('/accounts/all'))return new Response('{"data":[]}',{status:200});creations++;throw new Error('Injected lost response');}});
    const adapter=new TradeLockerAdapter({runtime,environment:'sandbox',connectionKey:'connection-a'});
    await expect(adapter.createAccount(context,input)).rejects.toMatchObject({ambiguous:true});expect(creations).toBe(1);
  });
  it('preserves exact provider decimal strings while reading balance, equity and margin', async () => {
    const {adapter,context}=setup([account]);
    await expect(adapter.getBalance(context,accountId)).resolves.toMatchObject({balance:account.balance,equity:account.equity,margin:'1.00000001',free_margin:'3.00000003',currency:'USD'});
  });
  it('does not invent leverage omitted by the provider', async () => {
    const {adapter,context}=setup([account]);expect(await adapter.getAccount(context,accountId)).not.toHaveProperty('leverage');
  });
  it('rejects a details response for another account or environment', async () => {
    const {adapter,context}=setup([{...account,accountId:'D#123456',type:'DEMO'}]);
    await expect(adapter.getAccount(context,accountId)).rejects.toMatchObject({code:'PROVIDER_ACCOUNT_MISMATCH'});
  });
  it('rejects numeric money to avoid rounding undocumented provider responses', async () => {
    const {adapter,context}=setup([{...account,balance:1.01}]);
    await expect(adapter.getBalance(context,accountId)).rejects.toMatchObject({code:'PROVIDER_RESPONSE_INVALID'});
  });
  it('rejects duplicate provider JSON keys instead of silently accepting the last financial value',async()=>{
    const {context}=setup();const request=vi.fn(async()=>({status:200,body:JSON.stringify(account).replace('"balance":','"balance":"999.00","balance":'),headers:new Headers(),latencyMs:1}));
    const adapter=new TradeLockerAdapter({runtime:{request},environment:'sandbox',connectionKey:'connection-a'});await expect(adapter.getBalance(context,accountId)).rejects.toMatchObject({code:'PROVIDER_RESPONSE_INVALID'});
  });
  it('rejects malformed provider owners and missing trading-disabled evidence',async()=>{
    const {adapter,context}=setup([{...account,userId:'another-user'},{...account,tradingDisabledReason:undefined}]);
    await expect(adapter.getAccount(context,accountId)).rejects.toMatchObject({code:'PROVIDER_RESPONSE_INVALID'});await expect(adapter.getAccount(context,accountId)).rejects.toMatchObject({code:'PROVIDER_RESPONSE_INVALID'});
  });
  it('checks provider ownership again when reading a balance snapshot',async()=>{
    const {adapter,context}=setup([{...account,userId:'cfb146eb-0ae6-47e9-a8a3-97f6d3181aed'}]);
    await expect(adapter.getBalance(context,accountId,userId)).rejects.toMatchObject({code:'PROVIDER_ACCOUNT_MISMATCH'});
  });
  it('normalizes suspended and restricted provider accounts without claiming enabled trading', async () => {
    const {adapter,context}=setup([{...account,status:'SUSPENDED'},{...account,status:'RESTRICTED'},{...account,tradingDisabledReason:{type:'RISK_RULE'}}]);
    expect((await adapter.getAccount(context,accountId)).status).toBe('disabled');expect((await adapter.getAccount(context,accountId)).status).toBe('disabled');expect((await adapter.getAccount(context,accountId)).status).toBe('disabled');
  });
  it('uses documented activate, suspend and group contracts', async () => {
    const {adapter,context,request}=setup([{accountId,status:'ACTIVE'},{accountId,status:'SUSPENDED'},{},account]);
    await adapter.enableAccount(context,accountId,{idempotency_key:operationId,reason:'Authorized review'});await adapter.disableAccount(context,accountId,{idempotency_key:operationId,reason:'Authorized review'});await adapter.setGroup(context,accountId,'100',{idempotency_key:operationId,reason:'Authorized review'});
    expect(request.mock.calls.map(call=>call[0].url)).toEqual(['https://api-dev.tradelocker.com/brand-api/v1/accounts/activate','https://api-dev.tradelocker.com/brand-api/v1/accounts/suspend','https://api-dev.tradelocker.com/brand-api/v1/accounts/set-group','https://api-dev.tradelocker.com/brand-api/v1/accounts/details']);
    expect(JSON.parse(request.mock.calls[2]![0].body as string)).toEqual({accountId,newGroupId:'100'});
  });
  it('normalizes orders while refusing records for another provider account', async () => {
    const order={accountId,orderId:'order-1',instrument:'EURUSD',side:'BUY',type:'LIMIT',amount:'0.12345678',price:'1.01234567',status:'STATUS_PENDING_NEW',createdDateTime:'2026-10-01T00:00:00Z'};
    const {adapter,context}=setup([{data:[order]},{data:[{...order,accountId:'L#999'}]}]);
    await expect(adapter.getOrders(context,accountId)).resolves.toEqual([expect.objectContaining({provider_order_id:'order-1',side:'buy',type:'limit',volume:'0.12345678',status:'pending'})]);
    await expect(adapter.getOrders(context,accountId)).rejects.toMatchObject({code:'PROVIDER_ACCOUNT_MISMATCH'});
  });
  it('normalizes account-scoped positions and exact trades', async () => {
    const {adapter,context,request}=setup([{data:[{accountId,positionId:'position-1',instrument:'EURUSD',side:'SELL',lots:'0.01',openPrice:'1.12345678',currentPrice:'1.12345679',pnl:'0.00000001',openDateTime:'2026-10-01T00:00:00Z'}]},{data:[{accountId,tradeId:'trade-1',orderId:'order-1',positionId:'position-1',instrument:'EURUSD',side:'SELL',lots:'0.01',price:'1.12345678',pnl:'0.00000001',executionFee:'0.00000002',swap:'0',tradeDateTime:'2026-10-01T00:00:00Z'}]}]);
    await expect(adapter.getPositions(context,accountId)).resolves.toEqual([expect.objectContaining({provider_position_id:'position-1',side:'sell',volume:'0.01',profit:'0.00000001'})]);
    await expect(adapter.getTrades(context,accountId,{from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z'})).resolves.toEqual([expect.objectContaining({provider_trade_id:'trade-1',commission:'0.00000002'})]);
    expect(JSON.parse(request.mock.calls[0]![0].body as string)).toEqual({type:'LIVE',accountIds:[accountId]});
  });
  it('bounds normalized positions while checking every provider owner before slicing',async()=>{
    const position={accountId,positionId:'position-1',instrument:'EURUSD',side:'SELL',lots:'0.01',openPrice:'1.12345678',openDateTime:'2026-10-01T00:00:00Z'};
    const {adapter,context}=setup([{data:Array.from({length:101},(_,index)=>({...position,positionId:`position-${index}`}))},{data:[position,{...position,accountId:'L#999'}]}]);
    expect(await adapter.getPositions(context,accountId,100)).toHaveLength(100);
    await expect(adapter.getPositions(context,accountId,1)).rejects.toMatchObject({code:'PROVIDER_ACCOUNT_MISMATCH'});
  });
  it('bounds orders even if the provider ignores the requested limit and rejects owners past that limit',async()=>{
    const order={accountId,orderId:'order-1',instrument:'EURUSD',side:'BUY',type:'LIMIT',amount:'0.12345678',price:'1.01234567',status:'STATUS_PENDING_NEW',createdDateTime:'2026-10-01T00:00:00Z'};
    const {adapter,context}=setup([{data:Array.from({length:101},(_,index)=>({...order,orderId:`order-${index}`}))},{data:[order,{...order,accountId:'L#999'}]}]);
    expect(await adapter.getOrders(context,accountId,{limit:100})).toHaveLength(100);await expect(adapter.getOrders(context,accountId,{limit:1})).rejects.toMatchObject({code:'PROVIDER_ACCOUNT_MISMATCH'});
  });
  it('rejects invalid or excessive history windows before sending requests', async () => {
    const {adapter,context,request}=setup();
    await expect(adapter.getTrades(context,accountId,{to:'invalid-date'})).rejects.toMatchObject({code:'PROVIDER_QUERY_INVALID'});
    await expect(adapter.getTrades(context,accountId,{from:'2026-01-01T00:00:00Z',to:'2026-10-01T00:00:00Z'})).rejects.toMatchObject({code:'PROVIDER_QUERY_INVALID'});expect(request).not.toHaveBeenCalled();
  });
});
