import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import type { TenantContext } from '../../shared/types.js';
import { AppError } from '../domain/errors.js';
import { recordEvent,scopeValues,scopeWhere } from '../brokerage/common.js';
import { boundDatabase,connectorVault,loadConnector } from './connection-service.js';
import { ConnectorError,ConnectorRuntime,redactProviderMetadata } from './runtime.js';
import { TradeLockerAdapter } from './tradelocker.js';
import { StripePaymentProvider } from './stripe-payment.js';
import { executeTradingOperation } from './trading-operations.js';
import { executePaymentOperation } from './payment-operations.js';
import type { ExternalOperation,OperationExecution,OperationResult } from './types.js';
import { postgresConnectorGate } from './request-gate.js';

export const connectorRuntime=new ConnectorRuntime();
export function stripeProvider(execution:Pick<OperationExecution,'credentials'|'connection'|'runtime'|'origin'>){
 const {credentials,connection}=execution;
 if(credentials.environment!==connection.provider_environment)throw new AppError(422,'CONNECTOR_ENVIRONMENT_MISMATCH','Credentials belong to another provider environment.');
 const url=`${execution.origin}/portal/${connection.product_instance_id}/deposits`;
 return new StripePaymentProvider({secretKey:credentials.secret_key??'',webhookSecret:credentials.webhook_secret??'',environment:connection.provider_environment,connectionKey:connection.id,runtime:execution.runtime,successUrl:url,cancelUrl:url,...(credentials.stripe_account_id?{stripeAccountId:credentials.stripe_account_id}:{})});
}
export class ConnectorWorker {
 private runtime:ConnectorRuntime;private origin:string;
 constructor(private db:Database,options:{runtime?:ConnectorRuntime;origin?:string}={}){this.runtime=options.runtime??connectorRuntime;if(!options.runtime)this.runtime.setRequestGate(postgresConnectorGate(db));this.origin=options.origin??process.env.APP_ORIGIN??'http://127.0.0.1:5173';}
 async claim(id?:string):Promise<ExternalOperation|undefined>{return this.db.transaction({core:true},async tx=>{
  await tx.query("UPDATE connector_operations SET state='reconciliation_required',reconciliation_state='manual_review',last_error='ATTEMPTS_EXHAUSTED',lease_token=NULL,lease_until=NULL WHERE attempt>=max_attempts AND state IN('running','retry_pending','ambiguous') AND (lease_until IS NULL OR lease_until<=now())");
  return (await tx.query<ExternalOperation>(`WITH candidate AS(SELECT id FROM connector_operations WHERE ($1::uuid IS NULL OR id=$1) AND attempt<max_attempts AND ((state IN('queued','retry_pending','ambiguous') AND next_attempt_at<=now()) OR (state='running' AND lease_until<=now())) ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE connector_operations o SET safe_evidence=o.safe_evidence||jsonb_build_object('previous_state',o.state),state='running',attempt=o.attempt+1,lease_token=$2,lease_until=now()+interval '180 seconds',started_at=COALESCE(o.started_at,now()),updated_at=now() FROM candidate c WHERE o.id=c.id RETURNING o.*`,[id??null,randomUUID()])).rows[0];
 });}
 private async scope(operation:ExternalOperation):Promise<TenantContext>{
  const hierarchy=(await this.db.transaction({core:true},tx=>tx.query<{valid:boolean}>(`SELECT (o.status='active' AND b.status='active' AND e.status='active' AND i.status='active' AND p.slug='brokerage-crm' AND (u.status='active' OR $6::boolean)) AS valid FROM product_instances i JOIN organizations o ON o.id=i.organization_id JOIN brands b ON b.id=i.brand_id AND b.organization_id=i.organization_id JOIN environments e ON e.id=i.environment_id AND e.organization_id=i.organization_id JOIN products p ON p.id=i.product_id JOIN users u ON u.id=$5 WHERE i.organization_id=$1 AND i.brand_id=$2 AND i.environment_id=$3 AND i.id=$4`,[operation.organization_id,operation.brand_id,operation.environment_id,operation.product_instance_id,operation.created_by,operation.operation_type.endsWith('.sync')]))).rows[0];
  if(!hierarchy?.valid)throw new AppError(409,'CONNECTOR_SCOPE_INACTIVE','The connector workspace or initiating identity is inactive.');
  return {core:false,organizationId:operation.organization_id,brandId:operation.brand_id,environmentId:operation.environment_id,productInstanceId:operation.product_instance_id,productSlug:'brokerage-crm',userId:operation.created_by,requestId:`connector_${operation.id}`,permissions:[]};
 }
 private async execution(operation:ExternalOperation):Promise<OperationExecution>{
  const scope=await this.scope(operation);const connection=await loadConnector(this.db,scope,operation.connection_id);
  if(['disabled','disconnected','suspended'].includes(connection.status))throw new AppError(409,'CONNECTOR_DISABLED','The provider connection is disabled.');
  if(connection.credential_revision!==operation.credential_revision)throw new AppError(409,'CONNECTOR_CREDENTIAL_CHANGED','Reconcile this operation after credential rotation.');
  if(!operation.operation_type.startsWith('connection.')&&connection.status!=='connected'&&connection.status!=='degraded')throw new AppError(409,'CONNECTOR_NOT_HEALTHY','The provider must be validated before execution.');
  if(connection.provider_environment==='production'&&!operation.operation_type.startsWith('connection.')&&!operation.operation_type.endsWith('.sync')&&process.env.CONNECTOR_PRODUCTION_EXECUTION!=='enabled')throw new AppError(422,'PRODUCTION_EXECUTION_DISABLED','Production provider execution is not enabled.');
  const reference=operation.operation_type==='connection.rotate'?connection.candidate_credential_reference:connection.credential_reference;if(!reference)throw new AppError(422,'CONNECTOR_CREDENTIAL_REQUIRED','Configure encrypted credentials before execution.');
  const vault=connectorVault(this.db,scope);const binding={organizationId:scope.organizationId,providerId:connection.provider_id,productInstanceId:scope.productInstanceId};const credentials=await vault.read(binding,reference);
  return {db:this.db,scope,connection,operation,runtime:this.runtime,origin:this.origin,credentials,providerContext:{scope:binding,credentialReference:reference,vault,requestId:scope.requestId}};
 }
 private async validate(execution:OperationExecution):Promise<OperationResult>{
  const started=performance.now();let providerReference:string|undefined;
  if(execution.connection.provider_slug==='tradelocker'){
   const adapter=new TradeLockerAdapter({runtime:this.runtime,environment:execution.connection.provider_environment,connectionKey:execution.connection.id});const health=await adapter.validateConnection(execution.providerContext);if(health.status!=='connected')throw new ConnectorError(health.errorCode??'PROVIDER_AUTHENTICATION_FAILED');
   if(execution.operation.operation_type==='connection.rotate'){
    const prior=(await this.db.transaction(execution.scope,tx=>tx.query<{external_account_id:string}>(`SELECT external_account_id FROM brokerage_accounts WHERE ${scopeWhere()} AND connection_id=$5 AND external_account_id IS NOT NULL ORDER BY created_at LIMIT 1`,[...scopeValues(execution.scope),execution.connection.id]))).rows[0];if(prior)await adapter.trading.getAccount!(execution.providerContext,prior.external_account_id);
   }
  }else{
   const health=await stripeProvider(execution).getConnectionHealth();if(!health.charges_enabled)throw new AppError(422,'PROVIDER_CHARGES_UNAVAILABLE','The payment provider has not enabled payments.');providerReference=health.provider_account_reference;
   if(execution.connection.provider_account_reference&&providerReference!==execution.connection.provider_account_reference)throw new AppError(422,'PROVIDER_ACCOUNT_CHANGED','Rotated credentials must retain the connected provider account.');
  }
  const latency=Math.round(performance.now()-started);return {evidence:{provider:execution.connection.provider_slug,connector_version:'1.0.0',latency_ms:latency},apply:async tx=>{
   const rotate=execution.operation.operation_type==='connection.rotate';const newReference=rotate?execution.connection.candidate_credential_reference:execution.connection.credential_reference;
   await tx.query(`UPDATE brokerage_connections SET status='connected',credential_reference=$6,candidate_credential_reference=NULL,credential_revision=credential_revision+$7,connected_since=COALESCE(connected_since,now()),last_checked_at=now(),last_successful_request_at=now(),latency_ms=$8,error_code=NULL,provider_account_reference=COALESCE($9,provider_account_reference),updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(execution.scope),execution.connection.id,newReference,rotate?1:0,latency,providerReference??null]);
   if(rotate&&execution.connection.credential_reference)await tx.query('DELETE FROM credential_envelopes WHERE id=$1 AND organization_id=$2 AND provider_id=$3 AND product_instance_id=$4',[execution.connection.credential_reference,execution.scope.organizationId,execution.connection.provider_id,execution.scope.productInstanceId]);
   await tx.query('INSERT INTO connector_health_history(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,status,latency_ms,connector_version) VALUES($1,$2,$3,$4,$5,$6,\'connected\',$7,\'1.0.0\')',[randomUUID(),...scopeValues(execution.scope),execution.connection.id,latency]);
   await recordEvent(tx,execution.scope,rotate?'brokerage.connector.credentials_rotated':'brokerage.connector.validated','brokerage_connection',execution.connection.id,{status:'connected',provider:execution.connection.provider_slug});
  }};
 }
 async runOnce(id?:string):Promise<boolean>{
  const operation=await this.claim(id);if(!operation)return false;let execution:OperationExecution|undefined;
  try{
   execution=await this.execution(operation);
   const result=operation.operation_type.startsWith('connection.')?await this.validate(execution):operation.operation_type.startsWith('account.')?await executeTradingOperation(execution):await executePaymentOperation(execution);
   await this.db.transaction(execution.scope,async tx=>{
    // Lock the connection before its operation, matching disconnect/rotation.
    await tx.query(`SELECT id FROM brokerage_connections WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(execution!.scope),operation.connection_id]);
    const lease=(await tx.query(`SELECT id FROM connector_operations WHERE ${scopeWhere()} AND id=$5 AND state='running' AND lease_token=$6 AND lease_until>now() FOR UPDATE`,[...scopeValues(execution!.scope),operation.id,operation.lease_token])).rows[0];if(!lease)return;
    const current=await loadConnector(boundDatabase(tx),execution!.scope,operation.connection_id);
    if(['disabled','disconnected','suspended'].includes(current.status)||current.credential_revision!==operation.credential_revision)throw new AppError(409,'CONNECTOR_CREDENTIAL_CHANGED','Provider results require reconciliation after connection changes.');
    await result.apply(tx);
    await tx.query(`UPDATE connector_operations SET state='succeeded',provider_reference=COALESCE($6,provider_reference),provider_secondary_reference=COALESCE($7,provider_secondary_reference),safe_evidence=safe_evidence||$8::jsonb,completed_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL,reconciliation_state='matched',updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(execution!.scope),operation.id,result.provider_reference??null,result.secondary_reference??null,JSON.stringify(redactProviderMetadata(result.evidence))]);
    if(!operation.operation_type.startsWith('connection.'))await tx.query(`UPDATE brokerage_connections SET last_successful_request_at=now(),last_reconciliation_at=CASE WHEN $6 THEN now() ELSE last_reconciliation_at END,error_code=NULL,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(execution!.scope),current.id,operation.operation_type.endsWith('.sync')]);
   });
  }catch(error){await this.fail(operation,execution,error);}
  return true;
 }
 private async fail(operation:ExternalOperation,execution:OperationExecution|undefined,error:unknown){
  const safeCode=(error as {code?:string})?.code;const code=typeof safeCode==='string'&&/^[A-Z0-9_]{1,80}$/.test(safeCode)?safeCode:'EXTERNAL_OPERATION_FAILED';const retryable=error instanceof ConnectorError?error.retryable:error instanceof AppError&&[429,502,503].includes(error.statusCode);
  const ambiguous=error instanceof ConnectorError&&error.ambiguous;const reconcile=/RECONCIL|AMBIGUOUS|CREDENTIAL_CHANGED/.test(code)||ambiguous&&operation.attempt>=operation.max_attempts;
  const next=retryable&&operation.attempt<operation.max_attempts&&!reconcile?(ambiguous?'ambiguous':'retry_pending'):reconcile?'reconciliation_required':'failed';
  const wait=Math.max(error instanceof ConnectorError?error.retryAfterMs??0:0,Math.min(3600000,1000*2**Math.min(operation.attempt,12))*(.75+Math.random()*.5));
  await this.db.transaction({core:true},async tx=>{
   const connection=(await tx.query<{credential_reference:string|null;candidate_credential_reference:string|null;status:string}>('SELECT credential_reference,candidate_credential_reference,status FROM brokerage_connections WHERE id=$1 FOR UPDATE',[operation.connection_id])).rows[0];
   const owned=(await tx.query('SELECT id FROM connector_operations WHERE id=$1 AND state=\'running\' AND lease_token=$2 AND lease_until>now() FOR UPDATE',[operation.id,operation.lease_token])).rows[0];if(!owned)return;
   await tx.query('UPDATE connector_operations SET state=$3,last_error=$4,next_attempt_at=$5,lease_token=NULL,lease_until=NULL,reconciliation_state=$6,completed_at=CASE WHEN $3 IN(\'failed\',\'reconciliation_required\') THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 AND lease_token=$2',[operation.id,operation.lease_token,next,code,new Date(Date.now()+wait).toISOString(),reconcile?'manual_review':'pending']);
   if(!connection||['disconnected','disabled'].includes(connection.status))return;
   if(operation.operation_type==='connection.rotate'&&next==='failed'){
    await tx.query("UPDATE brokerage_connections SET candidate_credential_reference=NULL,error_code='ROTATION_VALIDATION_FAILED',last_checked_at=now() WHERE id=$1",[operation.connection_id]);if(connection.candidate_credential_reference)await tx.query('DELETE FROM credential_envelopes WHERE id=$1',[connection.candidate_credential_reference]);
   }else if(operation.operation_type.startsWith('connection.')||error instanceof ConnectorError){
    const health=code==='PROVIDER_AUTHENTICATION_FAILED'?'authentication_failed':next==='failed'?'unavailable':'degraded';await tx.query('UPDATE brokerage_connections SET status=$2,error_code=$3,last_checked_at=now(),updated_at=now() WHERE id=$1',[operation.connection_id,health,code]);
   }
   if(operation.operation_type.startsWith('connection.')||error instanceof ConnectorError)await tx.query('INSERT INTO connector_health_history(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,status,error_code,connector_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'1.0.0\')',[randomUUID(),operation.organization_id,operation.brand_id,operation.environment_id,operation.product_instance_id,operation.connection_id,operation.operation_type==='connection.rotate'&&next==='failed'&&connection.status==='connected'?'connected':code==='PROVIDER_AUTHENTICATION_FAILED'?'authentication_failed':'degraded',code]);
   if(next==='failed'&&operation.resource_type==='account')await tx.query("UPDATE brokerage_accounts SET status=CASE WHEN status IN('queued','provisioning','provider_pending') THEN 'failed' ELSE status END,failure_code=$2,updated_at=now() WHERE id=$1",[operation.resource_id,code]);
   if(next==='failed'&&operation.operation_type==='payment.create')await tx.query("UPDATE brokerage_payment_requests SET status=CASE WHEN status IN('provider_pending','pending') THEN 'failed' ELSE status END,last_reason=$2,updated_at=now() WHERE id=$1",[operation.resource_id,code]);
   if(reconcile)await tx.query('INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,\'ambiguous_operation\',$10,\'unknown\',\'manual_review\',\'reconcile_before_retry\',$11) ON CONFLICT DO NOTHING',[randomUUID(),operation.organization_id,operation.brand_id,operation.environment_id,operation.product_instance_id,operation.connection_id,operation.id,operation.resource_type,operation.resource_id,operation.state,operation.created_by]);
   if(execution)await recordEvent(tx,execution.scope,'brokerage.connector.operation_failed',operation.resource_type,operation.resource_id,{code,status:next,operation_type:operation.operation_type});
  });
 }
}
