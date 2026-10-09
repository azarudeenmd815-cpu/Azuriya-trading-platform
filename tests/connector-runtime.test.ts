import { describe, expect, it } from 'vitest';
import { ConnectorError, ConnectorRuntime, redactProviderMetadata } from '../src/server/connectors/runtime.js';

const input = {provider:'stripe', connectionKey:'private-connection', environment:'sandbox' as const, operation:'payment.read', method:'GET' as const, url:'https://api.stripe.com/v1/test'};
describe('bounded connector transport', () => {
  it('classifies credential failures without retrying or exposing response secrets', async () => {
    let calls=0; const runtime=new ConnectorRuntime({fetcher:async()=>{calls++;return new Response('{"secret":"leaked-provider-token"}',{status:401});},delay:async()=>{}});
    await expect(runtime.request(input)).rejects.toMatchObject({code:'PROVIDER_AUTHENTICATION_FAILED',retryable:false,ambiguous:false,status:401}); expect(calls).toBe(1);
    expect(JSON.stringify(runtime.snapshot())).not.toContain('private-connection'); expect(JSON.stringify(runtime.snapshot())).not.toContain('leaked-provider-token');
  });
  it('retries safe reads after 429 with bounded retry-after, then measures success',async()=>{
    let calls=0; const waits:number[]=[]; const runtime=new ConnectorRuntime({fetcher:async()=>++calls===1?new Response('',{status:429,headers:{'retry-after':'1'}}):new Response('{"ok":true}'),delay:async ms=>{waits.push(ms);},random:()=>0});
    expect(await runtime.request(input)).toMatchObject({status:200,body:'{"ok":true}'}); expect(calls).toBe(2); expect(waits[0]).toBeLessThanOrEqual(2000); expect(runtime.snapshot()[0]).toMatchObject({requests:2,retries:1,rate_limits:1});
  });
  it('defers long provider retry-after to durable scheduling without an early retry',async()=>{
    let calls=0;const runtime=new ConnectorRuntime({fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});},delay:async()=>{throw new Error('must not wait here');}});
    await expect(runtime.request(input)).rejects.toMatchObject({code:'PROVIDER_RATE_LIMITED',retryAfterMs:120000});expect(calls).toBe(1);
  });
  it('never automatically repeats an unprotected mutating request after lost response',async()=>{
    let calls=0;const runtime=new ConnectorRuntime({fetcher:async()=>{calls++;throw new TypeError('network');},delay:async()=>{}});
    await expect(runtime.request({...input,method:'POST',body:'amount=100'})).rejects.toMatchObject({code:'PROVIDER_NETWORK_ERROR',retryable:true,ambiguous:true}); expect(calls).toBe(1);
  });
  it('retries explicitly idempotent commands with the identical body and key',async()=>{
    const requests:RequestInit[]=[];const runtime=new ConnectorRuntime({fetcher:async(_url,init)=>{requests.push(init!);return requests.length<3?new Response('',{status:503}):new Response('done');},delay:async()=>{}});
    expect((await runtime.request({...input,method:'POST',body:'fixed',headers:{'Idempotency-Key':'stable'},idempotent:true})).body).toBe('done');expect(requests).toHaveLength(3);expect(requests.every(value=>value.body==='fixed'&&(value.headers as Record<string,string>)['Idempotency-Key']==='stable')).toBe(true);
  });
  it('opens a connection circuit and permits one recovery probe after cooldown',async()=>{
    let now=0;let calls=0;let healthy=false;const runtime=new ConnectorRuntime({clock:()=>now,circuitThreshold:2,circuitCooldownMs:100,fetcher:async()=>{calls++;return new Response('',{status:healthy?200:503});},delay:async()=>{},maxAttempts:1});
    for(let i=0;i<2;i++)await expect(runtime.request(input)).rejects.toBeInstanceOf(ConnectorError);
    await expect(runtime.request(input)).rejects.toMatchObject({code:'PROVIDER_CIRCUIT_OPEN'});expect(calls).toBe(2);now=101;healthy=true;await runtime.request(input);await runtime.request(input);expect(calls).toBe(4);
  });
  it('enforces a deadline even while awaiting a provider response',async()=>{
    const runtime=new ConnectorRuntime({timeoutMs:10,maxAttempts:1,fetcher:async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))});
    await expect(runtime.request(input)).rejects.toMatchObject({code:'PROVIDER_TIMEOUT',retryable:true});
  });
  it('bounds response bytes and rejects redirects, insecure URLs and embedded credentials',async()=>{
    const runtime=new ConnectorRuntime({fetcher:async()=>new Response('too much data'),maxAttempts:1});await expect(runtime.request({...input,maxResponseBytes:4})).rejects.toMatchObject({code:'PROVIDER_RESPONSE_TOO_LARGE'});
    for(const url of ['http://api.stripe.com','https://user:secret@api.stripe.com','https://api.stripe.com:8443','https://api.stripe.com/#x'])await expect(runtime.request({...input,url})).rejects.toMatchObject({code:'PROVIDER_URL_INVALID'});
    const redirects=new ConnectorRuntime({fetcher:async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1'}})});await expect(redirects.request(input)).rejects.toMatchObject({code:'PROVIDER_REDIRECT_REJECTED'});
  });
  it('bounds per-connection concurrency without an unlimited pending queue',async()=>{
    let release!:()=>void; const blocked=new Promise<void>(resolve=>{release=resolve;});const runtime=new ConnectorRuntime({perConnectionConcurrency:1,fetcher:async()=>{await blocked;return new Response('ok');}});const first=runtime.request(input);await expect(runtime.request(input)).rejects.toMatchObject({code:'PROVIDER_CONCURRENCY_LIMIT'});release();await first;
  });
  it('redacts nested credential and PII fields before metadata storage',()=>{
    const value=redactProviderMetadata({status:'active',password:'secret',nested:{access_token:'token',email:'client@example.test',provider_reference:'safe'},payload:'unrestricted raw body'});expect(value).toMatchObject({status:'active',password:'[REDACTED]',nested:{access_token:'[REDACTED]',email:'[REDACTED]',provider_reference:'safe'},payload:'[REDACTED]'});expect(JSON.stringify(value)).not.toContain('client@example.test');
  });
});
