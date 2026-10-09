import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TenantContext } from '../../shared/types.js';
import type { Database,Executor } from '../db/database.js';
import { AesCredentialVault,type CredentialStore,type EncryptedCredential } from '../domain/vault.js';
import { AppError } from '../domain/errors.js';
import { credentialSchema } from '../brokerage/accounts.js';
import { recordEvent,scopeValues,scopeWhere } from '../brokerage/common.js';
import type { ConnectorConnection } from './types.js';

export const implementedProviders=['tradelocker','stripe'] as const;
export const connectorConnectionSchema=z.object({provider:z.enum(implementedProviders),label:z.string().trim().min(1).max(120),environment:z.enum(['sandbox','demo','production']).default('sandbox'),credentials:credentialSchema.optional()}).strict();
export const connectionCapabilities={tradelocker:['account.create','account.read','account.enable','account.disable','account.group.set','balance.read','equity.read','margin.read','orders.read','positions.read','trades.read','account.sync'],stripe:['payment.create','payment.read','payment.cancel','payment.refund','payment.webhook','payment.reconcile','payment.settlement.read']} as const;

export function connectorVault(db:Database,scope:TenantContext,key=process.env.SECRET_ENCRYPTION_KEY){
  const store:CredentialStore={put:async(id,envelope,binding)=>{await db.transaction(scope,tx=>tx.query('INSERT INTO credential_envelopes(id,organization_id,provider_id,product_instance_id,envelope) VALUES($1,$2,$3,$4,$5::jsonb)',[id,binding.organizationId,binding.providerId,binding.productInstanceId,JSON.stringify(envelope)]));},get:async(id,binding)=>(await db.transaction(scope,tx=>tx.query<{envelope:EncryptedCredential}>('SELECT envelope FROM credential_envelopes WHERE id=$1 AND organization_id=$2 AND provider_id=$3 AND product_instance_id=$4',[id,binding.organizationId,binding.providerId,binding.productInstanceId]))).rows[0]?.envelope};
  return new AesCredentialVault(store,key?Buffer.from(key,'base64'):undefined);
}
export function boundDatabase(tx:Executor):Database{return {query:tx.query,transaction:async(_scope,work)=>work(tx),close:async()=>{}};}
export async function loadConnector(db:Database,scope:TenantContext,id:string):Promise<ConnectorConnection>{
 const row=(await db.transaction(scope,tx=>tx.query<ConnectorConnection>(`SELECT b.*,p.slug AS provider_slug FROM brokerage_connections b JOIN integration_providers p ON p.id=b.provider_id WHERE ${scopeWhere('b')} AND b.id=$5`,[...scopeValues(scope),id]))).rows[0];
 if(!row||!implementedProviders.includes(row.provider_slug as typeof implementedProviders[number]))throw new AppError(404,'CONNECTOR_NOT_FOUND','The connector is unavailable in this workspace.');return row;
}
export async function enqueueOperation(tx:Executor,scope:TenantContext,connection:ConnectorConnection,type:string,resource:'connection'|'account'|'payment',id:string,evidence:Record<string,unknown>={}):Promise<string>{
 const existing=(await tx.query<{id:string;safe_evidence:Record<string,unknown>}>(`SELECT id,safe_evidence FROM connector_operations WHERE ${scopeWhere()} AND connection_id=$5 AND operation_type=$6 AND resource_id=$7 AND state IN('queued','running','retry_pending','ambiguous','reconciliation_required')`,[...scopeValues(scope),connection.id,type,id])).rows[0];if(existing){
  const amount=(value:unknown)=>{if(typeof value!=='string'||!/^\d+(?:\.\d{1,8})?$/.test(value))return '';const [whole,fraction='']=value.split('.');return `${BigInt(whole)}.${fraction.padEnd(8,'0')}`;};
  if(type==='payment.refund'&&(amount(existing.safe_evidence.amount)!==amount(evidence.amount)||existing.safe_evidence.reason!==evidence.reason))throw new AppError(409,'REFUND_ALREADY_PENDING','A different refund is already waiting for this payment. Complete or reconcile it first.');return existing.id;
 }
 const operationId=randomUUID();await tx.query('INSERT INTO connector_operations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_type,resource_type,resource_id,account_id,payment_request_id,provider_idempotency_key,credential_revision,safe_evidence,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)',[operationId,...scopeValues(scope),connection.id,type,resource,id,resource==='account'?id:null,resource==='payment'?id:null,randomUUID(),connection.credential_revision,JSON.stringify(evidence),scope.userId]);
 await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)',[randomUUID(),scope.organizationId,'connector.execute',JSON.stringify({operation_id:operationId,scope:{organization_id:scope.organizationId,brand_id:scope.brandId,environment_id:scope.environmentId,product_instance_id:scope.productInstanceId}})]);return operationId;
}
export class ConnectorConnectionService {
 constructor(private db:Database){}
 /** Only shipped adapters can install a shared catalog descriptor. No tenant supplied SQL/config. */
 async prepareProvider(slug:typeof implementedProviders[number]){
  if(!implementedProviders.includes(slug))throw new AppError(422,'CONNECTOR_UNSUPPORTED','Choose an implemented connector.');
  return this.db.transaction({core:true},async tx=>{
   const id=randomUUID();const row=(await tx.query<{id:string}>("INSERT INTO integration_providers(id,slug,name,category,description,status,connection_mode,supported_products,managed,connector_available) VALUES($1,$2,$3,$4,$5,'active','api_key','[\"brokerage-crm\",\"api\"]'::jsonb,false,true) ON CONFLICT(slug) DO UPDATE SET connector_available=true,status='active',connection_mode='api_key' RETURNING id",[id,slug,slug==='stripe'?'Stripe':'TradeLocker',slug==='stripe'?'payments':'trading_platform','Implemented external connector. Connection health requires validation.'])).rows[0];
   for(const capability of connectionCapabilities[slug])await tx.query('INSERT INTO integration_provider_capabilities(provider_id,capability) VALUES($1,$2) ON CONFLICT DO NOTHING',[row.id,capability]);return row.id;
  });
 }
 private credentialEnvironment(value:Record<string,string>,environment:string){if(value.environment!==environment)throw new AppError(422,'CONNECTOR_ENVIRONMENT_MISMATCH','Credential environment must match the selected connection environment.');}
 async create(scope:TenantContext,value:unknown){const input=connectorConnectionSchema.parse(value);if(input.credentials)this.credentialEnvironment(input.credentials,input.environment);
  return this.db.transaction(scope,async tx=>{
   const provider=(await tx.query<{id:string}>('SELECT id FROM integration_providers WHERE slug=$1 AND connector_available=true',[input.provider])).rows[0];if(!provider)throw new AppError(422,'CONNECTOR_NOT_INSTALLED','Select an installed connector.');
   const reference=input.credentials?await connectorVault(boundDatabase(tx),scope).store({organizationId:scope.organizationId,providerId:provider.id,productInstanceId:scope.productInstanceId},input.credentials):null;
   const id=randomUUID();await tx.query('INSERT INTO brokerage_connections(id,organization_id,brand_id,environment_id,product_instance_id,provider_id,label,status,provider_environment,connector_version,capabilities,credential_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)',[id,...scopeValues(scope),provider.id,input.label,reference?'validating':'draft',input.environment,'1.0.0',JSON.stringify(connectionCapabilities[input.provider]),reference,scope.userId]);
   const connection=await loadConnector(boundDatabase(tx),scope,id);if(reference)await enqueueOperation(tx,scope,connection,'connection.validate','connection',id);
   await recordEvent(tx,scope,'brokerage.connector.created','brokerage_connection',id,{provider:input.provider,status:connection.status,environment:input.environment});return this.safe(connection);
  });
 }
 safe(row:ConnectorConnection){return {id:row.id,provider:row.provider_slug,label:row.label,status:row.status,environment:row.provider_environment,connector_version:row.connector_version,capabilities:row.capabilities,credentials_configured:Boolean(row.credential_reference),rotation_pending:Boolean(row.candidate_credential_reference)};}
 async list(scope:TenantContext,limit=20,offset=0,search='',status?:string,provider?:string){
  return this.db.transaction(scope,async tx=>{
   const filter=`${scopeWhere('b')} AND p.slug IN('tradelocker','stripe') AND b.connector_version IS NOT NULL AND (b.label ILIKE $5 OR p.name ILIKE $5) AND ($6::text IS NULL OR b.status=$6) AND ($7::text IS NULL OR p.slug=$7)`;const args=[...scopeValues(scope),`%${search}%`,status||null,provider??null];
   const data=(await tx.query(`SELECT b.id,b.label,b.status,b.provider_environment AS environment,b.connector_version,b.capabilities,b.connected_since,b.last_checked_at,b.last_successful_request_at,b.last_event_at,b.last_reconciliation_at,b.latency_ms,b.error_code,(b.credential_reference IS NOT NULL) AS credentials_configured,(b.candidate_credential_reference IS NOT NULL) AS rotation_pending,p.slug AS provider,p.name AS provider_name FROM brokerage_connections b JOIN integration_providers p ON p.id=b.provider_id WHERE ${filter} ORDER BY b.created_at DESC,b.id LIMIT $8 OFFSET $9`,[...args,limit,offset])).rows;const total=Number((await tx.query<{total:string}>(`SELECT count(*) AS total FROM brokerage_connections b JOIN integration_providers p ON p.id=b.provider_id WHERE ${filter}`,args)).rows[0].total);return {data,pagination:{total,limit,offset}};
  });
 }
 async test(scope:TenantContext,id:string){return this.db.transaction(scope,async tx=>{const row=await loadConnector(boundDatabase(tx),scope,id);if(!row.credential_reference||['disabled','disconnected','suspended'].includes(row.status))throw new AppError(409,'CONNECTOR_NOT_ACTIONABLE','Configure an enabled connection before testing.');const operation=await enqueueOperation(tx,scope,row,'connection.validate','connection',id);await recordEvent(tx,scope,'brokerage.connector.test_requested','brokerage_connection',id,{});return {operation_id:operation,status:'queued'};});}
 async rotate(scope:TenantContext,id:string,value:unknown){const credentials=credentialSchema.parse(value);return this.db.transaction(scope,async tx=>{
  await tx.query(`SELECT id FROM brokerage_connections WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),id]);const connection=await loadConnector(boundDatabase(tx),scope,id);this.credentialEnvironment(credentials,connection.provider_environment);
  if(['disabled','disconnected','suspended'].includes(connection.status))throw new AppError(409,'CONNECTOR_NOT_ACTIONABLE','Create a new connection after disconnecting.');if(connection.candidate_credential_reference)throw new AppError(409,'ROTATION_IN_PROGRESS','Credential validation is already in progress.');
  const candidate=await connectorVault(boundDatabase(tx),scope).store({organizationId:scope.organizationId,providerId:connection.provider_id,productInstanceId:scope.productInstanceId},credentials);await tx.query(`UPDATE brokerage_connections SET candidate_credential_reference=$6,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),id,candidate]);await enqueueOperation(tx,scope,connection,'connection.rotate','connection',id);await recordEvent(tx,scope,'brokerage.connector.rotation_requested','brokerage_connection',id,{});return {status:'validation_pending',previous_configuration_preserved:true};
 });}
 async disconnect(scope:TenantContext,id:string){return this.db.transaction(scope,async tx=>{
  await tx.query(`SELECT id FROM brokerage_connections WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),id]);const connection=await loadConnector(boundDatabase(tx),scope,id);
  await tx.query(`UPDATE brokerage_connections SET status='disconnected',credential_reference=NULL,candidate_credential_reference=NULL,credential_revision=credential_revision+1,error_code=NULL,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),id]);
  await tx.query(`UPDATE connector_operations SET state='cancelled',completed_at=now(),lease_token=NULL,lease_until=NULL WHERE ${scopeWhere()} AND connection_id=$5 AND state NOT IN('succeeded','failed','cancelled')`,[...scopeValues(scope),id]);
  for(const reference of [connection.credential_reference,connection.candidate_credential_reference])if(reference)await tx.query('DELETE FROM credential_envelopes WHERE id=$1 AND organization_id=$2 AND provider_id=$3 AND product_instance_id=$4',[reference,scope.organizationId,connection.provider_id,scope.productInstanceId]);await recordEvent(tx,scope,'brokerage.connector.disconnected','brokerage_connection',id,{});return {status:'disconnected'};
 });}
}
