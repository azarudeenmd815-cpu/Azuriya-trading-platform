import 'dotenv/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
const [operation,filename]=process.argv.slice(2);
if(!['backup','restore'].includes(operation)||!filename) throw new Error('Usage: tsx scripts/backup.ts backup|restore <archive.azbk>');
const key=Buffer.from(process.env.BACKUP_ENCRYPTION_KEY??'','base64');if(key.length!==32) throw new Error('Configure a separate 32-byte BACKUP_ENCRYPTION_KEY.');
const connection=new URL((operation==='restore'?process.env.RESTORE_DATABASE_URL:process.env.BACKUP_DATABASE_URL)??'');
if(!['postgres:','postgresql:'].includes(connection.protocol)||connection.searchParams.has('sslmode')||!process.env.DB_TLS_CA_FILE) throw new Error('Use a PostgreSQL URL without TLS overrides and a verified DB_TLS_CA_FILE.');
const env={...process.env,PGHOST:connection.hostname,PGPORT:connection.port||'5432',PGUSER:decodeURIComponent(connection.username),PGPASSWORD:decodeURIComponent(connection.password),PGDATABASE:connection.pathname.slice(1),PGSSLMODE:'verify-full',PGSSLROOTCERT:resolve(process.env.DB_TLS_CA_FILE)};
const binary=(name:string)=>process.env.PG_BIN?join(process.env.PG_BIN,`${name}${process.platform==='win32'?'.exe':''}`):name;
const done=(child:ReturnType<typeof spawn>)=>new Promise<void>((resolve,reject)=>{child.on('error',()=>reject(new Error('PostgreSQL backup tool could not start.')));child.on('close',code=>code===0?resolve():reject(new Error('PostgreSQL backup tool failed.')));});
const magic=Buffer.from('AZBKv1\0\0');const file=resolve(filename);let temporary:string|undefined;
try {
  if(operation==='backup'){
    const nonce=randomBytes(12);const header=Buffer.concat([magic,nonce]);const output=createWriteStream(file,{flags:'wx',mode:0o600});output.write(header);
    const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(header);
    const child=spawn(binary('pg_dump'),['--format=custom','--no-password'],{env,stdio:['ignore','pipe','ignore']});const completion=done(child);
    try{await Promise.all([pipeline(child.stdout!,cipher,output,{end:false}),completion]);output.end(cipher.getAuthTag());await new Promise<void>((resolve,reject)=>{output.on('finish',resolve);output.on('error',reject);});}
    catch(error){child.kill();output.destroy();throw error;}
    console.log(JSON.stringify({status:'encrypted_backup_created',archive:file,format:'AZBKv1_AES256GCM'}));
  }else{
    const handle=await open(file,'r');const size=(await stat(file)).size;if(size<37)throw new Error('Archive is incomplete.');
    const header=Buffer.alloc(20),tag=Buffer.alloc(16);await handle.read(header,0,20,0);await handle.read(tag,0,16,size-16);await handle.close();
    if(!header.subarray(0,8).equals(magic))throw new Error('Unsupported archive version.');
    temporary=await mkdtemp(join(tmpdir(),'azuriya-restore-'));const dump=join(temporary,'validated.dump');
    const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAAD(header);decipher.setAuthTag(tag);
    // Authenticate the entire encrypted archive before touching a destination database.
    await pipeline(createReadStream(file,{start:20,end:size-17}),decipher,createWriteStream(dump,{flags:'wx',mode:0o600}));
    const ca=await import('node:fs/promises').then(fs=>fs.readFile(resolve(process.env.DB_TLS_CA_FILE!),'utf8'));
    const pool=new pg.Pool({connectionString:connection.toString(),ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:5000});
    try{const existing=await pool.query<{count:string}>("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m')");if(Number(existing.rows[0].count)!==0)throw new Error('Restore requires a separately created, empty database.');}finally{await pool.end();}
    const child=spawn(binary('pg_restore'),['--no-password','--exit-on-error','--single-transaction','--dbname',env.PGDATABASE,dump],{env,stdio:'ignore'});await done(child);
    console.log(JSON.stringify({status:'restore_completed',validation_required:['migration_checksums','restricted_role','RLS','tenant_counts','application_smoke']}));
  }
}catch{console.error(JSON.stringify({status:'failed',code:'BACKUP_OR_RESTORE_FAILED',archive:file}));process.exitCode=1;}
finally{
  if(temporary){const resolved=resolve(temporary);if(dirname(resolved)===resolve(tmpdir())&&resolved.startsWith(resolve(tmpdir())+sep+'azuriya-restore-'))await rm(resolved,{recursive:true,force:true});}
}
