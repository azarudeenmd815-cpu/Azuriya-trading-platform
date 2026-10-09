/** Isolated local acceptance only. Consumes the existing ignored fixture environment without printing it. */
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve,join } from 'node:path';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDatabase } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
const root=resolve('artifacts/pg-acceptance');const values=parse(await readFile(join(root,'runtime.env'),'utf8'));const source=new URL(values.MIGRATION_DATABASE_URL);assert.equal(source.hostname,'127.0.0.1');assert.equal(source.port,'54841');
const ca=await readFile(values.DB_TLS_CA_FILE,'utf8');const admin=new URL(source);admin.pathname='/postgres';const owner=new pg.Pool({connectionString:admin.toString(),ssl:{ca,rejectUnauthorized:true}});
const name=`azuriya_encrypted_restore_${Date.now()}`;const target=new URL(source);target.pathname=`/${name}`;const key=randomBytes(32).toString('base64');const archive=join(root,`${name}.azbk`);const corrupt=join(root,`${name}-tampered.azbk`);
const env={...process.env,BACKUP_DATABASE_URL:source.toString(),RESTORE_DATABASE_URL:target.toString(),DB_TLS_CA_FILE:values.DB_TLS_CA_FILE,BACKUP_ENCRYPTION_KEY:key,PG_BIN:'C:/Users/Azaru/.cache/azuriya-tools/pgsql/bin'};
const run=(operation:string,path:string,override:Record<string,string>={})=>spawnSync(process.execPath,['--import','tsx','scripts/backup.ts',operation,path],{env:{...env,...override},encoding:'utf8'});
let db:Awaited<ReturnType<typeof createDatabase>>|undefined;
try{
  db=await createDatabase({url:values.DATABASE_URL,migrationUrl:source.toString(),requireTls:true,sslCa:ca});await migrate(db);await owner.query(`CREATE DATABASE ${name}`);
  const start=performance.now();assert.equal(run('backup',archive).status,0);const backupMs=performance.now()-start;
  assert.notEqual(run('restore',archive,{BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('base64')}).status,0);
  const bytes=await readFile(archive);bytes[bytes.length-1]^=1;await writeFile(corrupt,bytes);assert.notEqual(run('restore',corrupt).status,0);
  const check=new pg.Pool({connectionString:target.toString(),ssl:{ca,rejectUnauthorized:true}});assert.equal(Number((await check.query<{count:string}>("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count),0);await check.end();
  const restoreStart=performance.now();assert.equal(run('restore',archive).status,0);const restoreMs=performance.now()-restoreStart;assert.notEqual(run('restore',archive).status,0);
  const runtime=new URL(values.DATABASE_URL);runtime.pathname=`/${name}`;const restored=await createDatabase({url:runtime.toString(),migrationUrl:target.toString(),requireTls:true,sslCa:ca});await migrate(restored);assert.equal((await restored.query('SELECT id FROM organizations')).rows.length,0);assert.equal((await restored.transaction({core:true},tx=>tx.query('SELECT id FROM organizations'))).rows.length,2);await restored.close();
  const evidence={timestamp:new Date().toISOString(),environment:'isolated local PostgreSQL16 TLS',encrypted_backup_ms:backupMs,authenticated_restore_ms:restoreMs,wrong_key_rejected:true,tamper_rejected_before_database_write:true,nonempty_target_rejected:true,post_restore_migrations_and_RLS:'passed'};await writeFile(join(root,'encrypted-backup-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await db?.close();await owner.end();}
