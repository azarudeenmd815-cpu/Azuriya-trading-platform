import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TenantContext } from '../../shared/types.js';
import type { BrokerageRouteContext } from '../brokerage/common.js';
import { validateIdempotency } from '../api/idempotency.js';
import { AppError } from '../domain/errors.js';
import { KycDocumentService, documentReviewSchema, legalHoldSchema, replacementDocumentSchema, retentionPolicySchema, type KycDocumentOptions } from './kyc-document-service.js';
import { KYC_MAX_FILE_BYTES } from './kyc-storage.js';

const documentId=(request:FastifyRequest)=>z.object({instanceId:z.uuid(),docId:z.uuid()}).strict().parse(request.params).docId;
const idempotency=(request:FastifyRequest)=>{if(!validateIdempotency(request))throw new AppError(400,'IDEMPOTENCY_KEY_REQUIRED','Supply an Idempotency-Key for document changes.');};
export function registerKycDocumentRoutes(app:FastifyInstance,context:BrokerageRouteContext,options:KycDocumentOptions={}):void{
  const service=new KycDocumentService(context.db,options);
  void app.register(async routes=>{
    routes.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:KYC_MAX_FILE_BYTES},(_request,body,done)=>done(null,body));
    for(const self of [false,true]){
      const base=self?'/api/v1/client/instances/:instanceId/brokerage':'/api/v1/instances/:instanceId/brokerage';
      const scope=(request:FastifyRequest,mutate=false)=>self?context.client(request,mutate):context.staff(request,mutate?'brokerage.kyc.review':'brokerage.kyc.read',mutate);
      const interactive=async(request:FastifyRequest,mutate=false)=>{const result=await scope(request,mutate);const principal=await context.auth.authenticate(request);if(principal.kind!=='session'||principal.user.core_role||result.core||result.supportGrantId)throw new AppError(403,'KYC_INTERACTIVE_ACCESS_REQUIRED','Private document bytes require an active business staff or client session.');return result;};
      routes.get(`${base}/kyc/documents`,async request=>{const query=z.object({case_id:z.uuid()}).strict().parse(request.query);return service.list(await scope(request),query.case_id,self);});
      const authorized=new WeakMap<FastifyRequest,TenantContext>();
      routes.put(`${base}/kyc/documents/:docId/upload`,{bodyLimit:KYC_MAX_FILE_BYTES,onRequest:async request=>{const tenant=await interactive(request,true);idempotency(request);if(request.headers['content-type']?.split(';')[0]!=='application/octet-stream')throw new AppError(415,'KYC_UPLOAD_CONTENT_TYPE','Use application/octet-stream for private file bytes.');await service.uploadGate(tenant,documentId(request),self);authorized.set(request,tenant);}},async(request,reply)=>{if(!Buffer.isBuffer(request.body))throw new AppError(400,'KYC_FILE_REQUIRED','Choose a document file.');const tenant=authorized.get(request)!;const data=await service.upload(tenant,documentId(request),request.body,self);reply.code(202);return{data};});
      routes.get(`${base}/kyc/documents/:docId/content`,async(request,reply)=>{const tenant=await interactive(request);const file=await service.content(tenant,documentId(request),self);await interactive(request);const ascii=file.filename.replace(/[^a-zA-Z0-9_. -]/g,'_').replace(/["\\]/g,'_');reply.header('Cache-Control','no-store, private').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox").header('Content-Disposition',`attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`).type(file.contentType);return reply.send(file.bytes);});
      routes.post(`${base}/kyc/documents/:docId/replacements`,async(request,reply)=>{const tenant=await interactive(request,true);const input=replacementDocumentSchema.parse(request.body);idempotency(request);return{data:await context.atomic(request,reply,tenant,bound=>new KycDocumentService(bound,options).registerReplacement(tenant,documentId(request),input,self))};});
      if(self)continue;
      routes.post(`${base}/kyc/documents/:docId/review`,async(request,reply)=>{const tenant=await context.staff(request,'brokerage.kyc.review',true);const input=documentReviewSchema.parse(request.body);await context.highRisk(request,tenant);idempotency(request);return{data:await context.atomic(request,reply,tenant,bound=>new KycDocumentService(bound,options).review(tenant,documentId(request),input))};});
      routes.get(`${base}/kyc/storage-policy`,async request=>({data:await service.getPolicy(await context.staff(request,'brokerage.kyc.read'))}));
      routes.put(`${base}/kyc/storage-policy`,async(request,reply)=>{const tenant=await context.staff(request,'brokerage.settings.write',true);const input=retentionPolicySchema.parse(request.body);await context.highRisk(request,tenant);idempotency(request);return{data:await context.atomic(request,reply,tenant,bound=>new KycDocumentService(bound,options).setPolicy(tenant,input))};});
      routes.put(`${base}/kyc/documents/:docId/hold`,async(request,reply)=>{const tenant=await context.staff(request,'brokerage.kyc.review',true);const input=legalHoldSchema.parse(request.body);await context.highRisk(request,tenant);idempotency(request);return{data:await context.atomic(request,reply,tenant,bound=>new KycDocumentService(bound,options).setHold(tenant,documentId(request),input))};});
      routes.delete(`${base}/kyc/documents/:docId`,async(request,reply)=>{const tenant=await context.staff(request,'brokerage.kyc.review',true);const input=z.object({reason:z.string().trim().min(3).max(500)}).strict().parse(request.body);await context.highRisk(request,tenant);idempotency(request);return{data:await context.atomic(request,reply,tenant,bound=>new KycDocumentService(bound,options).delete(tenant,documentId(request),input.reason))};});
    }
  });
}
