import { setTimeout as delayTimer } from 'node:timers/promises';

export type ConnectorEnvironment = 'sandbox'|'demo'|'production';
export interface ConnectorRequest {
  provider:string; connectionKey:string; environment:ConnectorEnvironment; operation:string;
  method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; url:string; headers?:Record<string,string>;
  body?:string|Uint8Array; idempotent?:boolean; maxResponseBytes?:number;
}
export interface ConnectorResponse {status:number;body:string;headers:Headers;latencyMs:number}
export class ConnectorError extends Error {
  constructor(readonly code:string,readonly retryable=false,readonly ambiguous=false,readonly status?:number,readonly retryAfterMs?:number){super(code);this.name='ConnectorError';}
}
interface RuntimeOptions {
  fetcher?:typeof fetch; timeoutMs?:number; maxAttempts?:number; circuitThreshold?:number;
  circuitCooldownMs?:number; perConnectionConcurrency?:number; totalConcurrency?:number;
  clock?:()=>number; delay?:(ms:number)=>Promise<void>; random?:()=>number;
  beforeRequest?:(input:ConnectorRequest)=>Promise<void>;
}
interface Circuit {failures:number;openUntil:number;active:number;probing:boolean;seenAt:number}
interface Metric {provider:string;environment:string;operation:string;requests:number;errors:number;retries:number;rate_limits:number;timeouts:number;duration_ms:number;status_families:Record<string,number>}

/** Responses are never logged here. Callers store whitelisted normalized evidence only. */
export function redactProviderMetadata(value:unknown,depth=0):unknown {
  if(depth>5)return '[REDACTED]';
  if(Array.isArray(value))return value.slice(0,20).map(item=>redactProviderMetadata(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,40).map(([key,field])=>[key,/password|secret|token|private.?key|authorization|cookie|email|address|phone|payload|raw|body|url/i.test(key)?'[REDACTED]':redactProviderMetadata(field,depth+1)]));
  if(typeof value==='string')return value.slice(0,160);
  return typeof value==='number'||typeof value==='boolean'||value===null?value:undefined;
}

/** Bounded transport. Durable operation safety belongs to the database orchestration layer. */
export class ConnectorRuntime {
  private circuits=new Map<string,Circuit>(); private metrics=new Map<string,Metric>(); private active=0;
  private options:Required<RuntimeOptions>;
  constructor(options:RuntimeOptions={}){
    this.options={fetcher:options.fetcher??fetch,timeoutMs:options.timeoutMs??10000,maxAttempts:options.maxAttempts??3,circuitThreshold:options.circuitThreshold??3,circuitCooldownMs:options.circuitCooldownMs??30000,perConnectionConcurrency:options.perConnectionConcurrency??2,totalConcurrency:options.totalConcurrency??32,clock:options.clock??Date.now,delay:options.delay??(ms=>delayTimer(ms)),random:options.random??Math.random,beforeRequest:options.beforeRequest??(async()=>{})};
  }
  setRequestGate(gate:(input:ConnectorRequest)=>Promise<void>){this.options.beforeRequest=gate;}
  snapshot(){return [...this.metrics.values()].map(value=>({...value,status_families:{...value.status_families}}));}
  private metric(input:ConnectorRequest):Metric {
    const labels=[input.provider,input.environment,input.operation].map(value=>/^[a-z][a-z0-9_.-]{0,48}$/.test(value)?value:'other');
    let key=labels.join(':');if(!this.metrics.has(key)&&this.metrics.size>=128)key='other:other:other';
    let metric=this.metrics.get(key);if(!metric){metric={provider:key.split(':')[0],environment:key.split(':')[1],operation:key.split(':')[2],requests:0,errors:0,retries:0,rate_limits:0,timeouts:0,duration_ms:0,status_families:{}};this.metrics.set(key,metric);}return metric;
  }
  private async boundedBody(response:Response,maximum:number):Promise<string>{
    const declared=response.headers.get('content-length');if(declared&&Number(declared)>maximum)throw new ConnectorError('PROVIDER_RESPONSE_TOO_LARGE');
    if(!response.body)return '';
    const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
    try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum)throw new ConnectorError('PROVIDER_RESPONSE_TOO_LARGE');parts.push(next.value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    return Buffer.concat(parts).toString('utf8');
  }
  async request(input:ConnectorRequest):Promise<ConnectorResponse>{
    let url:URL;try{url=new URL(input.url);}catch{throw new ConnectorError('PROVIDER_URL_INVALID');}
    if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443'))throw new ConnectorError('PROVIDER_URL_INVALID');
    if(!input.connectionKey||input.connectionKey.length>200)throw new ConnectorError('PROVIDER_CONNECTION_INVALID');
    const circuitKey=`${input.provider}:${input.environment}:${input.connectionKey}`;const now=this.options.clock();
    let circuit=this.circuits.get(circuitKey);
    if(!circuit){
      if(this.circuits.size>=1000){for(const [key,value] of this.circuits){if(value.active===0&&now-value.seenAt>60000)this.circuits.delete(key);}}
      if(this.circuits.size>=1000)throw new ConnectorError('PROVIDER_RUNTIME_CAPACITY',true);
      circuit={failures:0,openUntil:0,active:0,probing:false,seenAt:now};this.circuits.set(circuitKey,circuit);
    }
    circuit.seenAt=now;
    if(circuit.openUntil>now||circuit.probing)throw new ConnectorError('PROVIDER_CIRCUIT_OPEN',true,false,undefined,Math.max(1000,circuit.openUntil-now));
    if(circuit.active>=this.options.perConnectionConcurrency||this.active>=this.options.totalConcurrency)throw new ConnectorError('PROVIDER_CONCURRENCY_LIMIT',true);
    const halfOpen=circuit.openUntil>0;if(halfOpen)circuit.probing=true;
    circuit.active++;this.active++;const metric=this.metric(input);const mutating=input.method!=='GET';const repeatable=!mutating||input.idempotent===true;
    try{
      const attempts=repeatable?Math.min(3,Math.max(1,this.options.maxAttempts)):1;
      for(let attempt=0;attempt<attempts;attempt++){
        await this.options.beforeRequest(input);
        const started=performance.now();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.options.timeoutMs);metric.requests++;
        let error:ConnectorError|undefined;
        try{
          const response=await this.options.fetcher(url,{method:input.method,headers:input.headers,body:input.body as BodyInit|undefined,redirect:'error',signal:controller.signal});
          metric.status_families[`${Math.floor(response.status/100)}xx`]=(metric.status_families[`${Math.floor(response.status/100)}xx`]??0)+1;
          if(response.status>=300&&response.status<400)throw new ConnectorError('PROVIDER_REDIRECT_REJECTED',false,mutating,response.status);
          if(!response.ok){
            await response.body?.cancel().catch(()=>{});
            const header=response.headers.get('retry-after');let retryAfterMs=header&&/^\d+$/.test(header)?Number(header)*1000:header?Math.max(0,Date.parse(header)-this.options.clock()):undefined;
            if(retryAfterMs!==undefined&&!Number.isFinite(retryAfterMs))retryAfterMs=undefined;
            if(response.status===401||response.status===403)throw new ConnectorError('PROVIDER_AUTHENTICATION_FAILED',false,false,response.status);
            if(response.status===429){metric.rate_limits++;throw new ConnectorError('PROVIDER_RATE_LIMITED',true,false,response.status,retryAfterMs);}
            throw new ConnectorError(response.status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_REQUEST_REJECTED',[408,502,503,504].includes(response.status),mutating&&response.status>=500,response.status,retryAfterMs);
          }
          const body=await this.boundedBody(response,Math.min(input.maxResponseBytes??1024*1024,4*1024*1024));
          const latencyMs=performance.now()-started;circuit.failures=0;circuit.openUntil=0;return {status:response.status,body,headers:response.headers,latencyMs};
        }catch(failure){
          error=failure instanceof ConnectorError?failure:new ConnectorError(controller.signal.aborted?'PROVIDER_TIMEOUT':'PROVIDER_NETWORK_ERROR',true,mutating);
          metric.errors++;if(error.code==='PROVIDER_TIMEOUT')metric.timeouts++;
        }finally{clearTimeout(timer);metric.duration_ms+=performance.now()-started;}
        // A long provider delay is handed to the durable scheduler. Never shorten
        // Retry-After and hammer a rate-limited provider to fit this request.
        if(!error.retryable||attempt+1>=attempts||(error.retryAfterMs??0)>2000){
          if(error.retryable){circuit.failures++;if(circuit.failures>=this.options.circuitThreshold||halfOpen)circuit.openUntil=this.options.clock()+this.options.circuitCooldownMs;}
          throw error;
        }
        metric.retries++;await this.options.delay(Math.min(2000,error.retryAfterMs??250*2**attempt*(.75+this.options.random()*.5)));
      }
      throw new ConnectorError('PROVIDER_ATTEMPTS_EXHAUSTED');
    }finally{circuit.active--;circuit.probing=false;this.active--;}
  }
}
