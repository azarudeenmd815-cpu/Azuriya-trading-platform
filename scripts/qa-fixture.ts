/** Disposable local PostgreSQL browser fixture; never runs against a public deployment. */
import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { hashPassword } from '../src/server/security/crypto.js';
const env=parse(await readFile('artifacts/pg-acceptance/runtime.env','utf8'));const url=new URL(env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='54841')throw new Error('QA fixture requires the isolated local acceptance cluster.');
const db=await createDatabase({url:url.toString(),migrationUrl:env.MIGRATION_DATABASE_URL,requireTls:true,sslCa:await readFile(env.DB_TLS_CA_FILE,'utf8')});
try{
  await migrate(db);
  await db.transaction({core:true},async tx=>{
    const existing=(await tx.query<{id:string}>("SELECT id FROM users WHERE email='acceptance-client@test.local'")).rows[0]?.id; const user=existing??randomUUID();
    if(!existing)await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',[user,'acceptance-client@test.local',await hashPassword('local-acceptance-only-2026'),'Acceptance Client']);
    const instances=(await tx.query<{id:string;organization_id:string}>('SELECT id,organization_id FROM product_instances')).rows;
    for(const instance of instances)await tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,product_instance_id) DO NOTHING',[randomUUID(),instance.organization_id,user,instance.id]);
  });
  console.log('Disposable client portal fixture prepared for both acceptance businesses.');
}finally{await db.close();}
