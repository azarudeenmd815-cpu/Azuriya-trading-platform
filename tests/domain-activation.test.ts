import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { DomainActivationService, type DomainProvider } from '../src/server/domain/domain-activation.js';
import { scheduleDomainChecks, domainHandlers } from '../src/server/domain/domain-maintenance.js';
import { OutboxWorker } from '../src/server/domain/outbox-worker.js';
import { DatabaseDomainResolver } from '../src/server/domain/domain-delivery.js';
import { buildApp } from '../src/server/app.js';
import { hashPassword } from '../src/server/security/crypto.js';
import { permissions, type Row, type TenantContext } from '../src/shared/types.js';
describe('certificate activation and four-host isolation', () => {
  let db: Database; const actors: TenantContext[]=[]; const users=[randomUUID(),randomUUID()];
  const dns = new Map<string,string>(); let foundation: FoundationService; const domains: Row[]=[];
  const provider: DomainProvider={reconcile:async domain=>({hostname:String(domain.hostname),ssl_status:'active',edge_status:'active',certificate_issuer:'AcceptanceFixture',certificate_reference:`fixture-${String(domain.id)}`,certificate_expires_at:new Date(Date.now()+90*86400_000).toISOString(),edge_reference:`fixture-route-${String(domain.id)}`}),disable:async()=>{}};
  beforeAll(async()=>{
    db=await createDatabase();await migrate(db);await seedCatalog(db);
    await db.transaction({core:true},async tx=>{for(let i=0;i<2;i++)await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',[users[i],`host-owner-${i}@test.local`,await hashPassword('host-acceptance-password'),`Owner ${i}`]);});
    foundation=new FoundationService(db,{dns:{resolveTxt:async hostname=>[[dns.get(hostname)??'mismatch']]}});
    for(let i=0;i<2;i++)await foundation.createOrganization({core:true,userId:users[i],requestId:'host-fixture'},{name:`Host business ${i}`,slug:`host-business-${i}`,business_type:'brokerage',brand_name:`Independent Brand ${i}`,environment_name:'Sandbox',environment_kind:'sandbox',products:['brokerage-crm'],plan:'test',owner_email:`host-owner-${i}@test.local`});
    const instances=(await db.transaction({core:true},tx=>tx.query<{id:string;organization_id:string;brand_id:string;environment_id:string}>('SELECT i.* FROM product_instances i JOIN organizations o ON o.id=i.organization_id ORDER BY o.slug'))).rows;
    for(let i=0;i<2;i++){
      const instance=instances[i];actors.push({core:false,userId:users[i],requestId:'host-fixture',organizationId:instance.organization_id,brandId:instance.brand_id,environmentId:instance.environment_id,productInstanceId:instance.id,productSlug:'brokerage-crm',permissions:[...permissions]});
      for(const kind of ['admin','app'])domains.push(await foundation.createDomain(actors[i],{hostname:`${kind}-${i}.acceptance.test`,application_type:kind==='admin'?'admin_portal':'client_portal'}));
    }
  });
  afterAll(async()=>db?.close());
  it('rejects mismatch, expiry and duplicates, rotates the challenge, and activates only after complete provider evidence',async()=>{
    const domain=domains[0]; const id=String(domain.id);const activation=new DomainActivationService(db,provider);
    expect((await foundation.verifyDomain(actors[0],id)).status).toBe('awaiting_dns');
    await expect(activation.reconcile(actors[0],id)).rejects.toMatchObject({code:'DOMAIN_NOT_VERIFIED'});
    await db.transaction({core:true},tx=>tx.query("UPDATE domains SET verification_expires_at=now()-interval '1 second' WHERE id=$1",[id]));
    await expect(foundation.verifyDomain(actors[0],id)).rejects.toMatchObject({code:'DNS_CHALLENGE_EXPIRED'});
    await expect(foundation.createDomain(actors[1],{hostname:String(domain.hostname),application_type:'admin_portal'})).rejects.toMatchObject({code:'HOSTNAME_UNAVAILABLE'});
    const rotated=await activation.rotateChallenge(actors[0],id);const record=rotated.verification_record as {name:string;value:string};dns.set(record.name,record.value);
    expect((await foundation.verifyDomain(actors[0],id)).status).toBe('verified');
    await expect(new DomainActivationService(db,{...provider,reconcile:async d=>({hostname:String(d.hostname),ssl_status:'active',edge_status:'active'})}).reconcile(actors[0],id)).rejects.toMatchObject({code:'DOMAIN_PROVIDER_INCOMPLETE'});
    expect((await new DatabaseDomainResolver(db).resolve(String(domain.hostname)))).toBeNull();
    expect((await activation.reconcile(actors[0],id)).status).toBe('active');
    for(let index=1;index<domains.length;index++){const current=domains[index];const record=current.verification_record as {name:string;value:string};dns.set(record.name,record.value);await foundation.verifyDomain(actors[Math.floor(index/2)],String(current.id));await activation.reconcile(actors[Math.floor(index/2)],String(current.id));}
  });
  it('resolves each brand and portal, rejects unknown/cross-instance hosts, redirects HTTP, and prevents copied-session cookie use',async()=>{
    const app=await buildApp({db,origin:'https://core.acceptance.test',production:false,strictHosts:true,trustedProxies:['127.0.0.1']});
    const headers=(hostname:string)=>({host:hostname,'x-forwarded-proto':'https'});
    try{
      for(let i=0;i<4;i++){const response=await app.inject({url:'/api/v1/host-context',headers:headers(String(domains[i].hostname))});expect(response.statusCode).toBe(200);expect(response.json().data).toMatchObject({kind:'tenant',product_instance_id:actors[Math.floor(i/2)].productInstanceId,application_type:i%2?'client_portal':'admin_portal'});expect(response.json().data.brand.name).toBe(`Independent Brand ${Math.floor(i/2)}`);}
      expect((await app.inject({url:'/api/v1/host-context',headers:headers('unknown.acceptance.test')})).statusCode).toBe(421);
      const redirect=await app.inject({url:'/login?next=safe',headers:{host:String(domains[0].hostname)}});expect(redirect.statusCode).toBe(308);expect(redirect.headers.location).toBe(`https://${String(domains[0].hostname)}/login?next=safe`);
      const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:headers(String(domains[0].hostname)),payload:{email:'host-owner-0@test.local',password:'host-acceptance-password'}});expect(login.statusCode).toBe(200);
      const cookie=login.cookies.map(value=>`${value.name}=${value.value}`).join('; ');
      expect((await app.inject({url:`/api/v1/instances/${actors[0].productInstanceId}/overview`,headers:{...headers(String(domains[0].hostname)),cookie}})).statusCode).toBe(200);
      expect((await app.inject({url:`/api/v1/instances/${actors[1].productInstanceId}/overview`,headers:{...headers(String(domains[0].hostname)),cookie}})).json().error.code).toBe('HOST_SCOPE_MISMATCH');
      expect((await app.inject({url:'/api/v1/auth/me',headers:{...headers(String(domains[2].hostname)),cookie}})).statusCode).toBe(401);
      expect((await app.inject({url:`/api/v1/instances/${actors[0].productInstanceId}/overview`,headers:headers(String(domains[1].hostname))})).json().error.code).toBe('APPLICATION_HOST_MISMATCH');
      expect((await app.inject({url:'/api/v1/host-context',headers:{host:'unknown.acceptance.test','x-forwarded-host':'core.acceptance.test','x-forwarded-proto':'https'},remoteAddress:'127.8.8.8'})).statusCode).toBe(421);
    }finally{await app.close();}
  });
  it('schedules one renewal across workers and ignores stale results after a domain is disabled',async()=>{
    const id=String(domains[0].id);await db.transaction({core:true},tx=>tx.query("UPDATE domains SET certificate_expires_at=now()+interval '5 days',provider_last_checked_at=now()-interval '1 hour' WHERE id=$1",[id]));
    expect((await Promise.all([scheduleDomainChecks(db),scheduleDomainChecks(db)])).reduce((a,b)=>a+b,0)).toBe(1);
    const worker=new OutboxWorker(db,domainHandlers(db,provider),{fanout:async()=>{}});for(let i=0;i<30;i++)if(!await worker.runOnce())break;
    expect((await db.transaction({core:true},tx=>tx.query<{status:string}>('SELECT status FROM domains WHERE id=$1',[id]))).rows[0].status).toBe('active');
    let complete!:()=>void;const wait=new Promise<void>(resolve=>{complete=resolve;});const changing=new DomainActivationService(db,{...provider,reconcile:async d=>{await wait;return provider.reconcile(d);}}).reconcile(actors[0],id);
    await new Promise<void>(resolve=>setTimeout(resolve,20));await foundation.disableDomain(actors[0],id);complete();
    await expect(changing).rejects.toMatchObject({code:'DOMAIN_STATE_CHANGED'});expect(await new DatabaseDomainResolver(db).resolve(String(domains[0].hostname))).toBeNull();
  });
});
