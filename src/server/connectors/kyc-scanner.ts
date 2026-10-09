import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { createConnection } from 'node:net';
import ipaddr from 'ipaddr.js';
import { AppError } from '../domain/errors.js';
import { KYC_MAX_FILE_BYTES } from './kyc-storage.js';

export interface ScanEvidence {status:'clean'|'infected';sha256:string;size:number;engine:string;signatureVersion:string;scannedAt:string}
export interface KycScanner {scan(bytes:Buffer):Promise<ScanEvidence>}
export interface ScannerConfig {host:string;port:number;timeoutMs?:number}
export function readScannerConfig(env:NodeJS.ProcessEnv=process.env):ScannerConfig|null{if(!env.KYC_CLAMAV_HOST&&!env.KYC_CLAMAV_PORT)return null;const port=Number(env.KYC_CLAMAV_PORT??3310);if(!env.KYC_CLAMAV_HOST||!Number.isInteger(port)||port<1||port>65535)throw new AppError(503,'KYC_SCANNER_CONFIGURATION_INVALID','The private scanner configuration is incomplete.');return{host:env.KYC_CLAMAV_HOST,port};}
export class ClamAvScanner implements KycScanner {
  constructor(private config:ScannerConfig){}
  private async address():Promise<string>{let addresses;try{addresses=await lookup(this.config.host,{all:true});}catch{throw new AppError(503,'KYC_SCANNER_UNAVAILABLE','The private malware scanner is unavailable.');}if(!addresses.length||addresses.some(value=>{let address=ipaddr.parse(value.address);if(address.kind()==='ipv6'&&(address as ipaddr.IPv6).isIPv4MappedAddress())address=(address as ipaddr.IPv6).toIPv4Address();return address.range()!=='loopback';}))throw new AppError(503,'KYC_SCANNER_CONFIGURATION_INVALID','ClamAV must use a loopback sidecar. Remote scanning requires an approved encrypted transport.');return addresses[0].address;}
  private async exchange(address:string,parts:Buffer[]):Promise<string>{return new Promise((resolve,reject)=>{
    const socket=createConnection({host:address,port:this.config.port});let response=Buffer.alloc(0);let settled=false;
    const fail=()=>{if(settled)return;settled=true;socket.destroy();reject(new AppError(503,'KYC_SCANNER_UNAVAILABLE','The private malware scanner did not complete its response.'));};
    const timer=setTimeout(fail,this.config.timeoutMs??15_000);socket.once('error',()=>{clearTimeout(timer);fail();});socket.once('connect',async()=>{try{for(const part of parts){if(!socket.write(part))await new Promise<void>((next,stop)=>{socket.once('drain',next);socket.once('error',stop);});}}catch{fail();}});
    socket.on('data',chunk=>{response=Buffer.concat([response,chunk]);if(response.length>4096){clearTimeout(timer);fail();return;}const end=response.indexOf(0);if(end>=0){clearTimeout(timer);if(!settled){settled=true;socket.destroy();resolve(response.subarray(0,end).toString('utf8').trim());}}});socket.once('end',()=>{clearTimeout(timer);if(!settled)fail();});socket.once('close',()=>clearTimeout(timer));
  });}
  async scan(bytes:Buffer):Promise<ScanEvidence>{
    if(!bytes.length||bytes.length>KYC_MAX_FILE_BYTES)throw new AppError(413,'KYC_SCAN_SIZE_INVALID','The file exceeds the scanner input limit.');
    const address=await this.address();const signatureVersion=await this.exchange(address,[Buffer.from('zVERSION\0')]);if(!/^ClamAV [\x20-\x7e]{1,250}$/.test(signatureVersion))throw new AppError(503,'KYC_SCAN_FAILED','The scanner version could not be verified.');
    const parts:Buffer[]=[Buffer.from('zINSTREAM\0')];for(let offset=0;offset<bytes.length;offset+=64*1024){const chunk=bytes.subarray(offset,offset+64*1024);const size=Buffer.alloc(4);size.writeUInt32BE(chunk.length);parts.push(size,chunk);}parts.push(Buffer.alloc(4));const response=await this.exchange(address,parts);
    const status=response==='stream: OK'?'clean':/^stream: [\x20-\x7e]{1,250} FOUND$/.test(response)?'infected':null;if(!status)throw new AppError(503,'KYC_SCAN_FAILED','The scanner did not produce valid malware scan evidence.');
    return{status,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,engine:'clamav-clamd',signatureVersion,scannedAt:new Date().toISOString()};
  }
}
