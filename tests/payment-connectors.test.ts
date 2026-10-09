import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '../src/shared/types.js';

const scope = { organizationId:'org-one',brandId:'brand-one',environmentId:'env-one',productInstanceId:'instance-one',userId:'actor-one',requestId:'http-one',core:false } as TenantContext;
const now = 1791060000;
const connection = 'connection-one';
const webhookSecret = 'whsec_payment_test_fixture';
const requestId = 'deposit-one';
const accountId = 'account-one';
type Call = { method:string;url:string;headers?:Record<string,string>;body?:string|Uint8Array;idempotent?:boolean };

async function module() {
  const value = await import('../src/server/connectors/stripe-payment.js').catch(() => undefined);
  expect(value?.StripePaymentProvider, 'The real protocol adapter must exist.').toBeTypeOf('function');
  return value!;
}
async function money() {
  const value = await import('../src/server/connectors/exact-money.js').catch(() => undefined);
  expect(value?.stripeMinorUnits, 'The exact conversion must exist.').toBeTypeOf('function');
  return value!;
}
async function setup(replies:unknown[] = []) {
  const value = await module();
  const calls:Call[] = [];
  const runtime = { request:async(input:Call) => {
    calls.push(input);
    if(!replies.length) throw new Error('Unexpected provider request');
    return {status:200,body:JSON.stringify(replies.shift()),headers:new Headers(),latencyMs:4};
  } };
  const provider = new value.StripePaymentProvider({secretKey:'sk_test_protocol_fixture',webhookSecret,environment:'sandbox',successUrl:'https://broker.test/portal/return',cancelUrl:'https://broker.test/portal/cancel',connectionKey:connection,runtime,now:()=>now*1000});
  const binding = {azuriya_scope:value.stripeScopeFingerprint(scope),azuriya_connection:connection,azuriya_request:requestId,azuriya_account:accountId};
  const session = (overrides:Record<string,unknown> = {}) => ({id:'cs_test_fixture',object:'checkout.session',mode:'payment',livemode:false,amount_total:1234,currency:'usd',status:'open',payment_status:'unpaid',expires_at:now+3600,url:'https://checkout.stripe.com/c/pay/cs_test_fixture',client_reference_id:requestId,metadata:binding,payment_intent:null,...overrides});
  return {provider,calls,binding,session,replies,value};
}
function signed(body:Uint8Array,timestamp = now, secret=webhookSecret) {
  return `t=${timestamp},v1=${createHmac('sha256',secret).update(`${timestamp}.`).update(body).digest('hex')}`;
}
function body(value:unknown) { return Buffer.from(JSON.stringify(value)); }

describe('Stripe payment protocol and exact money boundaries',()=>{
  it('converts exact decimal strings to minor units without rounding or floats',async()=>{
    const value=await money();
    expect(value.stripeMinorUnits('12.34000000','USD')).toBe('1234');
    expect(value.stripeMinorUnits('50.00000000','JPY')).toBe('50');
    expect(value.stripeMajorUnits(1234,'USD')).toBe('12.34000000');
    expect(value.stripeMajorUnits('50','JPY')).toBe('50.00000000');
  });
  it('rejects unsupported currencies, excess precision, invalid numbers and oversized provider amounts',async()=>{
    const value=await money();
    for(const [amount,currency] of [['12.34000001','USD'],['50.01','JPY'],['1e3','USD'],['-1','USD'],['0','USD'],['01','USD'],['1000000','USD'],['10','XYZ']])expect(()=>value.stripeMinorUnits(amount,currency)).toThrow();
    for(const amount of [NaN,0.1,Number.MAX_SAFE_INTEGER+1,-1])expect(()=>value.stripeMajorUnits(amount,'USD')).toThrow();
  });
  it('creates a hosted checkout using the durable key and scope-bound references',async()=>{
    const test=await setup();test.replies.push(test.session());
    const result=await test.provider.createPayment(scope,{request_id:requestId,account_id:accountId,amount:'12.34000000',currency:'USD',idempotency_key:'durable-operation-one'});
    expect(result).toMatchObject({reference:'cs_test_fixture',status:'requires_action',amount:'12.34000000',currency:'USD',request_id:requestId,account_id:accountId,connection_key:connection,action:{kind:'redirect',url:'https://checkout.stripe.com/c/pay/cs_test_fixture'}});
    const call=test.calls[0];expect(call.url).toBe('https://api.stripe.com/v1/checkout/sessions');expect(call.method).toBe('POST');
    expect(call.headers?.['Idempotency-Key']).toBe('durable-operation-one');expect(call.idempotent).toBe(true);
    const form=new URLSearchParams(String(call.body));expect(form.get('line_items[0][price_data][unit_amount]')).toBe('1234');
    expect(form.get('metadata[azuriya_scope]')).toBe(test.binding.azuriya_scope);expect(form.get('payment_intent_data[metadata][azuriya_account]')).toBe(accountId);
    expect(form.get('client_reference_id')).toBe(requestId);expect(form.get('payment_method_types[0]')).toBe('card');
  });
  it('does not call the provider for an amount that cannot be represented in its currency',async()=>{
    const test=await setup();await expect(test.provider.createPayment(scope,{request_id:requestId,amount:'12.34000001',currency:'USD',idempotency_key:'durable-operation-one'})).rejects.toMatchObject({code:'PAYMENT_PRECISION_UNSUPPORTED'});expect(test.calls).toHaveLength(0);
  });
  it('rejects swapped request, currency and amount in a create response',async()=>{
    for(const overrides of [{amount_total:1235},{currency:'eur'},{client_reference_id:'another-request'}]){
      const test=await setup();test.replies.push(test.session(overrides));
      await expect(test.provider.createPayment(scope,{request_id:requestId,account_id:accountId,amount:'12.34',currency:'USD',idempotency_key:'durable-operation-one'})).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
    }
  });
  it('verifies connection, four-part scope and provider environment on every payment read',async()=>{
    for(const change of [{livemode:true},{metadata:{azuriya_scope:'other',azuriya_connection:connection,azuriya_request:requestId}},{metadata:{azuriya_scope:'unused',azuriya_connection:'other',azuriya_request:requestId}}]){
      const test=await setup();test.replies.push(test.session(change));
      await expect(test.provider.getPayment(scope,'cs_test_fixture')).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
    }
  });
  it('keeps unpaid completed checkout pending until provider payment evidence is paid',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'unpaid'}));
    expect(await test.provider.getPayment(scope,'cs_test_fixture')).toMatchObject({status:'processing'});
  });
  it('normalizes paid checkout without storing provider customer/card details',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'paid',customer_details:{email:'private@example.test'},payment_intent:{id:'pi_fixture',object:'payment_intent',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,client_secret:'pi_secret_must_never_return',latest_charge:{id:'ch_fixture',object:'charge',amount:1234,amount_refunded:0,currency:'usd',paid:true,disputed:false,livemode:false,payment_intent:'pi_fixture',billing_details:{name:'Private Person'}}}}));
    const result=await test.provider.getPayment(scope,'cs_test_fixture');expect(result).toMatchObject({status:'completed',provider_payment_intent_id:'pi_fixture',provider_charge_id:'ch_fixture',refunded_amount:'0.00000000'});
    expect(JSON.stringify(result)).not.toMatch(/private@example|pi_secret|Private Person|billing_details|customer_details/);
  });
  it('expires only an open unpaid checkout and uses an idempotency key',async()=>{
    const test=await setup();test.replies.push(test.session(),test.session({status:'expired',url:null}));
    expect(await test.provider.cancelPayment(scope,{reference:'cs_test_fixture',idempotency_key:'expire-operation-one'})).toMatchObject({status:'cancelled'});
    expect(test.calls[1]).toMatchObject({method:'POST',url:'https://api.stripe.com/v1/checkout/sessions/cs_test_fixture/expire',idempotent:true});
    expect(test.calls[1].headers?.['Idempotency-Key']).toBe('expire-operation-one');
  });
  it('refuses to expire a paid session',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}}));
    await expect(test.provider.cancelPayment(scope,{reference:'cs_test_fixture',idempotency_key:'expire-operation-one'})).rejects.toMatchObject({code:'PAYMENT_CANNOT_CANCEL'});expect(test.calls).toHaveLength(1);
  });
  it('verifies untouched raw bytes and rejects payload mutation, stale timestamps and another secret',async()=>{
    const test=await setup();const raw=Buffer.from('{ "id":"evt_fixture", "object":"event", "type":"checkout.session.completed", "created":1791060000, "livemode":false, "data":{"object":'+JSON.stringify(test.session())+'} }');
    expect(test.provider.verifyWebhook(scope,{body:raw,signature:signed(raw),received_at:new Date(now*1000).toISOString()})).toMatchObject({provider_event_id:'evt_fixture',event_kind:'checkout.session.completed',reference:'cs_test_fixture',request_id:requestId});
    for(const signature of [signed(raw,now-301),signed(raw,now+301),signed(raw,now,'whsec_other'),'t=bad,v1=00'])expect(()=>test.provider.verifyWebhook(scope,{body:raw,signature,received_at:new Date(now*1000).toISOString()})).toThrow();
    expect(()=>test.provider.verifyWebhook(scope,{body:Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),signature:signed(raw),received_at:new Date(now*1000).toISOString()})).toThrow();
  });
  it('supports multiple rotation signatures while rejecting wrong Connect account and live events',async()=>{
    const test=await setup();const event={id:'evt_fixture',object:'event',type:'checkout.session.completed',created:now,livemode:false,data:{object:test.session()}};const raw=body(event);
    expect(test.provider.verifyWebhook(scope,{body:raw,signature:`t=${now},v1=${'0'.repeat(64)},${signed(raw).split(',')[1]}`,received_at:new Date(now*1000).toISOString()}).provider_event_id).toBe('evt_fixture');
    for(const override of [{account:'acct_another'},{livemode:true},{context:'org_context'}]){const changed=body({...event,...override});expect(()=>test.provider.verifyWebhook(scope,{body:changed,signature:signed(changed),received_at:new Date(now*1000).toISOString()})).toThrow();}
  });
  it('treats a signed webhook as a hint and fetches authoritative payment state',async()=>{
    const test=await setup();const raw=body({id:'evt_fixture',object:'event',type:'checkout.session.completed',created:now,livemode:false,data:{object:test.session({payment_status:'paid'})}});test.replies.push(test.session({status:'complete',payment_status:'unpaid'}));
    const result=await test.provider.handleWebhook(scope,{body:raw,signature:signed(raw),received_at:new Date(now*1000).toISOString()});expect(result).toMatchObject({provider_event_id:'evt_fixture',payment:{status:'processing'}});expect(test.calls).toHaveLength(1);
  });
  it('normalizes cumulative partial/full refunds and chargebacks without losing the original amount',async()=>{
    for(const [refunded,disputed,reversal,status]of[[200,false,'partially_refunded','completed'],[1234,false,'refunded','reversed'],[0,true,'chargeback','reversed']]as const){
      const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:refunded,paid:true,disputed,payment_intent:'pi_fixture',livemode:false}}}));
      if(disputed)test.replies.push({data:[{id:'du_fixture',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:1234,currency:'usd',livemode:false,status:'under_review'}],has_more:false});
      expect(await test.provider.getPayment(scope,'cs_test_fixture')).toMatchObject({amount:'12.34000000',refunded_amount:refunded===200?'2.00000000':refunded===1234?'12.34000000':'0.00000000',reversal,status});
    }
  });
  it('reports supported operations honestly and has no payout or trading credit capability',async()=>{
    const test=await setup();expect(test.provider.capabilities).toMatchObject({'payment.create':true,'payment.read':true,'payment.cancel':true,'payment.refund':true,'payment.webhook':true,'payment.reconcile':true,'payout.create':false,'balance.adjust':false});
  });
  it('creates a refund with the durable key and reads provider-confirmed cumulative evidence',async()=>{
    const test=await setup();const paid=(refunded:number)=>test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:refunded,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push(paid(0),{id:'re_fixture',object:'refund',payment_intent:'pi_fixture',amount:200,currency:'usd',status:'succeeded'},paid(200));
    expect(await test.provider.refundPayment(scope,{reference:'cs_test_fixture',amount:'2.00',reason:'Customer request',idempotency_key:'refund-operation-one'})).toMatchObject({status:'completed',reversal:'partially_refunded',refunded_amount:'2.00000000'});
    expect(test.calls[1].headers?.['Idempotency-Key']).toBe('refund-operation-one');const form=new URLSearchParams(String(test.calls[1].body));expect(form.get('payment_intent')).toBe('pi_fixture');expect(form.get('amount')).toBe('200');
  });
  it('forwards an approved provider refund reason while keeping free-text reasons out of provider payloads',async()=>{
    const test=await setup();const paid=test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push(paid,{id:'re_reason',object:'refund',payment_intent:'pi_fixture',amount:200,currency:'usd',status:'pending'},paid);
    await test.provider.refundPayment(scope,{reference:'cs_test_fixture',amount:'2.00',reason:'duplicate',idempotency_key:'refund-operation-reason'});
    expect(new URLSearchParams(String(test.calls[1].body)).get('reason')).toBe('duplicate');
  });
  it('keeps a pending refund pending until cumulative charge evidence changes',async()=>{
    const test=await setup();const paid=test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push(paid,{id:'re_fixture',object:'refund',payment_intent:'pi_fixture',amount:200,currency:'usd',status:'pending'},paid);
    expect(await test.provider.refundPayment(scope,{reference:'cs_test_fixture',amount:'2.00',reason:'Customer request',idempotency_key:'refund-operation-one'})).toMatchObject({reversal:null,refunded_amount:'0.00000000',refund_operation:{reference:'re_fixture',status:'pending',amount:'2.00000000'}});
  });
  it('rejects an over-refund and a swapped refund payment intent',async()=>{
    const test=await setup();const paid=test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:1000,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push(paid);await expect(test.provider.refundPayment(scope,{reference:'cs_test_fixture',amount:'3.00',reason:'Request',idempotency_key:'refund-operation-one'})).rejects.toMatchObject({code:'PAYMENT_CANNOT_REFUND'});expect(test.calls).toHaveLength(1);
    test.replies.push(paid,{id:'re_fixture',object:'refund',payment_intent:'pi_swapped',amount:100,currency:'usd',status:'succeeded'});await expect(test.provider.refundPayment(scope,{reference:'cs_test_fixture',amount:'1.00',reason:'Request',idempotency_key:'refund-operation-two'})).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('distinguishes won disputes from active chargebacks using authoritative dispute evidence',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:true,payment_intent:'pi_fixture',livemode:false}}}),{data:[{id:'du_fixture',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:1234,currency:'usd',livemode:false,status:'won'}],has_more:false});
    expect(await test.provider.getPayment(scope,'cs_test_fixture')).toMatchObject({status:'completed',reversal:null,disputes:[{reference:'du_fixture',status:'won',amount:'12.34000000'}]});
    expect(test.calls[1].url).toBe('https://api.stripe.com/v1/disputes?payment_intent=pi_fixture&limit=100');
  });
  it('rejects a mismatched dispute or charge funding amount',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:true,payment_intent:'pi_fixture',livemode:false}}}),{data:[{id:'du_fixture',object:'dispute',payment_intent:'pi_another',charge:'ch_fixture',amount:1234,currency:'usd',livemode:false,status:'lost'}],has_more:false});
    await expect(test.provider.getPayment(scope,'cs_test_fixture')).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('reports Stripe balance availability separately from bank settlement and trading funding',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false,balance_transaction:{id:'txn_fixture',status:'available',amount:1234,fee:66,net:1168,currency:'usd',available_on:now}}}}));
    const result=await test.provider.getSettlementStatus(scope,'cs_test_fixture');expect(result).toMatchObject({status:'available',settlement:{gross:'12.34000000',fee:'0.66000000',net:'11.68000000'}});expect(result.meaning).toMatch(/does not prove a bank payout/);
  });
  it('performs a read-only health check and never exposes balances or secrets',async()=>{
    const test=await setup([{id:'acct_fixture',charges_enabled:true,business_profile:{name:'Private Business'}},{livemode:false,available:[{amount:99999,currency:'usd'}]}]);
    expect(await test.provider.getConnectionHealth()).toMatchObject({status:'connected',environment:'sandbox',provider_account_reference:'acct_fixture',charges_enabled:true});
    expect(test.calls.map(call=>call.method)).toEqual(['GET','GET']);expect(JSON.stringify(await setup().then(t=>t.provider.capabilities))).not.toMatch(/sk_test|whsec/);
  });
  it('resolves a refund callback through the unique scoped Checkout payment before applying state',async()=>{
    const test=await setup();const paid=test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:200,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push({id:'re_fixture',object:'refund',payment_intent:'pi_fixture',charge:'ch_fixture',amount:200,currency:'usd',status:'succeeded'},{data:[paid]},paid);
    const raw=body({id:'evt_refund',object:'event',type:'refund.updated',created:now,livemode:false,data:{object:{id:'re_fixture',object:'refund',payment_intent:'pi_fixture',amount:200,currency:'usd',status:'succeeded'}}});
    expect(await test.provider.handleWebhook(scope,{body:raw,signature:signed(raw),received_at:new Date(now*1000).toISOString()})).toMatchObject({provider_event_id:'evt_refund',payment:{request_id:requestId,provider_payment_intent_id:'pi_fixture',refunded_amount:'2.00000000',refund_operation:{reference:'re_fixture',status:'succeeded'}}});expect(test.calls[1].url).toContain('payment_intent=pi_fixture');
  });
  it('reads a refund callback authoritatively even when its signed snapshot still says pending',async()=>{
    const test=await setup();const paid=test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push({id:'re_delayed',object:'refund',payment_intent:'pi_fixture',charge:'ch_fixture',amount:200,currency:'usd',status:'failed'},{data:[paid]},paid);
    const raw=body({id:'evt_delayed_refund',object:'event',type:'refund.updated',created:now,livemode:false,data:{object:{id:'re_delayed',object:'refund',payment_intent:'pi_fixture',amount:200,currency:'usd',status:'pending'}}});
    expect(await test.provider.handleWebhook(scope,{body:raw,signature:signed(raw),received_at:new Date(now*1000).toISOString()})).toMatchObject({payment:{status:'completed',refunded_amount:'0.00000000',refund_operation:{reference:'re_delayed',status:'failed',amount:'2.00000000'}}});
    expect(test.calls[0].url).toBe('https://api.stripe.com/v1/refunds/re_delayed');
  });
  it('rejects malformed, oversized and unsupported signed callbacks without provider requests',async()=>{
    const test=await setup();
    for(const raw of [Buffer.from('{bad'),body({id:'evt_fixture',object:'event',type:'customer.created',created:now,livemode:false,data:{object:{object:'customer',id:'cus_fixture'}}}),Buffer.alloc(1048577)])expect(()=>test.provider.verifyWebhook(scope,{body:raw,signature:signed(raw),received_at:new Date(now*1000).toISOString()})).toThrow();
    expect(test.calls).toHaveLength(0);
  });
  it('repeated verified events retain one deterministic provider event ID for durable deduplication',async()=>{
    const test=await setup();const raw=body({id:'evt_repeated',object:'event',type:'checkout.session.completed',created:now,livemode:false,data:{object:test.session()}});const input={body:raw,signature:signed(raw),received_at:new Date(now*1000).toISOString()};
    expect(test.provider.verifyWebhook(scope,input)).toEqual(test.provider.verifyWebhook(scope,input));expect(test.calls).toHaveLength(0);
  });
  it('reflects cancelled and failed payment intents while preserving retryable unpaid checkout',async()=>{
    for(const [sessionStatus,intentStatus,expected]of[['open','canceled','cancelled'],['complete','requires_payment_method','failed'],['open','requires_payment_method','requires_action']]as const){
      const test=await setup();test.replies.push(test.session({status:sessionStatus,payment_intent:{id:'pi_fixture',status:intentStatus,amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:null}}));
      expect(await test.provider.getPayment(scope,'cs_test_fixture')).toMatchObject({status:expected});
    }
  });
  it('rejects an under-captured charge instead of crediting its intended full amount',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,amount_received:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,amount_captured:1200,currency:'usd',amount_refunded:0,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}}));
    await expect(test.provider.getPayment(scope,'cs_test_fixture')).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('rejects callback scope substitution and provider checkout URL substitution',async()=>{
    const test=await setup();const raw=body({id:'evt_fixture',object:'event',type:'checkout.session.completed',created:now,livemode:false,data:{object:test.session({metadata:{...test.binding,azuriya_scope:'other'}})}});
    expect(()=>test.provider.verifyWebhook(scope,{body:raw,signature:signed(raw),received_at:new Date(now*1000).toISOString()})).toThrow();
    test.replies.push(test.session({url:'https://checkout.stripe.com.attacker.test/pay'}));await expect(test.provider.getPayment(scope,'cs_test_fixture')).rejects.toMatchObject({code:'PAYMENT_RESPONSE_INVALID'});
  });
  it('refuses key mode mismatch and unsafe return URLs before a request is possible',async()=>{
    const value=await module();const runtime={request:async()=>{throw new Error('No request allowed');}};
    const configuration={secretKey:'sk_test_protocol_fixture',webhookSecret,environment:'sandbox' as const,successUrl:'https://broker.test/return',cancelUrl:'https://broker.test/cancel',connectionKey:connection,runtime};
    expect(()=>new value.StripePaymentProvider({...configuration,environment:'production'})).toThrow();expect(()=>new value.StripePaymentProvider({...configuration,successUrl:'https://user:password@broker.test/return'})).toThrow();expect(()=>new value.StripePaymentProvider({...configuration,successUrl:'http://remote.test/return'})).toThrow();
  });
  it('replays the same refund key after a lost response without mistaking the now-refunded payment for a new refund',async()=>{
    const test=await setup();const refunded=test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:1234,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push(refunded,{id:'re_original',object:'refund',payment_intent:'pi_fixture',amount:1234,currency:'usd',status:'succeeded'},refunded);
    expect(await test.provider.refundPayment(scope,{reference:'cs_test_fixture',amount:'12.34',reason:'Request',idempotency_key:'original-refund-operation',replay:true})).toMatchObject({status:'reversed',refund_operation:{reference:'re_original',status:'succeeded'}});
    expect(test.calls[1].headers?.['Idempotency-Key']).toBe('original-refund-operation');
  });
  it('rejects an authoritative checkout whose PaymentIntent differs from the verified event reference',async()=>{
    const test=await setup();test.replies.push({data:[test.session()],has_more:false},test.session({payment_intent:{id:'pi_swapped',status:'requires_payment_method',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:null}}));
    await expect(test.provider.reconcileEvent(scope,{provider_event_id:'evt_intent',event_kind:'payment_intent.succeeded',created_at:new Date(now*1000).toISOString(),reference:'pi_original',object_kind:'payment_intent',request_id:requestId,account_id:accountId,connection_key:connection,scope_fingerprint:test.binding.azuriya_scope})).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('preserves verified callback ownership when provider metadata changes before reconciliation',async()=>{
    const test=await setup();test.replies.push(test.session({client_reference_id:'another-deposit',metadata:{...test.binding,azuriya_request:'another-deposit',azuriya_account:'another-account'}}));
    await expect(test.provider.reconcileEvent(scope,{provider_event_id:'evt_session',event_kind:'checkout.session.completed',created_at:new Date(now*1000).toISOString(),reference:'cs_test_fixture',object_kind:'checkout.session',request_id:requestId,account_id:accountId,connection_key:connection,scope_fingerprint:test.binding.azuriya_scope})).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('rejects a substituted PaymentIntent response after fetching its session reference',async()=>{
    const test=await setup();test.replies.push(test.session({payment_intent:'pi_original'}),{id:'pi_swapped',status:'requires_payment_method',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:null});
    await expect(test.provider.getPayment(scope,'cs_test_fixture')).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('rejects duplicate dispute references before their amounts can be added twice',async()=>{
    const test=await setup();const dispute={id:'du_same',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:200,currency:'usd',livemode:false,status:'under_review'};
    test.replies.push(test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:true,payment_intent:'pi_fixture',livemode:false}}}),{data:[dispute,dispute],has_more:false});
    await expect(test.provider.getPayment(scope,'cs_test_fixture')).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('rejects a reversal whose provider charge never confirms the original payment',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'unpaid',payment_intent:{id:'pi_fixture',status:'processing',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:1234,paid:false,disputed:false,payment_intent:'pi_fixture',livemode:false}}}));
    await expect(test.provider.getPayment(scope,'cs_test_fixture')).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('rejects a charge callback that substitutes another charge on the same payment',async()=>{
    const test=await setup();const paid=test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_actual',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:false,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push({data:[paid]},paid);
    await expect(test.provider.reconcileEvent(scope,{provider_event_id:'evt_charge_substituted',event_kind:'charge.refunded',created_at:new Date(now*1000).toISOString(),reference:'ch_other',object_kind:'charge',provider_payment_intent_id:'pi_fixture'})).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('rejects a dispute callback absent from the authoritative payment dispute evidence',async()=>{
    const test=await setup();const paid=test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:true,payment_intent:'pi_fixture',livemode:false}}});
    test.replies.push({data:[paid]},paid,{data:[{id:'du_actual',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:1234,currency:'usd',livemode:false,status:'won'}],has_more:false});
    await expect(test.provider.reconcileEvent(scope,{provider_event_id:'evt_dispute_substituted',event_kind:'charge.dispute.closed',created_at:new Date(now*1000).toISOString(),reference:'du_other',object_kind:'dispute',provider_payment_intent_id:'pi_fixture',provider_charge_id:'ch_fixture'})).rejects.toMatchObject({code:'PAYMENT_BINDING_MISMATCH'});
  });
  it('preserves a provider-confirmed disputed amount that exceeds the original charge through currency fluctuation',async()=>{
    const test=await setup();test.replies.push(test.session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',amount:1234,currency:'usd',livemode:false,metadata:test.binding,latest_charge:{id:'ch_fixture',amount:1234,currency:'usd',amount_refunded:0,paid:true,disputed:true,payment_intent:'pi_fixture',livemode:false}}}),{data:[{id:'du_fluctuation',object:'dispute',payment_intent:'pi_fixture',charge:'ch_fixture',amount:1250,currency:'usd',livemode:false,status:'lost'}],has_more:false});
    expect(await test.provider.getPayment(scope,'cs_test_fixture')).toMatchObject({amount:'12.34000000',status:'reversed',disputes:[{reference:'du_fluctuation',amount:'12.50000000'}]});
  });
});
