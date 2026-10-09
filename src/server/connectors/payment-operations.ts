import { createHash,randomUUID } from 'node:crypto';
import { AppError } from '../domain/errors.js';
import { recordEvent,scopeValues,scopeWhere } from '../brokerage/common.js';
import { ConnectorError } from './runtime.js';
import { StripePaymentProvider,stripeScopeFingerprint,type StripePayment,type StripeVerifiedEvent } from './stripe-payment.js';
import type { OperationExecution,OperationResult } from './types.js';

interface PaymentRecord {id:string;client_id:string;account_id:string;amount:string;currency:string;status:string;kind:string;provider_payment_reference:string|null;method_connection_id:string|null;method_provider_id:string|null;method_enabled:boolean;deposit_enabled:boolean;client_status:string;account_status:string;account_type:string;account_currency:string}
function decimal(value:string):bigint {if(!/^\d+(?:\.\d{1,8})?$/.test(value))throw new AppError(422,'PAYMENT_AMOUNT_INVALID','The payment amount is invalid.');const [whole,part='']=value.split('.');return BigInt(whole)*100000000n+BigInt(part.padEnd(8,'0'));}
function major(value:bigint):string{return `${value/100000000n}.${(value%100000000n).toString().padStart(8,'0')}`;}
export function stripeForExecution(execution:OperationExecution):StripePaymentProvider {
 const {connection,credentials,scope,origin,runtime}=execution;
 if(credentials.environment!==connection.provider_environment)throw new AppError(422,'PAYMENT_ENVIRONMENT_MISMATCH','Payment credentials must match the connection environment.');
 const returnUrl=`${origin}/portal/${scope.productInstanceId}/deposits?payment=${encodeURIComponent(execution.operation.resource_id)}`;
 return new StripePaymentProvider({secretKey:credentials.secret_key,webhookSecret:credentials.webhook_secret,environment:connection.provider_environment,successUrl:returnUrl,cancelUrl:returnUrl,runtime,connectionKey:connection.id,...(credentials.stripe_account_id?{stripeAccountId:credentials.stripe_account_id}:{})});
}
export async function executePaymentOperation(execution:OperationExecution):Promise<OperationResult>{
 const {db,scope,connection,operation}=execution;
 const binding=[['organization_id',scope.organizationId],['brand_id',scope.brandId],['environment_id',scope.environmentId],['product_instance_id',scope.productInstanceId]] as const;
 if(binding.some(([key,value])=>connection[key]!==value||operation[key]!==value)||operation.connection_id!==connection.id||operation.resource_type!=='payment'||operation.resource_id!==operation.payment_request_id||connection.provider_slug!=='stripe')throw new AppError(403,'PAYMENT_SCOPE_MISMATCH','This payment is unavailable in this workspace.');
 if(!['connected','degraded'].includes(connection.status))throw new AppError(409,'PAYMENT_CONNECTION_UNAVAILABLE','This payment connection is unavailable.');
 const provider=stripeForExecution(execution);
 const payment=(await db.transaction(scope,tx=>tx.query<PaymentRecord>(`SELECT p.id,p.client_id,p.account_id,p.amount::text,p.currency,p.status,p.kind,p.provider_payment_reference,m.connection_id AS method_connection_id,m.provider_id AS method_provider_id,m.enabled AS method_enabled,m.deposit_enabled,c.status AS client_status,a.status AS account_status,a.account_type,a.currency AS account_currency FROM brokerage_payment_requests p JOIN brokerage_payment_methods m ON m.id=p.payment_method_id JOIN brokerage_accounts a ON a.id=p.account_id AND a.client_id=p.client_id JOIN brokerage_clients c ON c.id=p.client_id WHERE ${scopeWhere('p')} AND p.id=$5`,[...scopeValues(scope),operation.resource_id]))).rows[0];
 if(!payment||payment.kind!=='deposit'||payment.method_connection_id!==connection.id||payment.method_provider_id!==connection.provider_id||payment.account_currency!==payment.currency||payment.account_type!=='live')throw new AppError(422,'PAYMENT_BINDING_MISMATCH','The payment does not belong to this provider and account.');
 let normalized:StripePayment;const reference=operation.provider_reference??payment.provider_payment_reference;
 if(operation.operation_type==='payment.create'){
  if(reference)normalized=await provider.getPayment(scope,reference);
  else{
   if(payment.client_status!=='active'||payment.account_status!=='active'||!payment.method_enabled||!payment.deposit_enabled||['cancelled','failed','rejected','completed','paid','reversed'].includes(payment.status))throw new AppError(422,'PAYMENT_REQUEST_INELIGIBLE','This deposit can no longer start a provider payment.');
   // created_at is durable. started_at can be overwritten on a later lease/retry.
   const started=Math.min(new Date(operation.started_at??operation.created_at).getTime(),new Date(operation.created_at).getTime());
   if(operation.attempt>1&&(!Number.isFinite(started)||Date.now()-started>=24*3600000))throw new ConnectorError('PAYMENT_CREATION_RECONCILIATION_REQUIRED',false,true);
   normalized=await provider.createPayment(scope,{request_id:payment.id,account_id:payment.account_id,amount:payment.amount,currency:payment.currency,idempotency_key:operation.provider_idempotency_key});
  }
 }else{
  if(!reference)throw new ConnectorError('PAYMENT_REFERENCE_RECONCILIATION_REQUIRED',false,true);
  if(operation.operation_type==='payment.cancel')normalized=await provider.cancelPayment(scope,{reference,idempotency_key:operation.provider_idempotency_key});
  else if(operation.operation_type==='payment.refund'){
   const amount=operation.safe_evidence.amount;if(typeof amount!=='string')throw new AppError(422,'PAYMENT_REFUND_AMOUNT_REQUIRED','An approved exact refund amount is required.');
   if(operation.attempt>1&&(!Number.isFinite(Date.parse(operation.created_at))||Date.now()-Date.parse(operation.created_at)>=24*3600000))throw new ConnectorError('PAYMENT_REFUND_RECONCILIATION_REQUIRED',false,true);
   const reason=typeof operation.safe_evidence.reason==='string'?operation.safe_evidence.reason:'requested_by_customer';
   normalized=await provider.refundPayment(scope,{reference,amount,reason,idempotency_key:operation.provider_idempotency_key,replay:operation.attempt>1});
  }else if(operation.operation_type==='payment.sync'){
   const hint=operation.safe_evidence.event_hint;
   if(hint&&typeof hint==='object'&&!Array.isArray(hint)){
    const event=hint as StripeVerifiedEvent;
    if(typeof event.provider_event_id!=='string'||typeof event.event_kind!=='string'||typeof event.reference!=='string'||typeof event.created_at!=='string'||!['checkout.session','payment_intent','charge','refund','dispute'].includes(event.object_kind))throw new AppError(422,'PAYMENT_EVENT_HINT_INVALID','The verified callback reference is invalid.');
    normalized=await provider.reconcileEvent(scope,event);
   }else normalized=await provider.getPayment(scope,reference);
  }
  else throw new AppError(422,'PROVIDER_CAPABILITY_UNAVAILABLE','This payment operation is unsupported.');
 }
 if(normalized.request_id!==payment.id||normalized.account_id!==payment.account_id||normalized.connection_key!==connection.id||normalized.scope_fingerprint!==stripeScopeFingerprint(scope)||normalized.currency!==payment.currency||decimal(normalized.amount)!==decimal(payment.amount)||(reference&&normalized.reference!==reference))throw new AppError(422,'PAYMENT_BINDING_MISMATCH','Provider payment amount, currency or ownership does not match the deposit.');
 if(operation.operation_type==='payment.sync'){
  const pending=(await db.transaction(scope,tx=>tx.query<{reference:string}>(`SELECT safe_evidence->'refund_operation'->>'reference' AS reference FROM connector_operations WHERE ${scopeWhere()} AND connection_id=$5 AND payment_request_id=$6 AND operation_type='payment.refund' AND COALESCE(safe_evidence->'refund_reconciliation'->>'status',safe_evidence->'refund_operation'->>'status') IN('pending','requires_action') ORDER BY safe_evidence->'refund_reconciliation'->>'checked_at' NULLS FIRST,created_at,id LIMIT 3`,[...scopeValues(scope),connection.id,payment.id]))).rows;
  const refunds=new Map(normalized.refund_operation?[[normalized.refund_operation.reference,normalized.refund_operation]]:[]);
  for(const item of pending)if(!refunds.has(item.reference))refunds.set(item.reference,await provider.getRefundStatus(scope,normalized,item.reference));
  if(refunds.size)normalized={...normalized,refund_operations:[...refunds.values()].sort((left,right)=>left.reference.localeCompare(right.reference))};
 }
 const fingerprint=createHash('sha256').update(JSON.stringify([normalized.reference,normalized.status,normalized.provider_status,normalized.amount,normalized.currency,normalized.refunded_amount,normalized.reversal,normalized.refund_operation??null,normalized.refund_operations??null,normalized.disputes??null])).digest('hex');
 const evidence={status:normalized.status,provider_status:normalized.provider_status,refunded_amount:normalized.refunded_amount,...(normalized.refund_operation?{refund_operation:normalized.refund_operation}:{}),...(normalized.refund_operations?{refund_operations:normalized.refund_operations}:{}),...(normalized.disputes?{disputes:normalized.disputes}:{}),source:operation.safe_evidence.source??(operation.operation_type==='payment.create'?'create':operation.operation_type==='payment.refund'?'refund':operation.operation_type==='payment.cancel'?'cancel':'reconciliation')};
 return {provider_reference:normalized.reference,...(normalized.provider_payment_intent_id?{secondary_reference:normalized.provider_payment_intent_id}:{}),evidence,apply:async tx=>{
  const current=(await tx.query<{status:string;provider_payment_reference:string|null;funding_status:string;amount:string;currency:string;client_id:string;account_id:string;connection_id:string|null;provider_id:string|null}>(`SELECT p.status,p.provider_payment_reference,p.funding_status,p.amount::text,p.currency,p.client_id,p.account_id,m.connection_id,m.provider_id FROM brokerage_payment_requests p JOIN brokerage_payment_methods m ON m.id=p.payment_method_id WHERE ${scopeWhere('p')} AND p.id=$5 FOR UPDATE OF p`,[...scopeValues(scope),payment.id])).rows[0];if(!current)throw new AppError(404,'PAYMENT_NOT_FOUND','This payment is unavailable.');
  if(current.account_id!==payment.account_id||current.client_id!==payment.client_id||current.currency!==payment.currency||decimal(current.amount)!==decimal(payment.amount)||current.connection_id!==connection.id||current.provider_id!==connection.provider_id)throw new AppError(422,'PAYMENT_BINDING_MISMATCH','The payment changed before its provider observation could be committed.');
  if(current.provider_payment_reference&&current.provider_payment_reference!==normalized.reference)throw new AppError(409,'PAYMENT_SESSION_SUBSTITUTION','The payment session was already assigned.');
  for(const refund of normalized.refund_operations??(normalized.refund_operation?[normalized.refund_operation]:[]))await tx.query(`UPDATE connector_operations SET safe_evidence=safe_evidence||jsonb_build_object('refund_reconciliation',$8::jsonb),updated_at=now() WHERE ${scopeWhere()} AND connection_id=$5 AND payment_request_id=$6 AND operation_type='payment.refund' AND safe_evidence->'refund_operation'->>'reference'=$7`,[...scopeValues(scope),connection.id,payment.id,refund.reference,JSON.stringify({...refund,checked_at:normalized.observed_at})]);
  const previousRefund=decimal((await tx.query<{refunded:string}>('SELECT COALESCE(max(refunded_amount),0)::text AS refunded FROM connector_payment_observations WHERE payment_request_id=$1 AND connection_id=$2',[payment.id,connection.id])).rows[0].refunded);
  const refundDelta=decimal(normalized.refunded_amount)-previousRefund;
  const newStatus=normalized.status==='created'?'provider_pending':normalized.status;
  const resolveMatched=async()=>{
   if(refundDelta<0n||(current.status==='cancelled'&&normalized.status!=='cancelled'))return;
   const resolved=(await tx.query<{id:string}>(`WITH matched AS(SELECT r.id FROM connector_reconciliations r LEFT JOIN connector_operations o ON o.id=r.operation_id WHERE ${scopeWhere('r')} AND r.connection_id=$5 AND r.resource_type='payment' AND r.resource_id=$6 AND r.status='open' AND r.kind IN('payment_mismatch','missing_callback','ambiguous_operation') AND r.decision<>'local_intent_preserved' AND r.action<>'financial_observation_review' AND (r.provider_reference IS NULL OR r.provider_reference=$7) AND (r.kind<>'ambiguous_operation' OR o.operation_type IN('payment.create','payment.sync') OR (o.operation_type='payment.cancel' AND $8='cancelled')) AND EXISTS(SELECT 1 FROM brokerage_payment_requests p JOIN brokerage_payment_methods m ON m.id=p.payment_method_id WHERE p.id=$6 AND p.status=$8 AND p.provider_payment_reference=$7 AND p.amount=$9::numeric AND p.currency=$10 AND m.connection_id=$5) ORDER BY r.created_at,r.id LIMIT 50 FOR UPDATE OF r) UPDATE connector_reconciliations r SET status='resolved',resolved_at=now() FROM matched WHERE r.id=matched.id RETURNING r.id`,[...scopeValues(scope),connection.id,payment.id,normalized.reference,newStatus,normalized.amount,normalized.currency])).rows;
   if(resolved.length)await recordEvent(tx,scope,'brokerage.payment.reconciliation_resolved','deposit',payment.id,{client_id:payment.client_id,status:newStatus,resolved_count:resolved.length,reconciliation_ids:resolved.map(row=>row.id)});
  };
  const source=['create','webhook','reconciliation','cancel','refund'].includes(String(evidence.source))?String(evidence.source):'reconciliation';
  const observation=(await tx.query<{id:string}>('INSERT INTO connector_payment_observations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,payment_request_id,provider_reference,provider_status,canonical_status,amount,currency,refunded_amount,evidence_fingerprint,source,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(connection_id,payment_request_id,evidence_fingerprint) DO NOTHING RETURNING id',[randomUUID(),...scopeValues(scope),connection.id,payment.id,normalized.reference,normalized.provider_status,normalized.status,normalized.amount,normalized.currency,normalized.refunded_amount,fingerprint,source,normalized.observed_at])).rows[0];if(!observation){await resolveMatched();return;}
  const disputeRestored=normalized.disputes?.length&&normalized.disputes.every(dispute=>['won','prevented','warning_closed'].includes(dispute.status));
  const terminal=['completed','paid','reversed'].includes(current.status);const cancelledIntent=current.status==='cancelled'&&!['completed','reversed'].includes(normalized.status);
  const stale=terminal&&!['completed','reversed'].includes(normalized.status)||current.status==='reversed'&&normalized.status==='completed'&&!disputeRestored||cancelledIntent;
  if(stale){
   await tx.query("UPDATE brokerage_payment_requests SET provider_payment_reference=COALESCE(provider_payment_reference,$1),payment_action_url=NULL,payment_action_expires_at=NULL WHERE id=$2",[normalized.reference,payment.id]);
   await tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,'payment_mismatch',$9,$10,'local_intent_preserved','stale_observation_ignored',$11,$12) ON CONFLICT DO NOTHING",[randomUUID(),...scopeValues(scope),connection.id,operation.id,payment.id,current.status,normalized.status,normalized.reference,scope.userId]);
   await recordEvent(tx,scope,'brokerage.payment.provider_observation_held','deposit',payment.id,{client_id:payment.client_id,status:current.status,provider_status:normalized.status,observation_id:observation.id});return;
  }
  const funding=normalized.reversal||refundDelta<0n||current.status==='cancelled'||current.funding_status==='review_required'||disputeRestored?'review_required':newStatus==='completed'?(current.funding_status==='credited'?'credited':'funding_pending'):newStatus==='reversed'?'review_required':'not_applicable';
  await tx.query(`UPDATE brokerage_payment_requests SET status=$6,provider_payment_reference=$7,external_reference=$7,payment_action_url=$8,payment_action_expires_at=$9,funding_status=$10,updated_at=now() WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),payment.id,newStatus,normalized.reference,normalized.action?.url??null,normalized.action?.expires_at??null,funding]);
  const transaction=async(kind:string,amount:string,status:string)=>tx.query('INSERT INTO brokerage_transactions(id,organization_id,brand_id,environment_id,product_instance_id,client_id,request_id,kind,amount,currency,status,account_id,reference,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[randomUUID(),...scopeValues(scope),payment.client_id,payment.id,kind,amount,payment.currency,status,payment.account_id,normalized.reference,scope.userId]);
  // Lost completion callbacks must not erase the original paid event when the
  // first authoritative receipt already contains a full refund or chargeback.
  if(newStatus==='completed'||(newStatus==='reversed'&&normalized.reversal)){
   const completed=(await tx.query("SELECT id FROM brokerage_transactions WHERE request_id=$1 AND kind='deposit' AND status='completed' LIMIT 1",[payment.id])).rows[0];
   if(!completed)await transaction('deposit',payment.amount,'completed');
  }
  if(refundDelta>0n)await transaction('refund',major(refundDelta),normalized.reversal??'refunded');
  const recordedChargeback=(await tx.query<{amount:string}>("SELECT COALESCE(sum(CASE WHEN status='chargeback' THEN amount WHEN status='chargeback_reinstated' THEN -amount ELSE 0 END),0)::text AS amount FROM brokerage_transactions WHERE request_id=$1",[payment.id])).rows[0].amount;
  const oldChargeback=decimal(recordedChargeback);const newChargeback=(normalized.disputes??[]).filter(dispute=>['needs_response','under_review','lost'].includes(dispute.status)).reduce((total,dispute)=>total+decimal(dispute.amount),0n);
  if(newChargeback>oldChargeback)await transaction('adjustment',major(newChargeback-oldChargeback),'chargeback');
  else if(newChargeback<oldChargeback&&normalized.disputes?.some(dispute=>['won','prevented','warning_closed'].includes(dispute.status)))await transaction('adjustment',major(oldChargeback-newChargeback),'chargeback_reinstated');
  if(newStatus!=='completed'&&current.status!==newStatus&&newStatus!=='reversed')await transaction('deposit',payment.amount,newStatus);
  if(refundDelta<0n||current.status==='cancelled')await tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,'payment_mismatch',$9,$10,'manual_review','financial_observation_review',$11,$12) ON CONFLICT DO NOTHING",[randomUUID(),...scopeValues(scope),connection.id,operation.id,payment.id,current.status,normalized.status,normalized.reference,scope.userId]);
  if(funding==='funding_pending')await tx.query("INSERT INTO connector_reconciliations(id,organization_id,brand_id,environment_id,product_instance_id,connection_id,operation_id,resource_type,resource_id,kind,local_state,provider_state,decision,action,provider_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'payment',$8,'funding_pending','unfunded','payment_completed','manual_review','external_funding_required',$9,$10) ON CONFLICT DO NOTHING",[randomUUID(),...scopeValues(scope),connection.id,operation.id,payment.id,normalized.reference,scope.userId]);
  await resolveMatched();
  await recordEvent(tx,scope,'brokerage.payment.provider_observed','deposit',payment.id,{client_id:payment.client_id,status:newStatus,funding_status:funding,observation_id:observation.id,...(normalized.refund_operations?{refunds:normalized.refund_operations}:normalized.refund_operation?{refunds:[normalized.refund_operation]}:{})});
 }};
}
