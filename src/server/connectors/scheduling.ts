import type { Database } from '../db/database.js';
import type { TenantContext } from '../../shared/types.js';
import type { EventHandler,OutboxEvent } from '../domain/outbox-worker.js';
import { AppError } from '../domain/errors.js';
import { scopeValues,scopeWhere,recordEvent } from '../brokerage/common.js';
import { boundDatabase,enqueueOperation,loadConnector } from './connection-service.js';
import { ConnectorWorker } from './connector-worker.js';

function eventScope(event:OutboxEvent):TenantContext{
 const scope=event.payload.scope as Record<string,string>|undefined;const actor=event.payload.actor_id;
 if(!scope||Object.values(scope).some(value=>typeof value!=='string')||!scope.organization_id||!scope.brand_id||!scope.environment_id||!scope.product_instance_id||scope.organization_id!==event.organization_id)throw new AppError(422,'CONNECTOR_EVENT_SCOPE_INVALID','The event scope is invalid.');
 return {core:false,organizationId:scope.organization_id,brandId:scope.brand_id,environmentId:scope.environment_id,productInstanceId:scope.product_instance_id,productSlug:'brokerage-crm',userId:typeof actor==='string'?actor:'',requestId:`outbox_${event.id}`,permissions:[]};
}
async function dispatchRequest(db:Database,event:OutboxEvent,kind:'account'|'payment'){
 const scope=eventScope(event);const id=event.payload.resource_id;if(typeof id!=='string')throw new AppError(422,'CONNECTOR_EVENT_RESOURCE_INVALID','The event resource is invalid.');
 await db.transaction(scope,async tx=>{
  const resource=(await tx.query<{id:string;connection_id:string|null;created_by:string;status:string}>(kind==='account'?`SELECT id,connection_id,created_by,status FROM brokerage_accounts WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`:`SELECT r.id,m.connection_id,r.created_by,r.status FROM brokerage_payment_requests r JOIN brokerage_payment_methods m ON m.id=r.payment_method_id WHERE ${scopeWhere('r')} AND r.id=$5 AND r.kind='deposit' AND m.kind='provider' FOR UPDATE OF r`,[...scopeValues(scope),id])).rows[0];
  if(!resource||!resource.connection_id||!['requested','provider_pending','provisioning','pending'].includes(resource.status))return;
  const connection=await loadConnector(boundDatabase(tx),scope,resource.connection_id).catch(error=>{if(error instanceof AppError&&error.statusCode===404)return undefined;throw error;});if(!connection||connection.status!=='connected'||connection.provider_slug!==(kind==='account'?'tradelocker':'stripe'))return;
  scope.userId=resource.created_by;await enqueueOperation(tx,scope,connection,`${kind}.create`,kind,resource.id);
  if(kind==='account')await tx.query(`UPDATE brokerage_accounts SET status='queued',provisioning_mode='provider',sync_status='pending',failure_code=NULL,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),resource.id]);
  await recordEvent(tx,scope,`brokerage.connector.${kind}_queued`,kind,resource.id,{status:'queued'});
 });
}
export function connectorHandlers(db:Database,worker=new ConnectorWorker(db)):Record<string,EventHandler>{return {
 'connector.execute':async event=>{const id=event.payload.operation_id;if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw new AppError(422,'CONNECTOR_OPERATION_INVALID','The connector operation is invalid.');await worker.runOnce(id);},
 'brokerage.account.requested':event=>dispatchRequest(db,event,'account'),
 'brokerage.deposit.requested':event=>dispatchRequest(db,event,'payment'),
};}
/** Bounded periodic batches avoid making one unavailable provider monopolize scheduling. */
export async function scheduleConnectorReconciliation(db:Database):Promise<number>{return db.transaction({core:true},async tx=>{
 const candidates=(await tx.query<{id:string;resource_type:'account'|'payment';operation_type:string;connection_id:string;organization_id:string;brand_id:string;environment_id:string;product_instance_id:string;created_by:string}>(`WITH resources AS(
  SELECT a.id,'account' AS resource_type,CASE WHEN a.external_account_id IS NULL THEN 'account.create' ELSE 'account.sync' END AS operation_type,a.connection_id,a.organization_id,a.brand_id,a.environment_id,a.product_instance_id,a.created_by,a.created_at
  FROM brokerage_accounts a JOIN brokerage_connections c ON c.id=a.connection_id JOIN organizations o ON o.id=a.organization_id JOIN brands b ON b.id=a.brand_id JOIN environments e ON e.id=a.environment_id JOIN product_instances i ON i.id=a.product_instance_id
  WHERE c.connector_version IS NOT NULL AND c.provider_id=a.provider_id AND c.status IN('connected','degraded') AND o.status='active' AND b.status='active' AND e.status='active' AND i.status='active' AND (a.external_account_id IS NOT NULL OR a.status IN('requested','provider_pending','queued','provisioning'))
  UNION ALL
  SELECT p.id,'payment',CASE WHEN p.provider_payment_reference IS NULL THEN 'payment.create' ELSE 'payment.sync' END,m.connection_id,p.organization_id,p.brand_id,p.environment_id,p.product_instance_id,p.created_by,p.created_at
  FROM brokerage_payment_requests p JOIN brokerage_payment_methods m ON m.id=p.payment_method_id JOIN brokerage_connections c ON c.id=m.connection_id JOIN organizations o ON o.id=p.organization_id JOIN brands b ON b.id=p.brand_id JOIN environments e ON e.id=p.environment_id JOIN product_instances i ON i.id=p.product_instance_id
  WHERE p.kind='deposit' AND c.connector_version IS NOT NULL AND c.status IN('connected','degraded') AND o.status='active' AND b.status='active' AND e.status='active' AND i.status='active' AND (p.provider_payment_reference IS NOT NULL OR p.status='provider_pending')
 ), due AS(SELECT r.*,COALESCE((SELECT max(j.created_at) FROM connector_operations j WHERE j.resource_id=r.id AND j.connection_id=r.connection_id AND j.operation_type=r.operation_type),r.created_at) AS last_scheduled FROM resources r
  WHERE NOT EXISTS(SELECT 1 FROM connector_operations j WHERE j.resource_id=r.id AND j.connection_id=r.connection_id AND j.operation_type=r.operation_type AND (j.state IN('queued','running','retry_pending','ambiguous','reconciliation_required') OR j.created_at>now()-interval '5 minutes')))
 SELECT * FROM due ORDER BY last_scheduled,id LIMIT 40`)).rows;let queued=0;
 for(const candidate of candidates){const scope:TenantContext={core:false,organizationId:candidate.organization_id,brandId:candidate.brand_id,environmentId:candidate.environment_id,productInstanceId:candidate.product_instance_id,userId:candidate.created_by,productSlug:'brokerage-crm',requestId:'connector_reconciliation',permissions:[]};const connection=await loadConnector(boundDatabase(tx),scope,candidate.connection_id);await enqueueOperation(tx,scope,connection,candidate.operation_type,candidate.resource_type,candidate.id,{source:'reconciliation'});if(candidate.operation_type==='account.create')await tx.query("UPDATE brokerage_accounts SET status='queued',provisioning_mode='provider',sync_status='pending',failure_code=NULL WHERE id=$1 AND status IN('requested','provider_pending')",[candidate.id]);queued++;}return queued;
});}
