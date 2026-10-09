import { createHash } from 'node:crypto';
import type { Database } from '../db/database.js';
import { PostgresRateLimiter } from '../security/rate-limiter.js';
import { ConnectorError,type ConnectorRequest } from './runtime.js';

/** A shared credential bucket also coordinates independent worker processes. */
export function postgresConnectorGate(db:Database){
 const limiter=new PostgresRateLimiter(db);
 return async(input:ConnectorRequest)=>{
  const authentication=Object.entries(input.headers??{}).filter(([name])=>/authorization|api[-_]key|brand[-_]key/i.test(name)).sort(([left],[right])=>left.localeCompare(right)).map(([name,value])=>[name.toLowerCase(),value]);
  const fingerprint=createHash('sha256').update(JSON.stringify(authentication.length?authentication:[input.connectionKey])).digest('hex');
  const windowSeconds=input.provider==='tradelocker'?10:1;const limit=input.provider==='tradelocker'?90:input.environment==='production'?80:20;
  try{await limiter.consume([{key:`connector:${input.provider}:${input.environment}:${fingerprint}`,limit,windowSeconds}]);}
  catch(error){if((error as {statusCode?:number}).statusCode===429)throw new ConnectorError('CONNECTOR_RATE_LIMITED',true,false,429,windowSeconds*1000);throw new ConnectorError('CONNECTOR_RATE_LIMITER_UNAVAILABLE',true,false,503,1000);}
 };
}
