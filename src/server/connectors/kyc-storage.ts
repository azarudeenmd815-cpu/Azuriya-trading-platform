import { createHash, randomUUID } from 'node:crypto';
import { S3Client, GetPublicAccessBlockCommand, GetBucketPolicyStatusCommand, GetBucketOwnershipControlsCommand, GetBucketAclCommand, GetBucketEncryptionCommand, GetBucketVersioningCommand, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { TenantContext } from '../../shared/types.js';
import { AppError } from '../domain/errors.js';

export const KYC_MAX_FILE_BYTES = 20 * 1024 * 1024;
export interface StorageConfig { region:string; bucket:string; accessKeyId:string; secretAccessKey:string; endpoint?:string; kmsKeyId?:string }
export interface ObjectReceipt { key:string; version:string; sha256:string; size:number; contentType:string; encrypted:boolean }
export interface KycObjectStorage { validate():Promise<void>; put(key:string,bytes:Buffer,contentType:string):Promise<ObjectReceipt>; inspect(key:string,expected:{sha256:string;size:number;contentType:string}):Promise<ObjectReceipt|null>; read(receipt:ObjectReceipt):Promise<Buffer>; remove(receipt:ObjectReceipt):Promise<void> }
export function readStorageConfig(env:NodeJS.ProcessEnv=process.env):StorageConfig|null {
  const names=['KYC_S3_REGION','KYC_S3_BUCKET','KYC_S3_ACCESS_KEY_ID','KYC_S3_SECRET_ACCESS_KEY'] as const;
  if(!names.some(name=>env[name])&&!env.KYC_S3_ENDPOINT&&!env.KYC_S3_KMS_KEY_ID)return null;
  if(names.some(name=>!env[name]))throw new AppError(503,'KYC_STORAGE_CONFIGURATION_INVALID','Private document storage configuration is incomplete.');
  if(env.KYC_S3_ENDPOINT){let url:URL;try{url=new URL(env.KYC_S3_ENDPOINT);}catch{throw new AppError(503,'KYC_STORAGE_CONFIGURATION_INVALID','Private storage endpoint is invalid.');}if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new AppError(503,'KYC_STORAGE_CONFIGURATION_INVALID','Private storage requires a secure endpoint.');}
  if(env.KYC_S3_KMS_KEY_ID&&!/^arn:(?:aws|aws-cn|aws-us-gov):kms:[a-z0-9-]+:\d{12}:key\/[a-zA-Z0-9-]+$/.test(env.KYC_S3_KMS_KEY_ID))throw new AppError(503,'KYC_STORAGE_CONFIGURATION_INVALID','Configure the exact approved KMS key ARN. Mutable aliases are unsupported.');
  return {region:env.KYC_S3_REGION!,bucket:env.KYC_S3_BUCKET!,accessKeyId:env.KYC_S3_ACCESS_KEY_ID!,secretAccessKey:env.KYC_S3_SECRET_ACCESS_KEY!,...(env.KYC_S3_ENDPOINT?{endpoint:env.KYC_S3_ENDPOINT}:{}),...(env.KYC_S3_KMS_KEY_ID?{kmsKeyId:env.KYC_S3_KMS_KEY_ID}:{})};
}
export function scopedObjectKey(scope:TenantContext,documentId:string):string{return `kyc/${scope.organizationId}/${scope.brandId}/${scope.environmentId}/${scope.productInstanceId}/${documentId}/${randomUUID()}`;}
export function validateDocumentBytes(meta:{filename:string;content_type:string;size_bytes:number},bytes:Buffer,maxBytes=KYC_MAX_FILE_BYTES):string {
  if(bytes.length<1||bytes.length>maxBytes||bytes.length!==meta.size_bytes)throw new AppError(413,'KYC_FILE_SIZE_INVALID','The file size differs from its registered size or exceeds the upload limit.');
  const name=meta.filename;if(!name||name.length>180||/[\\/]/.test(name)||[...name].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)||name.includes('..'))throw new AppError(400,'KYC_FILE_TYPE_INVALID','Choose a PDF, JPEG or PNG file with a safe filename.');
  const extension=name.split('.').pop()?.toLowerCase();
  const pdf=bytes.subarray(0,5).equals(Buffer.from('%PDF-'));
  const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!((extension==='pdf'&&meta.content_type==='application/pdf'&&pdf)||(['jpg','jpeg'].includes(extension??'')&&meta.content_type==='image/jpeg'&&jpeg)||(extension==='png'&&meta.content_type==='image/png'&&png)))throw new AppError(400,'KYC_FILE_TYPE_INVALID','The extension, file type and file signature must agree.');
  return createHash('sha256').update(bytes).digest('hex');
}
export class S3PrivateKycStorage implements KycObjectStorage {
  private client:S3Client;
  constructor(private config:StorageConfig,client?:S3Client){this.client=client??new S3Client({region:config.region,endpoint:config.endpoint,forcePathStyle:Boolean(config.endpoint),credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:2});}
  private async send<T>(command:HeadObjectCommand|GetObjectCommand|DeleteObjectCommand):Promise<T>{try{return await this.client.send(command,{abortSignal:AbortSignal.timeout(15_000)}) as T;}catch{throw new AppError(503,'KYC_STORAGE_UNAVAILABLE','Private document storage could not complete the operation.');}}
  async validate():Promise<void>{
    const Bucket=this.config.bucket;
    try{
      const [block,policy,ownership,acl,encryption,versioning]=await Promise.all([this.client.send(new GetPublicAccessBlockCommand({Bucket}),{abortSignal:AbortSignal.timeout(5000)}),this.client.send(new GetBucketPolicyStatusCommand({Bucket}),{abortSignal:AbortSignal.timeout(5000)}),this.client.send(new GetBucketOwnershipControlsCommand({Bucket}),{abortSignal:AbortSignal.timeout(5000)}),this.client.send(new GetBucketAclCommand({Bucket}),{abortSignal:AbortSignal.timeout(5000)}),this.client.send(new GetBucketEncryptionCommand({Bucket}),{abortSignal:AbortSignal.timeout(5000)}),this.client.send(new GetBucketVersioningCommand({Bucket}),{abortSignal:AbortSignal.timeout(5000)})]);
      const access=block.PublicAccessBlockConfiguration;const cipher=this.config.kmsKeyId?'aws:kms':'AES256';
      if(!access||![access.BlockPublicAcls,access.IgnorePublicAcls,access.BlockPublicPolicy,access.RestrictPublicBuckets].every(value=>value===true)||policy.PolicyStatus?.IsPublic!==false||ownership.OwnershipControls?.Rules?.some(rule=>rule.ObjectOwnership==='BucketOwnerEnforced')!==true||!acl.Owner?.ID||!acl.Grants?.length||acl.Grants.some(grant=>grant.Grantee?.Type!=='CanonicalUser'||grant.Grantee.ID!==acl.Owner?.ID||grant.Permission!=='FULL_CONTROL')||versioning.Status!=='Enabled'||!encryption.ServerSideEncryptionConfiguration?.Rules?.some(rule=>rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm===cipher&&(!this.config.kmsKeyId||rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID===this.config.kmsKeyId)))throw new Error('Unsafe private bucket');
    }catch{throw new AppError(503,'KYC_STORAGE_UNSAFE','The bucket must enforce private ownership, public access blocking, encryption and versioning.');}
  }
  async put(key:string,bytes:Buffer,contentType:string):Promise<ObjectReceipt>{
    const sha256=createHash('sha256').update(bytes).digest('hex');
    try{await this.client.send(new PutObjectCommand({Bucket:this.config.bucket,Key:key,Body:bytes,ContentLength:bytes.length,ContentType:contentType,Metadata:{sha256},ChecksumSHA256:Buffer.from(sha256,'hex').toString('base64'),IfNoneMatch:'*',ServerSideEncryption:this.config.kmsKeyId?'aws:kms':'AES256',...(this.config.kmsKeyId?{SSEKMSKeyId:this.config.kmsKeyId}:{})}),{abortSignal:AbortSignal.timeout(15_000)});}catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==412)throw new AppError(503,'KYC_STORAGE_UNAVAILABLE','The private upload could not be confirmed. Retry the same file.');}
    const receipt=await this.inspect(key,{sha256,size:bytes.length,contentType});if(!receipt)throw new AppError(503,'KYC_STORAGE_RECEIPT_INVALID','The private object could not be confirmed.');return receipt;
  }
  async inspect(key:string,expected:{sha256:string;size:number;contentType:string}):Promise<ObjectReceipt|null>{
    let head:import('@aws-sdk/client-s3').HeadObjectCommandOutput;try{head=await this.client.send(new HeadObjectCommand({Bucket:this.config.bucket,Key:key,ChecksumMode:'ENABLED'}),{abortSignal:AbortSignal.timeout(15_000)});}catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404)return null;throw new AppError(503,'KYC_STORAGE_UNAVAILABLE','The private object receipt could not be inspected.');}
    const encrypted=head.ServerSideEncryption===(this.config.kmsKeyId?'aws:kms':'AES256')&&(!this.config.kmsKeyId||head.SSEKMSKeyId===this.config.kmsKeyId);
    if(!head.VersionId||head.VersionId==='null'||head.Metadata?.sha256!==expected.sha256||head.ContentLength!==expected.size||head.ContentType!==expected.contentType||!encrypted||(head.ChecksumSHA256&&head.ChecksumSHA256!==Buffer.from(expected.sha256,'hex').toString('base64')))throw new AppError(503,'KYC_STORAGE_RECEIPT_INVALID','The encrypted private object receipt could not be verified.');
    return{key,version:head.VersionId,sha256:expected.sha256,size:expected.size,contentType:expected.contentType,encrypted};
  }
  async read(receipt:ObjectReceipt):Promise<Buffer>{
    const signal=AbortSignal.timeout(15_000);
    let result:import('@aws-sdk/client-s3').GetObjectCommandOutput;
    try{result=await this.client.send(new GetObjectCommand({Bucket:this.config.bucket,Key:receipt.key,VersionId:receipt.version,ChecksumMode:'ENABLED'}),{abortSignal:signal});}catch{throw new AppError(503,'KYC_STORAGE_UNAVAILABLE','The private document read could not be completed.');}
    const destroy=()=>{(result.Body as {destroy?:()=>void}|undefined)?.destroy?.();};
    if(!result.Body||result.VersionId!==receipt.version||result.ContentLength!==receipt.size||result.ContentType!==receipt.contentType||result.ServerSideEncryption!==(this.config.kmsKeyId?'aws:kms':'AES256')||(this.config.kmsKeyId&&result.SSEKMSKeyId!==this.config.kmsKeyId)||result.Metadata?.sha256!==receipt.sha256){destroy();throw new AppError(503,'KYC_STORAGE_RECEIPT_INVALID','The private file receipt no longer matches.');}
    let abort=()=>{};
    const interrupted=new Promise<never>((_resolve,reject)=>{abort=()=>{destroy();reject(new AppError(503,'KYC_STORAGE_UNAVAILABLE','The private document read exceeded its deadline.'));};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
    const parts:Buffer[]=[];let length=0;
    try{
      const iterator=(result.Body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
      while(true){const next=await Promise.race([iterator.next(),interrupted]);if(next.done)break;const part=next.value;length+=part.length;if(length>receipt.size||length>KYC_MAX_FILE_BYTES)throw new AppError(503,'KYC_STORAGE_RECEIPT_INVALID','The private file size no longer matches.');parts.push(Buffer.from(part));}
      const bytes=Buffer.concat(parts);if(bytes.length!==receipt.size||createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)throw new AppError(503,'KYC_STORAGE_RECEIPT_INVALID','The private file checksum no longer matches.');return bytes;
    }catch(error){destroy();if(error instanceof AppError)throw error;throw new AppError(503,'KYC_STORAGE_UNAVAILABLE','The private document stream could not be completed.');}finally{signal.removeEventListener('abort',abort);}
  }
  async remove(receipt:ObjectReceipt):Promise<void>{await this.send(new DeleteObjectCommand({Bucket:this.config.bucket,Key:receipt.key,VersionId:receipt.version}));}
}
/** Startup validates configured storage without printing credentials or endpoint details. */
export async function storageStartupValidation(env:NodeJS.ProcessEnv=process.env):Promise<{configured:boolean;validated:boolean}>{const config=readStorageConfig(env);if(!config)return{configured:false,validated:false};await new S3PrivateKycStorage(config).validate();return{configured:true,validated:true};}
