import type { ProviderConnectionContext, ProviderDescriptor, ProviderHealth } from '../domain/integrations.js';
import { AppError } from '../domain/errors.js';
import type { AccountSnapshot, CreateAccountCommand, ProviderCommand, TradingAccount, TradingOrder, TradingPosition, TradingProviderAdapter, TradingQuery, TradingTrade } from '../domain/trading-provider.js';
import type { ConnectorRuntime } from './runtime.js';
import { parse as parseLosslessJson,isLosslessNumber,isSafeNumber } from 'lossless-json';

export type TradeLockerEnvironment = 'sandbox'|'demo'|'production';
export interface TradeLockerOptions { runtime:Pick<ConnectorRuntime,'request'>; environment:TradeLockerEnvironment; connectionKey:string }
export interface TradeLockerUserCommand { email:string;password:string;idempotency_key:string }
type JsonRecord=Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decimal=/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const accountPattern=/^[LD]#[0-9]+$/;
const capabilityList:ProviderDescriptor['capabilities']=['account.create','account.read','account.enable','account.disable','account.group.set','balance.read','equity.read','margin.read','orders.read','positions.read','trades.read','account.sync'];

function failure(code='PROVIDER_RESPONSE_INVALID'):never {throw new AppError(422,code,'The trading provider response could not be safely verified.');}
function record(value:unknown):JsonRecord {if(!value||typeof value!=='object'||Array.isArray(value))failure();return value as JsonRecord;}
function text(value:unknown):string {if(typeof value!=='string'||!value.length||value.length>1000)failure();return value;}
function numberString(value:unknown):string {const result=text(value);if(!decimal.test(result)||result.length>100)failure();return result;}
function datetime(value:unknown):string {const result=text(value);if(!Number.isFinite(Date.parse(result)))failure();return result;}
function optionalDecimal(value:unknown):string|undefined {return value===undefined||value===null?undefined:numberString(value);}
function list(value:unknown):JsonRecord[] {const data=record(value).data;if(!Array.isArray(data)||data.length>10000)failure();return data.map(record);}
function side(value:unknown):'buy'|'sell' {if(value==='BUY'||value==='BUY_TO_COVER')return 'buy';if(value==='SELL'||value==='SHORT_SELL')return 'sell';return failure();}
function hasStatus(error:unknown,status:number):boolean {return !!error&&typeof error==='object'&&('status' in error&&error.status===status||'statusCode' in error&&error.statusCode===status);}

/** TradeLocker Brand API. Its credentials never leave scoped vault reads or request headers. */
export class TradeLockerAdapter implements TradingProviderAdapter {
  readonly version='1.0.0';
  readonly descriptor:ProviderDescriptor={id:'tradelocker',slug:'tradelocker',name:'TradeLocker',category:'trading_platform',supportedProducts:['brokerage-crm'],capabilities:capabilityList,connectionMode:'api_key',connectorAvailable:true,managed:false};
  readonly trading:TradingProviderAdapter['trading'];
  private readonly origin:string;
  private readonly providerType:'LIVE'|'DEMO';
  constructor(private readonly options:TradeLockerOptions) {
    if(!['sandbox','demo','production'].includes(options.environment))throw new AppError(422,'PROVIDER_ENVIRONMENT_INVALID','Choose a supported trading provider environment.');
    this.origin=options.environment==='sandbox'?'https://api-dev.tradelocker.com':'https://api.tradelocker.com';
    // TradeLocker development accounts explicitly use LIVE type on the staging server.
    this.providerType=options.environment==='demo'?'DEMO':'LIVE';
    this.trading={createAccount:this.createAccount.bind(this),getAccount:this.getAccount.bind(this),enableAccount:this.enableAccount.bind(this),disableAccount:this.disableAccount.bind(this),setGroup:this.setGroup.bind(this),getBalance:this.getBalance.bind(this),getEquity:this.getEquity.bind(this),getMargin:this.getMargin.bind(this),getOrders:this.getOrders.bind(this),getPositions:this.getPositions.bind(this),getTrades:this.getTrades.bind(this)};
  }
  private async headers(context:ProviderConnectionContext,idempotencyKey?:string):Promise<Record<string,string>> {
    const credential=await context.vault.read(context.scope,context.credentialReference);
    if(credential.environment!==this.options.environment)throw new AppError(422,'PROVIDER_ENVIRONMENT_MISMATCH','The credential environment must match the connection environment.');
    const key=credential.brand_api_key;
    if(typeof key!=='string'||!key.trim()||key.length>4096||/[\r\n]/.test(key))throw new AppError(422,'PROVIDER_CREDENTIAL_INVALID','A valid TradeLocker Brand API key is required.');
    return {'brand-api-key':key,'Content-Type':'application/json',accept:'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})};
  }
  private async call(context:ProviderConnectionContext,path:string,body:JsonRecord,method:'POST'|'PUT'='POST',idempotencyKey?:string,allowMissing=false):Promise<unknown> {
    const headers=await this.headers(context,idempotencyKey);
    let response;
    const createsIdentityOrAccount=path==='/brand-api/v1/users/create'||path==='/brand-api/v1/accounts/create';
    try {response=await this.options.runtime.request({provider:'tradelocker',connectionKey:this.options.connectionKey,environment:this.options.environment,operation:path.replace(/^\/brand-api\/v[12]\//,'').replaceAll('/','.'),method,url:this.origin+path,headers,body:JSON.stringify(body),idempotent:!createsIdentityOrAccount,maxResponseBytes:2*1024*1024});}
    catch(error){if(allowMissing&&hasStatus(error,404))return undefined;throw error;}
    if(allowMissing&&response.status===404)return undefined;
    if(response.status<200||response.status>=300)throw new AppError(response.status===401||response.status===403?422:503,response.status===401||response.status===403?'PROVIDER_AUTHENTICATION_FAILED':'PROVIDER_REQUEST_FAILED','The trading provider request failed.');
    if(!response.body.trim())return {};
    // Duplicate keys are rejected and financial values never pass through a
    // floating-point parser. The Brand API documents those values as strings.
    try{return parseLosslessJson(response.body) as unknown;}catch{return failure();}
  }
  private accountId(value:string):string {
    if(!accountPattern.test(value)||value.length>60)throw new AppError(422,'PROVIDER_ACCOUNT_INVALID','Choose a valid provider account reference.');
    if(value[0]!== (this.providerType==='DEMO'?'D':'L'))throw new AppError(422,'PROVIDER_ACCOUNT_MISMATCH','The provider account belongs to another environment.');
    return value;
  }
  private command(value:ProviderCommand):void {if(!uuid.test(value.idempotency_key)||!value.reason?.trim())throw new AppError(422,'PROVIDER_COMMAND_INVALID','A stable UUID operation key and an audit reason are required.');}
  private account(value:unknown,expectedId?:string):TradingAccount {
    const row=record(value);const id=text(row.accountId);
    if(!accountPattern.test(id)||id[0]!== (this.providerType==='DEMO'?'D':'L')||row.type!==this.providerType||expectedId&&id!==expectedId)failure('PROVIDER_ACCOUNT_MISMATCH');
    const status=text(row.status);if(!['ACTIVE','RESTRICTED','SUSPENDED'].includes(status))failure();
    const userId=text(row.userId);if(!uuid.test(userId)||!(row.tradingDisabledReason===null||record(row.tradingDisabledReason).type==='RISK_RULE'))failure();
    const account:TradingAccount={provider_account_id:id,display_name:text(row.accountName),currency:text(row.currency),group_id:text(row.userGroupId),status:status==='ACTIVE'&&row.tradingDisabledReason===null?'enabled':'disabled',provider_user_id:userId,provider_status:status};
    if(row.accountLeverage!==undefined){const leverage=isLosslessNumber(row.accountLeverage)&&isSafeNumber(row.accountLeverage.value)?Number(row.accountLeverage.value):row.accountLeverage;if(typeof leverage!=='number'||!Number.isFinite(leverage)||leverage<=0)failure();account.leverage=leverage;}
    if(row.externalId!==undefined&&row.externalId!==null)account.external_reference=text(row.externalId);
    return account;
  }
  async validateConnection(context:ProviderConnectionContext):Promise<ProviderHealth> {
    try {const groups=list(await this.call(context,'/brand-api/v1/groups/all',{type:this.providerType}));for(const group of groups){text(group.id);text(group.name);}return {status:'connected',checkedAt:new Date().toISOString()};}
    catch(error){const safeCodes=['PROVIDER_ENVIRONMENT_MISMATCH','PROVIDER_CREDENTIAL_INVALID','PROVIDER_AUTHENTICATION_FAILED','PROVIDER_TIMEOUT','PROVIDER_RATE_LIMITED','PROVIDER_CIRCUIT_OPEN','PROVIDER_UNAVAILABLE','PROVIDER_NETWORK_ERROR','PROVIDER_CONCURRENCY_LIMIT'];const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;return {status:'failed',checkedAt:new Date().toISOString(),errorCode:typeof code==='string'&&safeCodes.includes(code)?code:'CONNECTION_VALIDATION_FAILED'};}
  }
  async disconnect():Promise<void> { /* Local credentials are revoked by Core; the API exposes no key-revocation endpoint. */ }
  async ensureUser(context:ProviderConnectionContext,input:TradeLockerUserCommand,beforeCreate?:()=>Promise<void>):Promise<{provider_user_id:string;created:boolean}> {
    if(!uuid.test(input.idempotency_key)||!/^\S+@\S+\.\S+$/.test(input.email)||input.email.length>320||input.password.length<12||input.password.length>200)throw new AppError(422,'PROVIDER_COMMAND_INVALID','A valid provider identity, secure trader password and stable UUID key are required.');
    const email=input.email.trim().toLowerCase();const existing=await this.findUserByEmail(context,email);
    if(existing!==undefined)return {provider_user_id:existing,created:false};
    if(beforeCreate)await beforeCreate();
    const result=record(await this.call(context,'/brand-api/v1/users/create',{email,password:input.password},'POST',input.idempotency_key));const user=text(result.userId);if(!uuid.test(user))failure();return {provider_user_id:user,created:true};
  }
  async findUserByEmail(context:ProviderConnectionContext,email:string):Promise<string|undefined> {
    if(!/^\S+@\S+\.\S+$/.test(email)||email.length>320)throw new AppError(422,'PROVIDER_COMMAND_INVALID','A valid provider identity is required.');
    const result=await this.call(context,'/brand-api/v1/users/check-by-email',{email:email.trim().toLowerCase()},'POST',undefined,true);
    if(result===undefined)return undefined;const user=text(record(result).userId);if(!uuid.test(user))failure();return user;
  }
  async findAccountByExternalReference(context:ProviderConnectionContext,userId:string,externalReference:string):Promise<TradingAccount|undefined> {
    if(!uuid.test(userId)||!externalReference||externalReference.length>160)throw new AppError(422,'PROVIDER_COMMAND_INVALID','Provider ownership and external operation references are required.');
    const matches=list(await this.call(context,'/brand-api/v1/accounts/all',{userId})).filter(row=>row.externalId===externalReference);
    if(matches.length>1)failure('PROVIDER_RECONCILIATION_AMBIGUOUS');
    if(!matches.length)return undefined;
    if(matches[0].userId!==userId)failure('PROVIDER_ACCOUNT_MISMATCH');
    const result=this.account(matches[0]);if(result.provider_user_id!==userId)failure('PROVIDER_ACCOUNT_MISMATCH');return result;
  }
  async createAccount(context:ProviderConnectionContext,input:CreateAccountCommand,beforeCreate?:()=>Promise<void>):Promise<TradingAccount> {
    this.command(input);const userId=input.provider_user_id;const reference=input.external_reference??input.idempotency_key;
    if(!userId||!uuid.test(userId)||!input.display_name?.trim()||input.display_name.length>120||!(/^[A-Z]{3}$/).test(input.currency)||!reference||reference.length>160||input.group_id.length>160)throw new AppError(422,'PROVIDER_COMMAND_INVALID','The trading account request requires a verified provider user, name, currency and external reference.');
    if(input.account_type&&this.options.environment!=='sandbox'&&input.account_type!== (this.providerType==='DEMO'?'demo':'live'))throw new AppError(422,'PROVIDER_ENVIRONMENT_MISMATCH','The account offering must match the provider environment.');
    const existing=await this.findAccountByExternalReference(context,userId,reference);
    if(existing){if(existing.currency!==input.currency||input.group_id&&existing.group_id!==input.group_id)failure('PROVIDER_ACCOUNT_MISMATCH');return existing;}
    if(beforeCreate)await beforeCreate();
    const result=this.account(await this.call(context,'/brand-api/v1/accounts/create',{userId,accountName:input.display_name,type:this.providerType,currency:input.currency,...(input.group_id?{groupId:input.group_id}:{}),externalId:reference},'POST',input.idempotency_key));
    if(result.provider_user_id!==userId||result.currency!==input.currency||result.external_reference!==reference||input.group_id&&result.group_id!==input.group_id)failure('PROVIDER_ACCOUNT_MISMATCH');return result;
  }
  async getAccount(context:ProviderConnectionContext,accountId:string):Promise<TradingAccount> {return this.account(await this.call(context,'/brand-api/v1/accounts/details',{accountId:this.accountId(accountId),withRiskDetails:true}),accountId);}
  private async setStatus(context:ProviderConnectionContext,accountId:string,input:ProviderCommand,path:string,status:string):Promise<void> {
    this.command(input);const result=record(await this.call(context,path,{accountId:this.accountId(accountId)},'PUT'));
    if(result.accountId!==accountId||result.status!==status)failure('PROVIDER_ACCOUNT_MISMATCH');
  }
  async enableAccount(context:ProviderConnectionContext,accountId:string,input:ProviderCommand):Promise<void> {return this.setStatus(context,accountId,input,'/brand-api/v1/accounts/activate','ACTIVE');}
  async disableAccount(context:ProviderConnectionContext,accountId:string,input:ProviderCommand):Promise<void> {return this.setStatus(context,accountId,input,'/brand-api/v1/accounts/suspend','SUSPENDED');}
  async setGroup(context:ProviderConnectionContext,accountId:string,groupId:string,input:ProviderCommand):Promise<TradingAccount> {
    this.command(input);if(!groupId||groupId.length>160)throw new AppError(422,'PROVIDER_COMMAND_INVALID','Choose a provider group.');
    await this.call(context,'/brand-api/v1/accounts/set-group',{accountId:this.accountId(accountId),newGroupId:groupId},'PUT');const result=await this.getAccount(context,accountId);if(result.group_id!==groupId)failure('PROVIDER_ACCOUNT_MISMATCH');return result;
  }
  private async snapshot(context:ProviderConnectionContext,accountId:string,expectedUserId?:string):Promise<AccountSnapshot> {
    const value=await this.call(context,'/brand-api/v1/accounts/details',{accountId:this.accountId(accountId)});const account=this.account(value,accountId);const row=record(value);
    if(expectedUserId&&account.provider_user_id!==expectedUserId)failure('PROVIDER_ACCOUNT_MISMATCH');
    return {provider_account_id:account.provider_account_id,currency:account.currency,balance:numberString(row.balance),equity:numberString(row.equity),margin:numberString(row.marginUsed),free_margin:numberString(row.marginAvailable),observed_at:new Date().toISOString()};
  }
  async getBalance(context:ProviderConnectionContext,accountId:string,expectedUserId?:string):Promise<AccountSnapshot>{return this.snapshot(context,accountId,expectedUserId);}
  async getEquity(context:ProviderConnectionContext,accountId:string):Promise<AccountSnapshot>{return this.snapshot(context,accountId);}
  async getMargin(context:ProviderConnectionContext,accountId:string):Promise<AccountSnapshot>{return this.snapshot(context,accountId);}
  async getOrders(context:ProviderConnectionContext,accountId:string,query:TradingQuery={}):Promise<TradingOrder[]> {
    this.accountId(accountId);const limit=query.limit??100;const offset=query.cursor===undefined?0:Number(query.cursor);
    if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(offset)||offset<0||offset>1000000||query.from||query.to)throw new AppError(422,'PROVIDER_QUERY_INVALID','Use a bounded limit and offset to read provider orders.');
    const rows=list(await this.call(context,'/brand-api/v1/orders/all',{accountId,type:this.providerType,offset,limit}));
    for(const row of rows)if(row.accountId!==accountId)failure('PROVIDER_ACCOUNT_MISMATCH');
    return rows.slice(0,limit).map(row=>{const type=text(row.type).toLowerCase();if(!['market','limit','stop','stop_limit','manual','trailing_stop'].includes(type))failure();const providerStatus=text(row.status);let status:TradingOrder['status'];
      if(providerStatus==='STATUS_FILLED')status='filled';else if(providerStatus==='STATUS_PART_FILLED')status='partially_filled';else if(['STATUS_CANCELED','STATUS_REMOVED'].includes(providerStatus))status='cancelled';else if(providerStatus==='STATUS_REFUSED')status='rejected';else if(['STATUS_NONE','STATUS_PENDING_NEW','STATUS_PENDING_EXECUTION','STATUS_PENDING_CANCEL','STATUS_PENDING_REPLACE','STATUS_PENDING_REPLACE_NOT_ACTIVE','STATUS_NEW','STATUS_ACCEPTED','STATUS_REPLACED','STATUS_RESTATED','EXEC_TYPE_ACTIVATED','STATUS_WAITING_MARKET','STATUS_OFF_MARKET','STATUS_UNPLACED','STATUS_MODIFY_TRADING_MODE'].includes(providerStatus))status='pending';else return failure();
      return {provider_order_id:text(row.orderId),provider_account_id:accountId,symbol:text(row.instrument),side:side(row.side),type:type as TradingOrder['type'],volume:numberString(row.amount),price:optionalDecimal(row.price),stop_loss:optionalDecimal(row.slPrice),take_profit:optionalDecimal(row.tpPrice),status,created_at:datetime(row.createdDateTime)};
    });
  }
  async getPositions(context:ProviderConnectionContext,accountId:string,limit=1000):Promise<TradingPosition[]> {
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw new AppError(422,'PROVIDER_QUERY_INVALID','Use a bounded limit to read provider positions.');
    const rows=list(await this.call(context,'/brand-api/v2/positions/get-open-positions',{type:this.providerType,accountIds:[this.accountId(accountId)]}));
    for(const row of rows)if(row.accountId!==accountId)failure('PROVIDER_ACCOUNT_MISMATCH');
    return rows.slice(0,limit).map(row=>({provider_position_id:text(row.positionId),provider_account_id:accountId,symbol:text(row.instrument),side:side(row.side),volume:numberString(row.lots),open_price:numberString(row.openPrice),current_price:optionalDecimal(row.currentPrice),profit:optionalDecimal(row.pnl),stop_loss:optionalDecimal(row.slPrice),take_profit:optionalDecimal(row.tpPrice),opened_at:datetime(row.openDateTime)}));
  }
  async getTrades(context:ProviderConnectionContext,accountId:string,query:TradingQuery={}):Promise<TradingTrade[]> {
    this.accountId(accountId);const to=query.to??new Date().toISOString();const end=Date.parse(to);
    if(!Number.isFinite(end))throw new AppError(422,'PROVIDER_QUERY_INVALID','Provider trades require a valid date window.');
    const from=query.from??new Date(end-30*86400_000).toISOString();const window=end-Date.parse(from);const limit=query.limit??1000;
    if(!Number.isFinite(window)||window<0||window>31*86400_000||query.cursor||!Number.isInteger(limit)||limit<1||limit>1000)throw new AppError(422,'PROVIDER_QUERY_INVALID','Provider trades require a valid date window of at most 31 days and a bounded limit.');
    const rows=list(await this.call(context,'/brand-api/v2/reports/trades-history-report',{type:this.providerType,accountIds:[accountId],startDateTime:from,endDateTime:to}));
    // Verify every returned owner before slicing, so a malicious extra row cannot hide beyond the limit.
    for(const row of rows)if(row.accountId!==accountId)failure('PROVIDER_ACCOUNT_MISMATCH');
    return rows.slice(0,limit).map(row=>({provider_trade_id:text(row.tradeId),provider_account_id:accountId,provider_order_id:text(row.orderId),provider_position_id:text(row.positionId),symbol:text(row.instrument),side:side(row.side),volume:numberString(row.lots),price:numberString(row.price),profit:optionalDecimal(row.pnl),commission:optionalDecimal(row.executionFee),swap:optionalDecimal(row.swap),executed_at:datetime(row.tradeDateTime)}));
  }
}
