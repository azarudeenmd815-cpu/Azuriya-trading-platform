import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import type { TenantContext } from '../../shared/types.js';
import type { PaymentIntent,PaymentProvider } from '../brokerage/providers.js';
import { AppError } from '../domain/errors.js';
import { stripeCurrencies,stripeInteger,stripeMajorUnits,stripeMinorUnits } from './exact-money.js';

export const stripeConnectorVersion='1.0.0';
export const stripeApiVersion='2025-06-30.basil';
export interface StripeTransport {
  request(input:{provider:string;connectionKey:string;environment:'sandbox'|'demo'|'production';operation:string;method:'GET'|'POST';url:string;headers?:Record<string,string>;body?:string;idempotent?:boolean;maxResponseBytes?:number}):Promise<{status:number;body:string;headers:Headers;latencyMs:number}>;
}
export interface StripePaymentConfiguration {
  secretKey:string;webhookSecret:string;environment:'sandbox'|'demo'|'production';successUrl:string;cancelUrl:string;
  runtime:StripeTransport;connectionKey:string;stripeAccountId?:string;now?:()=>number;
}
export interface StripeRefundObservation {reference:string;status:'pending'|'requires_action'|'succeeded'|'failed'|'canceled';amount:string}
export interface StripePayment extends PaymentIntent {
  provider:'stripe';connector_version:string;provider_status:string;request_id:string;connection_key:string;scope_fingerprint:string;account_id?:string;
  provider_payment_intent_id?:string;provider_charge_id?:string;refunded_amount:string;reversal:'partially_refunded'|'refunded'|'chargeback'|null;
  disputes?:Array<{reference:string;status:string;amount:string}>;
  refund_operation?:StripeRefundObservation;
  refund_operations?:StripeRefundObservation[];
  settlement?:{reference:string;status:'pending'|'available';currency:string;gross:string;fee:string;net:string;available_on:string};
}
export interface StripeVerifiedEvent {
  provider_event_id:string;event_kind:string;created_at:string;reference:string;
  object_kind:'checkout.session'|'payment_intent'|'charge'|'refund'|'dispute';
  provider_payment_intent_id?:string;provider_charge_id?:string;request_id?:string;connection_key?:string;scope_fingerprint?:string;account_id?:string;
}
type Json=Record<string,unknown>;
function object(value:unknown):Json {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The provider returned an invalid payment response.');
  return value as Json;
}
function providerReference(value:unknown,prefix:string):string {
  if(typeof value!=='string'||!new RegExp(`^${prefix}_[A-Za-z0-9_]{1,190}$`).test(value))throw new AppError(422,'PAYMENT_REFERENCE_INVALID','The provider reference is invalid.');
  return value;
}
function disputeReference(value:unknown):string {
  if(typeof value!=='string'||! /^(?:du|dp)_[A-Za-z0-9_]{1,190}$/.test(value))throw new AppError(422,'PAYMENT_REFERENCE_INVALID','The provider dispute reference is invalid.');
  return value;
}
function bindingFailure():never {throw new AppError(422,'PAYMENT_BINDING_MISMATCH','The payment does not authenticate for this connection, scope or request.');}
function safeId(value:unknown):string {
  if(typeof value!=='string'||value.length<1||value.length>200||!/^[A-Za-z0-9_.:-]+$/.test(value))throw new AppError(422,'PAYMENT_REFERENCE_INVALID','The payment request reference is invalid.');
  return value;
}
function seconds(value:unknown):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>253402300799)throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The provider timestamp is invalid.');
  return value;
}
export function stripeScopeFingerprint(scope:TenantContext):string {
  const binding=[scope.organizationId,scope.brandId,scope.environmentId,scope.productInstanceId];
  if(binding.some(value=>typeof value!=='string'||!value))throw new AppError(403,'PAYMENT_SCOPE_REQUIRED','Payments require a complete authorized brokerage scope.');
  return createHash('sha256').update(JSON.stringify(binding)).digest('hex');
}
export class StripePaymentProvider implements PaymentProvider {
  readonly slug='stripe';readonly available=true;
  readonly connectorVersion=stripeConnectorVersion;
  readonly capabilities=Object.freeze({'payment.create':true,'payment.read':true,'payment.cancel':true,'payment.refund':true,'payment.webhook':true,'payment.reconcile':true,'payment.settlement.read':true,'payout.create':false,'balance.adjust':false});
  readonly acceptedCurrencies=Object.keys(stripeCurrencies);
  private readonly now:()=>number;
  constructor(private readonly configuration:StripePaymentConfiguration) {
    this.now=configuration.now??Date.now;
    const mode=configuration.environment==='production'?'live':'test';
    if(!new RegExp(`^(?:sk|rk)_${mode}_[A-Za-z0-9_]+$`).test(configuration.secretKey)||!/^whsec_[A-Za-z0-9_]+$/.test(configuration.webhookSecret))throw new AppError(422,'PAYMENT_CREDENTIAL_INVALID','Configure the payment API key and signing secret for the selected environment.');
    safeId(configuration.connectionKey);
    if(configuration.stripeAccountId)providerReference(configuration.stripeAccountId,'acct');
    for(const value of [configuration.successUrl,configuration.cancelUrl]){
      let url:URL;try{url=new URL(value);}catch{throw new AppError(422,'PAYMENT_RETURN_URL_INVALID','Configure a valid payment return URL.');}
      const localTest=mode==='test'&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
      if((url.protocol!=='https:'&&!localTest)||url.username||url.password||url.hash)throw new AppError(422,'PAYMENT_RETURN_URL_INVALID','Payment return URLs require HTTPS.');
    }
  }
  private mode(value:unknown) {if(value!==(this.configuration.environment==='production'))bindingFailure();}
  private metadata(scope:TenantContext,value:unknown):{request:string;account?:string} {
    const metadata=object(value);
    if(metadata.azuriya_scope!==stripeScopeFingerprint(scope)||metadata.azuriya_connection!==this.configuration.connectionKey)bindingFailure();
    return {request:safeId(metadata.azuriya_request),...(metadata.azuriya_account?{account:safeId(metadata.azuriya_account)}:{})};
  }
  private async request(method:'GET'|'POST',path:string,operation:string,form?:URLSearchParams,key?:string):Promise<Json> {
    const headers:Record<string,string>={Authorization:`Bearer ${this.configuration.secretKey}`,'Stripe-Version':stripeApiVersion};
    if(this.configuration.stripeAccountId)headers['Stripe-Account']=this.configuration.stripeAccountId;
    if(method==='POST'){
      if(!key||key.length>255||! /^[A-Za-z0-9_.:-]{8,255}$/.test(key))throw new AppError(422,'PAYMENT_IDEMPOTENCY_REQUIRED','A durable operation idempotency key is required.');
      headers['Idempotency-Key']=key;headers['Content-Type']='application/x-www-form-urlencoded';
    }
    const response=await this.configuration.runtime.request({provider:this.slug,connectionKey:this.configuration.connectionKey,environment:this.configuration.environment,operation,method,url:`https://api.stripe.com/v1/${path}`,headers,...(form?{body:form.toString()}:{}),idempotent:method==='GET'||Boolean(key),maxResponseBytes:1048576});
    if(response.status<200||response.status>=300)throw new AppError(502,'PAYMENT_PROVIDER_REJECTED','The payment provider rejected the operation.');
    try{return object(JSON.parse(response.body));}catch(error){if(error instanceof AppError)throw error;throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The provider returned an invalid payment response.');}
  }
  private async session(scope:TenantContext,reference:string):Promise<Json> {
    providerReference(reference,'cs');
    const value=await this.request('GET',`checkout/sessions/${encodeURIComponent(reference)}?expand%5B%5D=payment_intent.latest_charge.balance_transaction`,'payment.read');
    if(value.id!==reference)bindingFailure();this.validateSession(scope,value);
    if(typeof value.payment_intent==='string'){
      const intentReference=providerReference(value.payment_intent,'pi');
      const intent=await this.request('GET',`payment_intents/${encodeURIComponent(intentReference)}?expand%5B%5D=latest_charge.balance_transaction`,'payment.read');
      if(intent.id!==intentReference)bindingFailure();value.payment_intent=intent;
    }
    if(value.payment_intent&&typeof value.payment_intent==='object'){
      const intent=object(value.payment_intent);const charge=intent.latest_charge&&typeof intent.latest_charge==='object'?object(intent.latest_charge):undefined;
      if(charge?.disputed===true){
        const disputes=await this.request('GET',`disputes?payment_intent=${encodeURIComponent(providerReference(intent.id,'pi'))}&limit=100`,'payment.reconcile');
        if(!Array.isArray(disputes.data)||disputes.data.length===0||disputes.has_more!==false)throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The dispute evidence is incomplete.');
        value._azuriya_disputes=disputes.data;
      }
    }
    return value;
  }
  private validateSession(scope:TenantContext,value:Json) {
    if(value.object!=='checkout.session'||value.mode!=='payment')bindingFailure();this.mode(value.livemode);
    const binding=this.metadata(scope,value.metadata);if(value.client_reference_id!==binding.request)bindingFailure();
    providerReference(value.id,'cs');
    return binding;
  }
  private normalize(scope:TenantContext,value:Json):StripePayment {
    const binding=this.validateSession(scope,value);const currency=String(value.currency).toUpperCase();const amount=stripeMajorUnits(value.amount_total,currency);
    const original=stripeInteger(value.amount_total);if(original<=0n)bindingFailure();
    let status:PaymentIntent['status']=value.payment_status==='paid'?'completed':value.status==='expired'?'cancelled':value.status==='complete'?'processing':'requires_action';
    let refunded=0n;let reversal:StripePayment['reversal']=null;let intentId:string|undefined;let chargeId:string|undefined;let settlement:StripePayment['settlement'];let disputes:StripePayment['disputes'];
    if(value.payment_intent&&typeof value.payment_intent==='object'){
      const intent=object(value.payment_intent);intentId=providerReference(intent.id,'pi');this.mode(intent.livemode);
      const intentBinding=this.metadata(scope,intent.metadata);
      if(intentBinding.request!==binding.request||intentBinding.account!==binding.account||String(intent.currency).toUpperCase()!==currency||stripeInteger(intent.amount)!==original)bindingFailure();
      if(status==='completed'&&(intent.status!=='succeeded'||(intent.amount_received!==undefined&&stripeInteger(intent.amount_received)!==original)))bindingFailure();
      if(status!=='completed'&&intent.status==='canceled')status='cancelled';
      else if(status==='processing'&&intent.status==='requires_payment_method')status='failed';
      if(intent.latest_charge&&typeof intent.latest_charge==='object'){
        const charge=object(intent.latest_charge);chargeId=providerReference(charge.id,'ch');this.mode(charge.livemode);
        const chargeIntent=typeof charge.payment_intent==='object'?object(charge.payment_intent).id:charge.payment_intent;
        if(chargeIntent!==intentId||String(charge.currency).toUpperCase()!==currency||stripeInteger(charge.amount)!==original||(status==='completed'&&charge.paid!==true))bindingFailure();
        if(status==='completed'&&charge.amount_captured!==undefined&&stripeInteger(charge.amount_captured)!==original)bindingFailure();
        refunded=stripeInteger(charge.amount_refunded);if(refunded>original)bindingFailure();
        if(charge.disputed===true){
          if(!Array.isArray(value._azuriya_disputes))throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The dispute evidence is incomplete.');
          disputes=value._azuriya_disputes.map(item=>{
            const dispute=object(item);this.mode(dispute.livemode);
            // Stripe documents dispute amounts can exceed the original charge
            // through currency fluctuation. The original deposit stays exact;
            // the separately authenticated dispute retains its actual amount.
            if(dispute.object!=='dispute'||dispute.payment_intent!==intentId||dispute.charge!==chargeId||String(dispute.currency).toUpperCase()!==currency||stripeInteger(dispute.amount)<=0n||!['warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost','prevented'].includes(String(dispute.status)))bindingFailure();
            return {reference:disputeReference(dispute.id),status:String(dispute.status),amount:stripeMajorUnits(dispute.amount,currency)};
          });
          if(new Set(disputes.map(dispute=>dispute.reference)).size!==disputes.length)bindingFailure();
          disputes.sort((left,right)=>left.reference.localeCompare(right.reference));
          if(disputes.some(dispute=>['needs_response','under_review','lost'].includes(dispute.status))){status='reversed';reversal='chargeback';}
        }
        if(!reversal&&refunded===original){status='reversed';reversal='refunded';}
        else if(!reversal&&refunded>0n)reversal='partially_refunded';
        if(reversal&&(intent.status!=='succeeded'||charge.paid!==true||(intent.amount_received!==undefined&&stripeInteger(intent.amount_received)!==original)||(charge.amount_captured!==undefined&&stripeInteger(charge.amount_captured)!==original)))bindingFailure();
        if(charge.balance_transaction&&typeof charge.balance_transaction==='object'){
          const balance=object(charge.balance_transaction);const settlementCurrency=String(balance.currency).toUpperCase();
          if(!['available','pending'].includes(String(balance.status)))throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The provider settlement state is invalid.');
          settlement={reference:providerReference(balance.id,'txn'),status:balance.status as 'pending'|'available',currency:settlementCurrency,gross:stripeMajorUnits(balance.amount,settlementCurrency,true),fee:stripeMajorUnits(balance.fee,settlementCurrency),net:stripeMajorUnits(balance.net,settlementCurrency,true),available_on:new Date(seconds(balance.available_on)*1000).toISOString()};
        }
      }else if(status==='completed')bindingFailure();
    }else if(status==='completed')bindingFailure();
    const result:StripePayment={provider:'stripe',connector_version:stripeConnectorVersion,reference:String(value.id),status,provider_status:reversal??(value.payment_status==='paid'?'paid':String(value.status)),amount,currency,observed_at:new Date(this.now()).toISOString(),request_id:binding.request,connection_key:this.configuration.connectionKey,scope_fingerprint:stripeScopeFingerprint(scope),...(binding.account?{account_id:binding.account}:{}),...(intentId?{provider_payment_intent_id:intentId}:{}),...(chargeId?{provider_charge_id:chargeId}:{}),refunded_amount:stripeMajorUnits(refunded.toString(),currency),reversal,...(settlement?{settlement}:{}),...(disputes?{disputes}:{})};
    if(status==='requires_action'&&typeof value.url==='string'){
      let url:URL;try{url=new URL(value.url);}catch{throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The checkout URL is invalid.');}
      if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password||(url.port&&url.port!=='443'))throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The checkout URL is invalid.');
      result.action={kind:'redirect',url:url.href,expires_at:new Date(seconds(value.expires_at)*1000).toISOString()};
    }
    return result;
  }
  async createPayment(scope:TenantContext,input:{request_id:string;account_id?:string;amount:string;currency:string;idempotency_key:string}):Promise<StripePayment> {
    const minor=stripeMinorUnits(input.amount,input.currency);safeId(input.request_id);if(input.account_id)safeId(input.account_id);
    const form=new URLSearchParams({mode:'payment',success_url:this.configuration.successUrl,cancel_url:this.configuration.cancelUrl,client_reference_id:input.request_id,'payment_method_types[0]':'card','line_items[0][quantity]':'1','line_items[0][price_data][currency]':input.currency.toLowerCase(),'line_items[0][price_data][unit_amount]':minor,'line_items[0][price_data][product_data][name]':'Brokerage deposit'});
    const metadata={azuriya_scope:stripeScopeFingerprint(scope),azuriya_connection:this.configuration.connectionKey,azuriya_request:input.request_id,...(input.account_id?{azuriya_account:input.account_id}:{})};
    for(const[key,value]of Object.entries(metadata)){form.set(`metadata[${key}]`,value);form.set(`payment_intent_data[metadata][${key}]`,value);}
    const value=await this.request('POST','checkout/sessions','payment.create',form,input.idempotency_key);const result=this.normalize(scope,value);
    if(result.request_id!==input.request_id||result.account_id!==input.account_id||result.currency!==input.currency||stripeInteger(value.amount_total)!==BigInt(minor))bindingFailure();
    return result;
  }
  async getPayment(scope:TenantContext,reference:string):Promise<StripePayment> {return this.normalize(scope,await this.session(scope,reference));}
  async cancelPayment(scope:TenantContext,input:{reference:string;idempotency_key:string}):Promise<StripePayment> {
    const session=await this.session(scope,input.reference);const current=this.normalize(scope,session);
    if(current.status==='cancelled')return current;
    if(session.status!=='open'||session.payment_status==='paid')throw new AppError(409,'PAYMENT_CANNOT_CANCEL','Only an open unpaid checkout can be cancelled.');
    const updated=await this.request('POST',`checkout/sessions/${encodeURIComponent(input.reference)}/expire`,'payment.cancel',new URLSearchParams(),input.idempotency_key);
    if(updated.id!==input.reference)bindingFailure();return this.normalize(scope,updated);
  }
  async refundPayment(scope:TenantContext,input:{reference:string;amount:string;reason:string;idempotency_key:string;replay?:boolean}):Promise<StripePayment> {
    const current=await this.getPayment(scope,input.reference);const minor=stripeMinorUnits(input.amount,current.currency);
    const remaining=BigInt(stripeMinorUnits(current.amount,current.currency))-stripeInteger(current.refunded_amount==='0.00000000'?'0':stripeMinorUnits(current.refunded_amount,current.currency));
    // Only the durable worker supplies replay after a prior ambiguous attempt;
    // replaying the same retained key can retrieve a now-completed full refund.
    if(!current.provider_payment_intent_id||!['completed','reversed'].includes(current.status)||BigInt(minor)>BigInt(stripeMinorUnits(current.amount,current.currency))||(!input.replay&&(current.status!=='completed'||current.reversal==='chargeback'||BigInt(minor)>remaining)))throw new AppError(409,'PAYMENT_CANNOT_REFUND','The refund exceeds the verified remaining payment amount.');
    const reason=['duplicate','fraudulent','requested_by_customer'].includes(input.reason)?input.reason:'requested_by_customer';
    const form=new URLSearchParams({payment_intent:current.provider_payment_intent_id,amount:minor,reason,'metadata[azuriya_request]':current.request_id,'metadata[azuriya_connection]':this.configuration.connectionKey,'metadata[azuriya_scope]':stripeScopeFingerprint(scope)});
    const refund=await this.request('POST','refunds','payment.refund',form,input.idempotency_key);this.mode(refund.livemode??(this.configuration.environment==='production'));
    if(refund.object!=='refund'||refund.payment_intent!==current.provider_payment_intent_id||String(refund.currency).toUpperCase()!==current.currency||stripeInteger(refund.amount)!==BigInt(minor))bindingFailure();
    const refundReference=providerReference(refund.id,'re');
    if(!['pending','requires_action','succeeded','failed','canceled'].includes(String(refund.status)))throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The provider refund state is invalid.');
    // A created refund can remain pending or fail. Re-read cumulative provider evidence.
    return {...await this.getPayment(scope,input.reference),refund_operation:{reference:refundReference,status:refund.status as NonNullable<StripePayment['refund_operation']>['status'],amount:stripeMajorUnits(minor,current.currency)}};
  }
  private normalizeRefund(scope:TenantContext,payment:StripePayment,refund:Json,reference:string):StripeRefundObservation {
    if(payment.connection_key!==this.configuration.connectionKey||payment.scope_fingerprint!==stripeScopeFingerprint(scope)||refund.id!==reference||refund.object!=='refund'||refund.payment_intent!==payment.provider_payment_intent_id||(refund.charge!==undefined&&refund.charge!==null&&refund.charge!==payment.provider_charge_id)||String(refund.currency).toUpperCase()!==payment.currency||stripeInteger(refund.amount)<=0n||stripeInteger(refund.amount)>BigInt(stripeMinorUnits(payment.amount,payment.currency)))bindingFailure();
    if(refund.livemode!==undefined)this.mode(refund.livemode);
    if(!['pending','requires_action','succeeded','failed','canceled'].includes(String(refund.status)))throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The provider refund state is invalid.');
    if(refund.metadata&&typeof refund.metadata==='object'&&!Array.isArray(refund.metadata)){
      const metadata=refund.metadata as Json;
      if(metadata.azuriya_scope!==undefined||metadata.azuriya_connection!==undefined||metadata.azuriya_request!==undefined){const binding=this.metadata(scope,metadata);if(binding.request!==payment.request_id||(binding.account!==undefined&&binding.account!==payment.account_id))bindingFailure();}
    }
    return {reference:providerReference(reference,'re'),status:refund.status as StripeRefundObservation['status'],amount:stripeMajorUnits(refund.amount,payment.currency)};
  }
  /** Reuses a just-verified scoped payment snapshot; it never mutates a refund. */
  async getRefundStatus(scope:TenantContext,payment:StripePayment,reference:string):Promise<StripeRefundObservation> {
    providerReference(reference,'re');const refund=await this.request('GET',`refunds/${encodeURIComponent(reference)}`,'payment.reconcile');return this.normalizeRefund(scope,payment,refund,reference);
  }
  async getSettlementStatus(scope:TenantContext,reference:string) {const payment=await this.getPayment(scope,reference);return {payment_reference:payment.reference,status:payment.settlement?.status??'unavailable',...(payment.settlement?{settlement:payment.settlement}:{}),meaning:'Availability in the Stripe balance; this does not prove a bank payout or trading-account funding.'};}
  async getConnectionHealth() {
    const account=await this.request('GET','account','connection.health');const reference=providerReference(account.id,'acct');
    if(this.configuration.stripeAccountId&&reference!==this.configuration.stripeAccountId)bindingFailure();
    const balance=await this.request('GET','balance','connection.health');this.mode(balance.livemode);
    return {status:'connected' as const,provider:'stripe',environment:this.configuration.environment,connector_version:stripeConnectorVersion,provider_account_reference:reference,checked_at:new Date(this.now()).toISOString(),capabilities:this.capabilities,accepted_currencies:this.acceptedCurrencies,charges_enabled:account.charges_enabled===true};
  }
  verifyWebhook(scope:TenantContext,input:{body:Uint8Array;signature:string;received_at:string}):StripeVerifiedEvent {
    if(input.body.byteLength===0||input.body.byteLength>1048576||typeof input.signature!=='string'||input.signature.length>4096)throw new AppError(400,'PAYMENT_WEBHOOK_INVALID','The payment callback is invalid.');
    const parts=input.signature.split(',').map(part=>part.trim().split('='));const timestamps=parts.filter(([key])=>key==='t');const signatures=parts.filter(([key,value])=>key==='v1'&&/^[a-fA-F0-9]{64}$/.test(value??'')).map(([,value])=>Buffer.from(value,'hex'));
    const received=Date.parse(input.received_at);const timestamp=timestamps.length===1&&/^\d{1,12}$/.test(timestamps[0][1]??'')?Number(timestamps[0][1]):NaN;
    if(!Number.isFinite(received)||!Number.isSafeInteger(timestamp)||Math.abs(received/1000-timestamp)>300||Math.abs(this.now()/1000-timestamp)>300)throw new AppError(400,'PAYMENT_WEBHOOK_STALE','The payment callback timestamp is invalid or expired.');
    const expected=createHmac('sha256',this.configuration.webhookSecret).update(`${timestamp}.`).update(input.body).digest();
    if(!signatures.some(signature=>timingSafeEqual(signature,expected)))throw new AppError(400,'PAYMENT_WEBHOOK_SIGNATURE_INVALID','The payment callback signature is invalid.');
    let event:Json;try{event=object(JSON.parse(Buffer.from(input.body).toString('utf8')));}catch{throw new AppError(400,'PAYMENT_WEBHOOK_INVALID','The payment callback payload is invalid.');}
    if(event.object!=='event'||typeof event.id!=='string'||!/^evt_[A-Za-z0-9_]{1,190}$/.test(event.id)||typeof event.type!=='string')throw new AppError(400,'PAYMENT_WEBHOOK_INVALID','The payment callback payload is invalid.');
    this.mode(event.livemode);if(event.context!==undefined||event.account!==this.configuration.stripeAccountId)bindingFailure();
    const payload=object(object(event.data).object);
    const kinds:Record<string,StripeVerifiedEvent['object_kind']>={'checkout.session.completed':'checkout.session','checkout.session.async_payment_succeeded':'checkout.session','checkout.session.async_payment_failed':'checkout.session','checkout.session.expired':'checkout.session','payment_intent.succeeded':'payment_intent','payment_intent.payment_failed':'payment_intent','payment_intent.canceled':'payment_intent','charge.refunded':'charge','charge.dispute.created':'dispute','charge.dispute.closed':'dispute','refund.created':'refund','refund.updated':'refund','refund.failed':'refund'};
    const kind=kinds[event.type];if(!kind||payload.object!==kind)throw new AppError(400,'PAYMENT_WEBHOOK_UNSUPPORTED','This payment callback event is unsupported.');
    const prefix=kind==='checkout.session'?'cs':kind==='payment_intent'?'pi':kind==='charge'?'ch':kind==='refund'?'re':'dp';
    const result:StripeVerifiedEvent={provider_event_id:event.id,event_kind:event.type,created_at:new Date(seconds(event.created)*1000).toISOString(),reference:kind==='dispute'?disputeReference(payload.id):providerReference(payload.id,prefix),object_kind:kind};
    if(kind==='checkout.session'||kind==='payment_intent'){
      this.mode(payload.livemode);const binding=kind==='checkout.session'?this.validateSession(scope,payload):this.metadata(scope,payload.metadata);
      result.request_id=binding.request;result.connection_key=this.configuration.connectionKey;result.scope_fingerprint=stripeScopeFingerprint(scope);if(binding.account)result.account_id=binding.account;
    }
    if(typeof payload.payment_intent==='string')result.provider_payment_intent_id=providerReference(payload.payment_intent,'pi');
    if(typeof payload.charge==='string')result.provider_charge_id=providerReference(payload.charge,'ch');
    return result;
  }
  async handleWebhook(scope:TenantContext,input:{body:Uint8Array;signature:string;received_at:string}):Promise<{provider_event_id:string;event_kind:string;payment:StripePayment}> {
    const event=this.verifyWebhook(scope,input);return {provider_event_id:event.provider_event_id,event_kind:event.event_kind,payment:await this.reconcileEvent(scope,event)};
  }
  private validateEventPayment(event:StripeVerifiedEvent,payment:StripePayment,intentId?:string):StripePayment {
    if((event.request_id!==undefined&&event.request_id!==payment.request_id)||(event.account_id!==undefined&&event.account_id!==payment.account_id)||(event.connection_key!==undefined&&event.connection_key!==payment.connection_key)||(event.scope_fingerprint!==undefined&&event.scope_fingerprint!==payment.scope_fingerprint)||(intentId!==undefined&&intentId!==payment.provider_payment_intent_id)||(event.provider_payment_intent_id!==undefined&&event.provider_payment_intent_id!==payment.provider_payment_intent_id)||(event.provider_charge_id!==undefined&&event.provider_charge_id!==payment.provider_charge_id))bindingFailure();
    if((event.object_kind==='charge'&&event.reference!==payment.provider_charge_id)||(event.object_kind==='dispute'&&!payment.disputes?.some(dispute=>dispute.reference===event.reference)))bindingFailure();
    return payment;
  }
  async reconcileEvent(scope:TenantContext,event:StripeVerifiedEvent):Promise<StripePayment> {
    if(event.object_kind==='checkout.session')return this.validateEventPayment(event,await this.getPayment(scope,event.reference));
    const refund=event.object_kind==='refund'?await this.request('GET',`refunds/${encodeURIComponent(providerReference(event.reference,'re'))}`,'payment.reconcile'):undefined;
    if(refund&&(refund.id!==event.reference||refund.object!=='refund'))bindingFailure();
    let intentId=event.object_kind==='payment_intent'?event.reference:event.provider_payment_intent_id;
    if(!intentId){
      let chargeId=event.object_kind==='charge'?event.reference:event.provider_charge_id;
      if(!chargeId&&event.object_kind==='refund'){
        if(typeof refund?.payment_intent==='string')intentId=providerReference(refund.payment_intent,'pi');
        else if(typeof refund?.charge==='string')chargeId=providerReference(refund.charge,'ch');
      }
      if(!intentId&&chargeId){const charge=await this.request('GET',`charges/${encodeURIComponent(providerReference(chargeId,'ch'))}`,'payment.reconcile');intentId=providerReference(charge.payment_intent,'pi');}
    }
    if(!intentId)throw new AppError(422,'PAYMENT_REFERENCE_UNRESOLVED','This callback cannot be matched to a hosted payment.');
    const sessions=await this.request('GET',`checkout/sessions?payment_intent=${encodeURIComponent(providerReference(intentId,'pi'))}&limit=2`,'payment.reconcile');
    if(!Array.isArray(sessions.data)||sessions.data.length!==1)throw new AppError(422,'PAYMENT_REFERENCE_UNRESOLVED','This callback cannot be uniquely matched to a hosted payment.');
    const session=object(sessions.data[0]);this.validateSession(scope,session);const payment=this.validateEventPayment(event,await this.getPayment(scope,providerReference(session.id,'cs')),intentId);
    return refund?{...payment,refund_operation:this.normalizeRefund(scope,payment,refund,event.reference)}:payment;
  }
}
