import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { createDatabase,type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { hashPassword } from '../src/server/security/crypto.js';
import { permissions,type Row,type TenantContext } from '../src/shared/types.js';
import { ConnectorConnectionService,loadConnector } from '../src/server/connectors/connection-service.js';
import { ConnectorWorker } from '../src/server/connectors/connector-worker.js';
import { ConnectorRuntime } from '../src/server/connectors/runtime.js';

describe('durable connector orchestration and database isolation',()=>{
 let db:Database;let service:ConnectorConnectionService;let scope:TenantContext;let foreign:TenantContext;let id:string;let worker:ConnectorWorker;
 const userId=randomUUID();const oldKey=process.env.SECRET_ENCRYPTION_KEY;const values=(s:TenantContext)=>[s.organizationId,s.brandId,s.environmentId,s.productInstanceId];
 beforeAll(async()=>{
  process.env.SECRET_ENCRYPTION_KEY=Buffer.alloc(32,54).toString('base64');db=await createDatabase();await migrate(db);await seedCatalog(db);
  const passwordHash=await hashPassword('connector-test-password-2026');await db.transaction({core:true},tx=>tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',[userId,'connectors-owner@test.local',passwordHash,'Connector Owner']));
  const foundation=new FoundationService(db);
  for(const slug of ['connector-one','connector-two']){
   const org=await foundation.createOrganization({core:true,userId,requestId:randomUUID()},{name:slug,slug,business_type:'brokerage',brand_name:slug,environment_name:'Sandbox',environment_kind:'sandbox',products:['brokerage-crm'],plan:'test',owner_email:'connectors-owner@test.local'});
   const instance=(await db.transaction({core:true},tx=>tx.query<Row>('SELECT * FROM product_instances WHERE organization_id=$1',[org.id]))).rows[0];const context={core:false,userId,requestId:randomUUID(),organizationId:String(org.id),brandId:String(instance.brand_id),environmentId:String(instance.environment_id),productInstanceId:String(instance.id),productSlug:'brokerage-crm',permissions:[...permissions]};if(!scope)scope=context;else foreign=context;
  }
  service=new ConnectorConnectionService(db);await service.prepareProvider('stripe');
  const runtime=new ConnectorRuntime({fetcher:async(url,init)=>String((init?.headers as Record<string,string>).Authorization).includes('bad')?new Response('',{status:401}):new Response(JSON.stringify(String(url).endsWith('/account')?{id:'acct_test',charges_enabled:true}:{livemode:false})),delay:async()=>{}});worker=new ConnectorWorker(db,{runtime,origin:'http://127.0.0.1:5173'});
 });
 afterAll(async()=>{await db?.close();if(oldKey===undefined)delete process.env.SECRET_ENCRYPTION_KEY;else process.env.SECRET_ENCRYPTION_KEY=oldKey;});
 it('requires an explicit matching credential environment',async()=>{
  await expect(service.create(scope,{provider:'stripe',label:'Mismatch',environment:'sandbox',credentials:{environment:'production',secret_key:'sk_test_good',webhook_secret:'whsec_good'}})).rejects.toMatchObject({code:'CONNECTOR_ENVIRONMENT_MISMATCH'});
 });
 it('queues validation atomically and exposes no credential references or secrets',async()=>{
  const row=await service.create(scope,{provider:'stripe',label:'Stripe Sandbox',environment:'sandbox',credentials:{environment:'sandbox',secret_key:'sk_test_good',webhook_secret:'whsec_good'}});id=row.id;expect(row).toMatchObject({status:'validating',credentials_configured:true});expect(JSON.stringify(row)).not.toContain('sk_test_good');expect(row).not.toHaveProperty('credential_reference');
  const jobs=await db.transaction(scope,tx=>tx.query('SELECT * FROM connector_operations'));expect(jobs.rows).toHaveLength(1);expect(JSON.stringify(jobs.rows)).not.toContain('sk_test_good');
 });
 it('performs provider validation outside transactions and records real safe health',async()=>{
  expect(await worker.runOnce()).toBe(true);const row=await loadConnector(db,scope,id);expect(row).toMatchObject({status:'connected',provider_account_reference:'acct_test'});expect((await service.list(scope)).data[0]).toMatchObject({connector_version:'1.0.0',environment:'sandbox'});
  expect(await worker.runOnce()).toBe(false);
 });
 it('preserves old working credentials after failed staged rotation',async()=>{
  const previous=(await loadConnector(db,scope,id)).credential_reference;await service.rotate(scope,id,{environment:'sandbox',secret_key:'sk_test_bad',webhook_secret:'whsec_bad'});expect((await loadConnector(db,scope,id)).credential_reference).toBe(previous);await worker.runOnce();const row=await loadConnector(db,scope,id);expect(row.status).toBe('connected');expect(row.credential_reference).toBe(previous);expect(row.candidate_credential_reference).toBeNull();
 });
 it('atomically activates a validated rotation and removes old credentials',async()=>{
  const previous=(await loadConnector(db,scope,id)).credential_reference;await service.rotate(scope,id,{environment:'sandbox',secret_key:'sk_test_rotated',webhook_secret:'whsec_rotated'});await worker.runOnce();const row=await loadConnector(db,scope,id);expect(row.credential_reference).not.toBe(previous);expect(row.credential_revision).toBe(1);expect((await db.transaction({core:true},tx=>tx.query('SELECT id FROM credential_envelopes WHERE id=$1',[previous]))).rows).toHaveLength(0);
 });
 it('deduplicates concurrent test requests and keeps journal ownership in the database',async()=>{
  const a=await service.test(scope,id);const b=await service.test(scope,id);expect(a.operation_id).toBe(b.operation_id);await worker.runOnce();await expect(service.test(foreign,id)).rejects.toMatchObject({code:'CONNECTOR_NOT_FOUND'});
 });
 it('forces all four RLS dimensions and immutable payment/health evidence',async()=>{
  for(const table of ['connector_operations','connector_event_receipts','connector_payment_observations','connector_reconciliations','connector_health_history']){
   for(const context of [{},{organizationId:scope.organizationId},{...scope,brandId:foreign.brandId},{...scope,environmentId:foreign.environmentId},{...scope,productInstanceId:foreign.productInstanceId}])expect((await db.transaction(context,tx=>tx.query(`SELECT * FROM ${table}`))).rows).toHaveLength(0);
  }
  await expect(db.transaction(scope,tx=>tx.query('UPDATE connector_health_history SET status=\'unavailable\''))).rejects.toMatchObject({code:'42501'});
  const operation=(await db.transaction(scope,tx=>tx.query<{id:string}>('SELECT id FROM connector_operations LIMIT 1'))).rows[0];await expect(db.transaction({core:true},tx=>tx.query('UPDATE connector_operations SET organization_id=$1,brand_id=$2,environment_id=$3,product_instance_id=$4 WHERE id=$5',[...values(foreign),operation.id]))).rejects.toMatchObject({code:'23503'});
 });
 it('disconnect cancels pending operations, revokes credentials and prevents later execution',async()=>{
  await service.test(scope,id);expect(await service.disconnect(scope,id)).toEqual({status:'disconnected'});expect(await worker.runOnce()).toBe(false);expect((await loadConnector(db,scope,id)).credential_reference).toBeNull();await expect(service.test(scope,id)).rejects.toMatchObject({code:'CONNECTOR_NOT_ACTIONABLE'});
 });
});
