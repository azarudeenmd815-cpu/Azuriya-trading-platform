import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { AppError } from '../domain/errors.js';
import { recordEvent,scopeValues,scopeWhere } from '../brokerage/common.js';
import type { Executor } from '../db/database.js';
import type { AccountSnapshot,TradingAccount } from '../domain/trading-provider.js';
import { ConnectorError } from './runtime.js';
import { enqueueOperation } from './connection-service.js';
import { TradeLockerAdapter } from './tradelocker.js';
import { ageInYears } from '../brokerage/accounts.js';
import type { ExternalOperation,OperationExecution,OperationResult } from './types.js';

interface AccountRecord {
  id:string;client_id:string;connection_id:string|null;provider_id:string;status:string;currency:string;leverage:number;account_type:'live'|'demo';
  account_number:string;external_account_id:string|null;provider_group:string|null;client_email:string;client_status:string;kyc_status:string;
  offering_enabled:boolean;requires_kyc:boolean;currencies:string[];leverage_options:number[];trader_credential_reference:string|null;
  provider_snapshot:{account?:{provider_user_id?:string}}|null;country:string|null;residence_country:string|null;birth_date:string|null;client_type:string;
  eligibility:{allowed_countries?:string[];restricted_countries?:string[];client_types?:string[];minimum_age?:number;required_terms?:Array<{document_type:string;version:string}>};
}
const blockedClientStates=['lead','invited','restricted','suspended','closed','rejected'];
const protectedAccountStates=['closed','archived','restricted','read_only'];
const capabilityByOperation:Record<string,string>={'account.create':'account.create','account.sync':'account.sync','account.enable':'account.enable','account.disable':'account.disable'};
function validBinding(execution:OperationExecution):void {
  const {scope,connection,operation,providerContext}=execution;
  const binding=[['organization_id',scope.organizationId],['brand_id',scope.brandId],['environment_id',scope.environmentId],['product_instance_id',scope.productInstanceId]] as const;
  if(scope.core||binding.some(([key,value])=>connection[key]!==value||operation[key]!==value)||operation.connection_id!==connection.id||operation.resource_type!=='account'||!operation.account_id||operation.resource_id!==operation.account_id||connection.provider_slug!=='tradelocker'||providerContext.scope.organizationId!==scope.organizationId||providerContext.scope.productInstanceId!==scope.productInstanceId||providerContext.scope.providerId!==connection.provider_id||providerContext.credentialReference!==connection.credential_reference)throw new AppError(403,'TRADING_SCOPE_MISMATCH','This trading operation is unavailable in this workspace.');
  if(!['connected','degraded'].includes(connection.status)||!connection.credential_reference)throw new AppError(409,'TRADING_CONNECTION_UNAVAILABLE','The trading connection is unavailable.');
  if(operation.credential_revision!==connection.credential_revision)throw new AppError(409,'TRADING_CREDENTIAL_CHANGED','The connection configuration changed before this operation.');
  const capability=capabilityByOperation[operation.operation_type];if(!capability||!connection.capabilities.includes(capability))throw new AppError(422,'PROVIDER_CAPABILITY_UNAVAILABLE','The connection does not support this trading operation.');
}
async function leasedOperation(tx:Executor,execution:OperationExecution):Promise<ExternalOperation> {
  const {scope,connection,operation}=execution;
  const row=(await tx.query<ExternalOperation>(`SELECT o.* FROM connector_operations o JOIN brokerage_connections b ON b.id=o.connection_id WHERE ${scopeWhere('o')} AND o.id=$5 AND o.state='running' AND o.lease_token=$6 AND o.lease_until>now() AND o.credential_revision=$7 AND b.credential_revision=$7 AND b.status IN('connected','degraded') AND b.credential_reference=$8 FOR UPDATE OF o`,[...scopeValues(scope),operation.id,operation.lease_token,connection.credential_revision,connection.credential_reference])).rows[0];
  if(!row)throw new AppError(409,'TRADING_OPERATION_LEASE_LOST','This trading operation no longer owns an active lease.');return row;
}
async function currentAccount(tx:Executor,execution:OperationExecution,lock=false):Promise<AccountRecord> {
  const {scope,operation,connection}=execution;
  const row=(await tx.query<AccountRecord>(`SELECT a.id,a.client_id,a.connection_id,a.provider_id,a.status,a.currency,a.leverage,a.account_type,a.account_number,a.external_account_id,a.provider_group,a.trader_credential_reference,a.provider_snapshot,c.email AS client_email,c.status AS client_status,c.kyc_status,c.country,c.residence_country,c.birth_date::text,c.client_type,o.enabled AS offering_enabled,o.requires_kyc,o.currencies,o.leverage_options,o.eligibility FROM brokerage_accounts a JOIN brokerage_clients c ON c.id=a.client_id AND c.organization_id=a.organization_id AND c.brand_id=a.brand_id AND c.environment_id=a.environment_id AND c.product_instance_id=a.product_instance_id JOIN brokerage_offerings o ON o.id=a.offering_id AND o.organization_id=a.organization_id AND o.brand_id=a.brand_id AND o.environment_id=a.environment_id AND o.product_instance_id=a.product_instance_id WHERE ${scopeWhere('a')} AND a.id=$5${lock?' FOR UPDATE OF a,c,o':''}`,[...scopeValues(scope),operation.resource_id])).rows[0];
  if(!row||row.connection_id!==connection.id||row.provider_id!==connection.provider_id)throw new AppError(403,'TRADING_ACCOUNT_BINDING_MISMATCH','The account does not belong to this trading connection.');return row;
}
async function loadAccount(execution:OperationExecution):Promise<AccountRecord> {
  return execution.db.transaction(execution.scope,async tx=>{await leasedOperation(tx,execution);return currentAccount(tx,execution);});
}
function derivedUserKey(key:string):string {
  const chars=createHash('sha256').update(`tradelocker-user:${key}`).digest('hex').slice(0,32).split('');chars[12]='4';chars[16]='8';const value=chars.join('');return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
function secretBinding(execution:OperationExecution,account:AccountRecord){const {scope}=execution;return {purpose:'trader_credentials',account_id:account.id,client_id:account.client_id,organization_id:scope.organizationId,brand_id:scope.brandId,environment_id:scope.environmentId,product_instance_id:scope.productInstanceId,identity_fingerprint:createHash('sha256').update(account.client_email.trim().toLowerCase()).digest('hex')};}
async function prepareTraderSecret(execution:OperationExecution,account:AccountRecord,operation:ExternalOperation):Promise<{reference:string;password:string}> {
  const {db,scope,providerContext}=execution;const binding=secretBinding(execution,account);
  if(operation.secret_reference){const secret=await providerContext.vault.read(providerContext.scope,operation.secret_reference);if(Object.entries(binding).some(([key,value])=>secret[key]!==value)||typeof secret.password!=='string'||secret.password.length<24)throw new AppError(422,'TRADER_CREDENTIAL_BINDING_MISMATCH','The trader credential binding is invalid.');return {reference:operation.secret_reference,password:secret.password};}
  const password=`Aa1!${randomBytes(32).toString('base64url')}`;const reference=await providerContext.vault.store(providerContext.scope,{...binding,password});
  try {await db.transaction(scope,async tx=>{const current=await leasedOperation(tx,execution);if(current.secret_reference)throw new AppError(409,'TRADER_CREDENTIAL_STAGE_CONFLICT','The trader identity is already being prepared.');await tx.query(`UPDATE connector_operations SET secret_reference=$6,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),operation.id,reference]);});}
  catch(error){await db.transaction(scope,tx=>tx.query('DELETE FROM credential_envelopes WHERE id=$1 AND organization_id=$2 AND provider_id=$3 AND product_instance_id=$4',[reference,scope.organizationId,execution.connection.provider_id,scope.productInstanceId])).catch(()=>{});throw error;}
  return {reference,password};
}
async function stageIdentity(execution:OperationExecution,userId:string,created:boolean,secretReference:string|null):Promise<ExternalOperation> {
  const {db,scope,connection}=execution;
  return db.transaction(scope,async tx=>{
    const current=await leasedOperation(tx,execution);const evidence={...current.safe_evidence,user_created:created};
    await tx.query(`UPDATE connector_operations SET provider_secondary_reference=$6,secret_reference=$7,safe_evidence=$8::jsonb,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),current.id,userId,created?secretReference:null,JSON.stringify(evidence)]);
    if(!created&&secretReference)await tx.query('DELETE FROM credential_envelopes WHERE id=$1 AND organization_id=$2 AND provider_id=$3 AND product_instance_id=$4',[secretReference,scope.organizationId,connection.provider_id,scope.productInstanceId]);return {...current,provider_secondary_reference:userId,secret_reference:created?secretReference:null,safe_evidence:evidence};
  });
}
async function eligible(tx:Executor,scope:OperationExecution['scope'],account:AccountRecord):Promise<boolean> {
  if(blockedClientStates.includes(account.client_status)||protectedAccountStates.includes(account.status)||!account.offering_enabled||!account.currencies.includes(account.currency)||!account.leverage_options.includes(account.leverage))return false;
  const settings=(await tx.query<Record<string,unknown>>(`SELECT * FROM brokerage_settings WHERE ${scopeWhere()}`,[...scopeValues(scope)])).rows[0]??{};const rules=account.eligibility??{};const country=account.residence_country??account.country;
  if(!country||settings.allow_account_requests===false)return false;
  const allowed=rules.allowed_countries??[];const restricted=rules.restricted_countries??[];const globalAllowed=(settings.allowed_countries??[]) as string[];const globalRestricted=(settings.restricted_countries??[]) as string[];
  if((allowed.length&&!allowed.includes(country))||(globalAllowed.length&&!globalAllowed.includes(country))||restricted.includes(country)||globalRestricted.includes(country))return false;
  if(!(rules.client_types??['individual','corporate']).includes(account.client_type)||!((settings.allowed_client_types??['individual','corporate']) as string[]).includes(account.client_type))return false;
  const minimumAge=Math.max(rules.minimum_age??0,typeof settings.minimum_age==='number'?settings.minimum_age:18);
  if(account.client_type==='individual'&&minimumAge>0&&(!account.birth_date||ageInYears(account.birth_date)<minimumAge))return false;
  if((account.requires_kyc||settings.require_kyc!==false)&&account.kyc_status!=='approved')return false;
  if((await tx.query(`SELECT d.id FROM brokerage_consent_documents d WHERE ${scopeWhere('d')} AND d.active AND d.required AND NOT EXISTS(SELECT 1 FROM brokerage_consents c WHERE c.organization_id=d.organization_id AND c.brand_id=d.brand_id AND c.environment_id=d.environment_id AND c.product_instance_id=d.product_instance_id AND c.client_id=$5 AND c.document_id=d.id AND c.document_hash=d.document_hash) LIMIT 1`,[...scopeValues(scope),account.client_id])).rows.length)return false;
  for(const terms of rules.required_terms??[])if(!(await tx.query(`SELECT c.id FROM brokerage_consents c JOIN brokerage_consent_documents d ON d.id=c.document_id AND d.organization_id=c.organization_id AND d.brand_id=c.brand_id AND d.environment_id=c.environment_id AND d.product_instance_id=c.product_instance_id AND d.document_hash=c.document_hash WHERE ${scopeWhere('c')} AND c.client_id=$5 AND c.document_type=$6 AND c.version=$7 AND d.active LIMIT 1`,[...scopeValues(scope),account.client_id,terms.document_type,terms.version])).rows.length)return false;
  return true;
}
async function startCreation(execution:OperationExecution,account:AccountRecord,marker:'user_creation_started'|'account_creation_started'):Promise<void>{
  await execution.db.transaction(execution.scope,async tx=>{const current=await leasedOperation(tx,execution);const latest=await currentAccount(tx,execution,true);if(latest.client_id!==account.client_id||latest.client_email!==account.client_email||latest.currency!==account.currency||latest.provider_group!==account.provider_group||!await eligible(tx,execution.scope,latest)||latest.status==='disabled')throw new AppError(422,'TRADING_ACCOUNT_INELIGIBLE','This account request is no longer eligible for provider provisioning.');await tx.query(`UPDATE connector_operations SET safe_evidence=$6::jsonb,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(execution.scope),current.id,JSON.stringify({...current.safe_evidence,[marker]:true})]);});
}
async function createWithRecovery<T>(execution:OperationExecution,marker:'user_creation_started'|'account_creation_started',work:()=>Promise<T>):Promise<T>{
  try{return await work();}catch(error){
    // These statuses prove rejection rather than a lost success receipt. A
    // timeout, malformed success or provider 5xx retains the durable marker.
    const beforeRequestCodes=['PROVIDER_CIRCUIT_OPEN','PROVIDER_CONCURRENCY_LIMIT','PROVIDER_RUNTIME_CAPACITY','CONNECTOR_RATE_LIMITED','CONNECTOR_RATE_LIMITER_UNAVAILABLE'];
    if(error instanceof ConnectorError&&!error.ambiguous&&([400,401,403,422,429].includes(error.status??0)||beforeRequestCodes.includes(error.code)))await execution.db.transaction(execution.scope,async tx=>{const current=await leasedOperation(tx,execution);await tx.query(`UPDATE connector_operations SET safe_evidence=$6::jsonb,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(execution.scope),current.id,JSON.stringify({...current.safe_evidence,[marker]:false})]);});
    throw error;
  }
}
function verifiedOwner(normalized:TradingAccount,account:AccountRecord,userId:string):void {if(normalized.provider_user_id!==userId||normalized.currency!==account.currency||(normalized.external_reference!==undefined&&normalized.external_reference!==account.id))throw new AppError(422,'TRADING_PROVIDER_ACCOUNT_MISMATCH','The provider account ownership or currency does not match.');}
function missingProviderRecord(error:unknown):boolean {return !!error&&typeof error==='object'&&('status' in error&&error.status===404||'statusCode' in error&&error.statusCode===404);}
async function reconciliation(tx:Executor,execution:OperationExecution,account:AccountRecord,kind:'account_state_mismatch'|'provider_record_missing',localState:string,providerState:string,decision:'provider_authoritative'|'manual_review'|'local_intent_preserved',action:string,reference:string|null):Promise<void> {
  const {scope,connection,operation}=execution;
  const row=(await tx.query<{id:string}>('INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,\'account\',$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING RETURNING id',[randomUUID(),...scopeValues(scope),connection.id,operation.id,account.id,kind,localState,providerState,decision,action,reference,scope.userId])).rows[0];
  if(row)await recordEvent(tx,scope,'brokerage.account.reconciliation_detected','brokerage_account',account.id,{client_id:account.client_id,kind,local_state:localState,provider_state:providerState,decision,reconciliation_id:row.id});
}

/** Provider I/O is completed before the receipt's apply function runs in a scoped transaction. */
export async function executeTradingOperation(execution:OperationExecution):Promise<OperationResult> {
  validBinding(execution);const {db,scope,connection,operation,providerContext,runtime}=execution;const account=await loadAccount(execution);const adapter=new TradeLockerAdapter({runtime,environment:connection.provider_environment,connectionKey:connection.id});let prepared=await db.transaction(scope,tx=>leasedOperation(tx,execution));let normalized:TradingAccount;
  if(operation.operation_type==='account.create'){
    if(!await db.transaction(scope,tx=>eligible(tx,scope,account))||account.status==='disabled')throw new AppError(422,'TRADING_ACCOUNT_INELIGIBLE','This account request is no longer eligible for provider provisioning.');
    // The provider publishes no cache TTL. Legacy retries without a durable
    // marker may reconcile reads, but cannot prove a new create is safe.
    const legacyRecovery=operation.attempt>1&&prepared.safe_evidence.creation_protocol_version!==2;
    if(operation.attempt===1){prepared=await db.transaction(scope,async tx=>{const current=await leasedOperation(tx,execution);const evidence={...current.safe_evidence,creation_protocol_version:2};await tx.query(`UPDATE connector_operations SET safe_evidence=$6::jsonb,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),current.id,JSON.stringify(evidence)]);return {...current,safe_evidence:evidence};});}
    let providerUser=prepared.provider_secondary_reference;
    if(!providerUser){
      if(legacyRecovery||prepared.safe_evidence.user_creation_started===true){providerUser=await adapter.findUserByEmail(providerContext,account.client_email)??null;if(!providerUser)throw new ConnectorError('TRADING_CREATION_RECONCILIATION_REQUIRED',false,true);prepared=await stageIdentity(execution,providerUser,false,prepared.secret_reference);}
      else {const secret=await prepareTraderSecret(execution,account,prepared);const identity=await createWithRecovery(execution,'user_creation_started',()=>adapter.ensureUser(providerContext,{email:account.client_email,password:secret.password,idempotency_key:derivedUserKey(operation.provider_idempotency_key)},()=>startCreation(execution,account,'user_creation_started')));providerUser=identity.provider_user_id;prepared=await stageIdentity(execution,providerUser,identity.created,secret.reference);}
    }
    const existing=await adapter.findAccountByExternalReference(providerContext,providerUser,account.id);
    if(existing)normalized=existing;
    else {
      if(legacyRecovery||prepared.safe_evidence.account_creation_started===true)throw new ConnectorError('TRADING_CREATION_RECONCILIATION_REQUIRED',false,true);
      normalized=await createWithRecovery(execution,'account_creation_started',()=>adapter.createAccount(providerContext,{display_name:account.account_number,group_id:account.provider_group??'',currency:account.currency,leverage:account.leverage,account_type:account.account_type,provider_user_id:providerUser,external_reference:account.id,idempotency_key:operation.provider_idempotency_key,reason:'Approved client trading account request'},()=>startCreation(execution,account,'account_creation_started')));
    }
    if(normalized.provider_user_id!==providerUser||normalized.currency!==account.currency||normalized.external_reference!==account.id||account.provider_group&&normalized.group_id!==account.provider_group)throw new AppError(422,'TRADING_PROVIDER_ACCOUNT_MISMATCH','The provider account ownership or offering does not match.');
  }else{
    const reference=operation.provider_reference??account.external_account_id;if(!reference||account.external_account_id!==reference)throw new AppError(422,'TRADING_PROVIDER_REFERENCE_REQUIRED','The account does not have a verified provider reference.');
    if(operation.operation_type==='account.enable'&&!await db.transaction(scope,tx=>eligible(tx,scope,account)))throw new AppError(422,'TRADING_ACCOUNT_INELIGIBLE','This account is no longer eligible to enable provider trading.');
    const command={idempotency_key:operation.provider_idempotency_key,reason:'Approved brokerage provider account action'};
    const owner=account.provider_snapshot?.account?.provider_user_id??prepared.provider_secondary_reference??await adapter.findUserByEmail(providerContext,account.client_email);if(!owner)throw new AppError(422,'TRADING_PROVIDER_ACCOUNT_MISMATCH','The provider account owner cannot be verified.');
    try {normalized=await adapter.getAccount(providerContext,reference);verifiedOwner(normalized,account,owner);if(operation.operation_type==='account.disable'){await adapter.disableAccount(providerContext,reference,command);normalized=await adapter.getAccount(providerContext,reference);}else if(operation.operation_type==='account.enable'){await adapter.enableAccount(providerContext,reference,command);normalized=await adapter.getAccount(providerContext,reference);}verifiedOwner(normalized,account,owner);}
    catch(error){if(operation.operation_type!=='account.sync'||!missingProviderRecord(error))throw error;return {provider_reference:reference,evidence:{status:'provider_record_missing'},apply:async tx=>{await leasedOperation(tx,execution);await tx.query(`UPDATE brokerage_accounts SET sync_status='failed',failure_code='PROVIDER_RECORD_MISSING',updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),account.id]);await reconciliation(tx,execution,account,'provider_record_missing',account.status,'missing','manual_review','provider_reference_review_required',reference);}};}
  }
  const snapshot:AccountSnapshot=await adapter.getBalance(providerContext,normalized.provider_account_id,normalized.provider_user_id);
  if(snapshot.currency!==account.currency)throw new AppError(422,'TRADING_PROVIDER_ACCOUNT_MISMATCH','The provider snapshot currency does not match.');
  const readData=operation.operation_type==='account.sync'?{orders:await adapter.getOrders(providerContext,normalized.provider_account_id,{limit:100}),positions:await adapter.getPositions(providerContext,normalized.provider_account_id,100),trades:await adapter.getTrades(providerContext,normalized.provider_account_id,{limit:100})}:{};
  const tradingObservations=operation.operation_type==='account.sync'?{...readData,observed_at:new Date().toISOString(),connector_version:adapter.version,limited:true}:null;
  const providerState=normalized.status==='enabled'?'active':normalized.provider_status==='RESTRICTED'?'restricted':'disabled';
  const providerSnapshot={...snapshot,account:normalized,source:'tradelocker'};
  const {observed_at,...fingerprintSnapshot}=snapshot;void observed_at;const fingerprint=createHash('sha256').update(JSON.stringify([normalized,fingerprintSnapshot,readData])).digest('hex');
  return {provider_reference:normalized.provider_account_id,...(normalized.provider_user_id?{secondary_reference:normalized.provider_user_id}:{}),evidence:{status:providerState,provider_status:normalized.provider_status??normalized.status,observation_fingerprint:fingerprint,user_created:prepared.safe_evidence.user_created===true},apply:async tx=>{
    await leasedOperation(tx,execution);
    const current=await currentAccount(tx,execution,true);
    if(current.client_id!==account.client_id||current.currency!==account.currency||current.account_type!==account.account_type)throw new AppError(409,'TRADING_ACCOUNT_BINDING_CHANGED','The account ownership or environment changed before synchronization.');
    if(current.external_account_id&&current.external_account_id!==normalized.provider_account_id)throw new AppError(409,'TRADING_PROVIDER_REFERENCE_CHANGED','The provider account reference changed before synchronization.');
    const allowEnable=operation.operation_type==='account.create'||operation.operation_type==='account.enable';
    const eligibilityRevoked=allowEnable&&!await eligible(tx,scope,current);const clientBlocked=blockedClientStates.includes(current.client_status);const localRestriction=protectedAccountStates.includes(current.status)||(current.status==='disabled'&&operation.operation_type!=='account.enable');
    const protectedIntent=localRestriction||clientBlocked||eligibilityRevoked;const downscope=providerState!=='active'&&['active','queued','requested','provisioning','provider_pending','failed'].includes(current.status);
    const next=localRestriction?current.status:clientBlocked||eligibilityRevoked?'disabled':allowEnable||downscope?providerState:current.status;
    if(current.status!==providerState)await reconciliation(tx,execution,account,'account_state_mismatch',current.status,providerState,next===providerState?'provider_authoritative':'local_intent_preserved',next===providerState?'provider_status_applied':'local_restriction_preserved',normalized.provider_account_id);
    const reveal=operation.operation_type==='account.create'&&prepared.safe_evidence.user_created===true&&!protectedIntent&&next==='active'&&prepared.secret_reference!==null;
    await tx.query(`UPDATE brokerage_accounts SET external_account_id=$6,external_login=COALESCE($7,external_login),external_reference=$8,status=$9,provider_group=$10,provider_snapshot=$11::jsonb,provisioning_mode='provider',sync_status='synchronized',synchronized_at=now(),provider_revision=$12,failure_code=NULL,trader_credential_reference=CASE WHEN $13 THEN $14::uuid ELSE trader_credential_reference END,trader_credentials_expires_at=CASE WHEN $13 THEN now()+interval '24 hours' ELSE trader_credentials_expires_at END,trading_observations=COALESCE($15::jsonb,trading_observations),updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),account.id,normalized.provider_account_id,normalized.login??(operation.operation_type==='account.create'?account.client_email:null),account.id,next,normalized.group_id,JSON.stringify(providerSnapshot),fingerprint,reveal,prepared.secret_reference,tradingObservations?JSON.stringify(tradingObservations):null]);
    if(operation.operation_type==='account.create'&&prepared.secret_reference&&!reveal&&!current.trader_credential_reference){await tx.query(`UPDATE connector_operations SET secret_reference=NULL WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),operation.id]);await tx.query('DELETE FROM credential_envelopes WHERE id=$1 AND organization_id=$2 AND provider_id=$3 AND product_instance_id=$4',[prepared.secret_reference,scope.organizationId,connection.provider_id,scope.productInstanceId]);}
    const receipt=(await tx.query<{id:string}>('INSERT INTO connector_event_receipts(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,provider,provider_event_id,event_type,provider_reference,body_sha256,state,processed_at) VALUES($1,$2,$3,$4,$5,$6,\'tradelocker\',$7,$8,$9,$10,\'processed\',now()) ON CONFLICT(connection_id,provider_event_id) DO NOTHING RETURNING id',[randomUUID(),...scopeValues(scope),connection.id,`poll:${fingerprint}`,providerState==='disabled'?'trading_account.disabled':'trading_account.updated',normalized.provider_account_id,fingerprint])).rows[0];
    if(receipt)await recordEvent(tx,scope,operation.operation_type==='account.create'?'brokerage.account.provider_created':'brokerage.account.provider_synchronized','brokerage_account',account.id,{client_id:account.client_id,status:next,provider_status:normalized.provider_status??normalized.status,observation_id:receipt.id});
    if(protectedIntent&&providerState==='active'&&operation.operation_type!=='account.disable')await enqueueOperation(tx,scope,connection,'account.disable','account',account.id,{source:'local_trading_intent_preserved'});
    if(next===providerState&&!protectedAccountStates.includes(next)){
      const resolved=(await tx.query<{id:string}>(`UPDATE connector_reconciliations SET status='resolved',resolved_at=now() WHERE id IN(SELECT id FROM connector_reconciliations WHERE ${scopeWhere()} AND connection_id=$5 AND resource_type='account' AND resource_id=$6 AND status='open' AND kind IN('account_state_mismatch','provider_record_missing','ambiguous_operation') ORDER BY created_at,id LIMIT 50) RETURNING id`,[...scopeValues(scope),connection.id,account.id])).rows;
      for(const item of resolved)await recordEvent(tx,scope,'brokerage.account.reconciliation_resolved','brokerage_account',account.id,{client_id:account.client_id,reconciliation_id:item.id,status:next,provider_reference:normalized.provider_account_id});
    }
  }};
}
