import { createHash,randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TenantContext } from '../../shared/types.js';
import type { Database } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { scopeValues,scopeWhere } from '../brokerage/common.js';
import { boundDatabase,connectorVault,enqueueOperation,loadConnector } from './connection-service.js';
import { connectorRuntime,stripeProvider } from './connector-worker.js';
import type { ConnectorRuntime } from './runtime.js';
import type { StripeVerifiedEvent } from './stripe-payment.js';

async function callbackContext(db:Database,id:string){
 const row=(await db.transaction({core:true},tx=>tx.query<{organization_id:string;brand_id:string;environment_id:string;product_instance_id:string;created_by:string}>("SELECT b.organization_id,b.brand_id,b.environment_id,b.product_instance_id,b.created_by FROM brokerage_connections b JOIN integration_providers p ON p.id=b.provider_id WHERE b.id=$1 AND p.slug='stripe' AND b.connector_version IS NOT NULL",[id]))).rows[0];
 if(!row)throw new AppError(404,'PROVIDER_CALLBACK_UNAVAILABLE','The provider callback is unavailable.');
 const scope:TenantContext={core:false,organizationId:row.organization_id,brandId:row.brand_id,environmentId:row.environment_id,productInstanceId:row.product_instance_id,productSlug:'brokerage-crm',userId:row.created_by,requestId:`callback_${randomUUID()}`,permissions:[]};
 const connection=await loadConnector(db,scope,id);if(!connection.credential_reference||['disabled','disconnected','suspended'].includes(connection.status))throw new AppError(409,'PROVIDER_CALLBACK_UNAVAILABLE','The provider connection is unavailable.');
 const credentials=await connectorVault(db,scope).read({organizationId:scope.organizationId,providerId:connection.provider_id,productInstanceId:scope.productInstanceId},connection.credential_reference);return {scope,connection,credentials};
}
export function registerProviderCallbacks(app:FastifyInstance,db:Database,origin:string,runtime=connectorRuntime){
 void app.register(async callbacks=>{
  callbacks.removeContentTypeParser('application/json');callbacks.addContentTypeParser('application/json',{parseAs:'buffer',bodyLimit:1024*1024},(_req,body,done)=>done(null,body));
  callbacks.post('/api/v1/provider-callbacks/stripe/:connectionId',{bodyLimit:1024*1024},async(request,reply)=>{
   const {connectionId}=z.object({connectionId:z.uuid()}).parse(request.params);const {scope,connection,credentials}=await callbackContext(db,connectionId);
   if(!Buffer.isBuffer(request.body))throw new AppError(415,'PROVIDER_CALLBACK_CONTENT_TYPE','Callbacks require the original JSON bytes.');
   const signature=request.headers['stripe-signature'];if(typeof signature!=='string')throw new AppError(400,'PAYMENT_WEBHOOK_SIGNATURE_REQUIRED','The provider signature is required.');
   const hint=stripeProvider({connection,credentials,runtime,origin}).verifyWebhook(scope,{body:request.body,signature,received_at:new Date().toISOString()});
   const hash=createHash('sha256').update(request.body).digest('hex');
   const accepted=await db.transaction(scope,async tx=>{
    const existing=(await tx.query<{id:string;body_sha256:string;state:string}>('SELECT id,body_sha256,state FROM connector_event_receipts WHERE connection_id=$1 AND provider_event_id=$2 FOR UPDATE',[connection.id,hint.provider_event_id])).rows[0];
    if(existing){if(existing.body_sha256!==hash)throw new AppError(409,'PROVIDER_EVENT_COLLISION','This event identifier already has different verified evidence.');return {id:existing.id,duplicate:true};}
    const id=randomUUID();await tx.query('INSERT INTO connector_event_receipts(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,provider,provider_event_id,event_type,provider_reference,body_sha256,safe_hint) VALUES($1,$2,$3,$4,$5,$6,\'stripe\',$7,$8,$9,$10,$11::jsonb)',[id,...scopeValues(scope),connection.id,hint.provider_event_id,hint.event_kind,hint.reference,hash,JSON.stringify(hint)]);
    await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,\'connector.callback\',$3::jsonb)',[randomUUID(),scope.organizationId,JSON.stringify({receipt_id:id,scope:{organization_id:scope.organizationId,brand_id:scope.brandId,environment_id:scope.environmentId,product_instance_id:scope.productInstanceId}})]);
    await tx.query(`UPDATE brokerage_connections SET last_event_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),connection.id]);return {id,duplicate:false};
   });reply.code(accepted.duplicate?200:202);return {received:true,duplicate:accepted.duplicate};
  });
 });
}
export async function processVerifiedCallback(db:Database,id:string,origin=process.env.APP_ORIGIN??'http://127.0.0.1:5173',runtime:ConnectorRuntime=connectorRuntime){
 const receipt=(await db.transaction({core:true},tx=>tx.query<{connection_id:string;safe_hint:StripeVerifiedEvent;state:string;organization_id:string;brand_id:string;environment_id:string;product_instance_id:string}>('SELECT connection_id,safe_hint,state,organization_id,brand_id,environment_id,product_instance_id FROM connector_event_receipts WHERE id=$1',[id]))).rows[0];
 if(!receipt||receipt.state==='processed'||receipt.state==='ignored')return;
 const {scope,connection,credentials}=await callbackContext(db,receipt.connection_id);
 if([receipt.organization_id,receipt.brand_id,receipt.environment_id,receipt.product_instance_id].join(':')!==scopeValues(scope).join(':'))throw new AppError(403,'PROVIDER_CALLBACK_SCOPE_INVALID','The callback scope is invalid.');
 try{
  const normalized=await stripeProvider({connection,credentials,runtime,origin}).reconcileEvent(scope,receipt.safe_hint);
  await db.transaction(scope,async tx=>{
   await tx.query(`SELECT id FROM brokerage_connections WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),connection.id]);
   const payment=(await tx.query<{id:string;account_id:string;connection_id:string;provider_payment_reference:string|null}>(`SELECT r.id,r.account_id,m.connection_id,r.provider_payment_reference FROM brokerage_payment_requests r JOIN brokerage_payment_methods m ON m.id=r.payment_method_id WHERE ${scopeWhere('r')} AND r.id=$5 AND r.kind='deposit' FOR UPDATE OF r`,[...scopeValues(scope),normalized.request_id])).rows[0];
   if(!payment||payment.connection_id!==connection.id||payment.account_id!==normalized.account_id||(payment.provider_payment_reference&&payment.provider_payment_reference!==normalized.reference))throw new AppError(422,'PAYMENT_BINDING_MISMATCH','This provider payment does not match a brokerage request.');
   const current=await loadConnector(boundDatabase(tx),scope,connection.id);if(current.credential_revision!==connection.credential_revision||!current.credential_reference)throw new AppError(409,'CONNECTOR_CREDENTIAL_CHANGED','Retry callback reconciliation after connection changes.');
   const operation=await enqueueOperation(tx,scope,current,'payment.sync','payment',payment.id,{source:'webhook',receipt_id:id,event_hint:receipt.safe_hint});
   await tx.query(`UPDATE connector_operations SET provider_reference=COALESCE(provider_reference,$6) WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),operation,normalized.reference]);
   await tx.query(`UPDATE connector_event_receipts SET state='processed',processed_at=now(),last_error=NULL WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),id]);
  });
 }catch(error){const code=(error as {code?:string}).code;await db.transaction(scope,tx=>tx.query(`UPDATE connector_event_receipts SET state='failed',last_error=$6 WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),id,typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code)?code:'CALLBACK_RECONCILIATION_FAILED']));throw error;}
}
