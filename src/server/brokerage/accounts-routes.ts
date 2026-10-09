import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../domain/errors.js';
import { validateIdempotency } from '../api/idempotency.js';
import type { Database } from '../db/database.js';
import type { TenantContext } from '../../shared/types.js';
import type { BrokerageRouteContext } from './common.js';
import { BrokerageAccountsService,accountListSchema,offeringSchema,offeringPatchSchema,accountRequestSchema,accountStatusSchema,caseSchema,reviewSchema,documentSchema,connectionSchema,credentialSchema } from './accounts.js';

const staffBase='/api/v1/instances/:instanceId/brokerage';
const clientBase='/api/v1/client/instances/:instanceId/brokerage';
const params=(request:FastifyRequest)=>z.object({instanceId:z.uuid(),id:z.uuid().optional()}).strict().parse(request.params);
export function registerBrokerageAccountRoutes(app:FastifyInstance,context:BrokerageRouteContext):void {
  const service=new BrokerageAccountsService(context.db);
  async function mutation<T>(req:FastifyRequest,reply:FastifyReply,scope:TenantContext,work:(service:BrokerageAccountsService)=>Promise<T>){
    if(!validateIdempotency(req))throw new AppError(400,'IDEMPOTENCY_KEY_REQUIRED','Supply an Idempotency-Key for brokerage changes.');
    return {data:await context.atomic(req,reply,scope,(bound:Database)=>work(new BrokerageAccountsService(bound)))};
  }
  app.get(`${staffBase}/offerings`,async req=>service.listOfferings(await context.staff(req,'brokerage.accounts.read'),accountListSchema.parse(req.query)));
  app.post(`${staffBase}/offerings`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.accounts.write',true);const input=offeringSchema.parse(req.body);reply.code(201);return mutation(req,reply,scope,svc=>svc.createOffering(scope,input));});
  app.patch(`${staffBase}/offerings/:id`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.accounts.write',true);const input=offeringPatchSchema.parse(req.body);return mutation(req,reply,scope,svc=>svc.updateOffering(scope,params(req).id!,input));});
  app.get(`${staffBase}/accounts`,async req=>service.listAccounts(await context.staff(req,'brokerage.accounts.read'),accountListSchema.parse(req.query)));
  app.get(`${staffBase}/accounts/:id`,async req=>({data:await service.getAccount(await context.staff(req,'brokerage.accounts.read'),params(req).id!)}));
  app.post(`${staffBase}/accounts/requests`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.accounts.write',true);const input=accountRequestSchema.extend({client_id:z.uuid()}).strict().parse(req.body);reply.code(201);const {client_id,...command}=input;return mutation(req,reply,scope,svc=>svc.requestAccount(scope,command,client_id));});
  app.post(`${staffBase}/accounts/:id/status`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.accounts.write',true);const input=accountStatusSchema.parse(req.body);await context.highRisk(req,scope);return mutation(req,reply,scope,svc=>svc.changeAccountStatus(scope,params(req).id!,input));});
  app.get(`${staffBase}/kyc`,async req=>service.listKyc(await context.staff(req,'brokerage.kyc.read'),accountListSchema.parse(req.query)));
  app.post(`${staffBase}/kyc/cases`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.kyc.review',true);const {client_id,...input}=caseSchema.extend({client_id:z.uuid()}).strict().parse(req.body);reply.code(201);return mutation(req,reply,scope,svc=>svc.createKycCase(scope,input,client_id));});
  app.post(`${staffBase}/kyc/:id/review`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.kyc.review',true);const input=reviewSchema.parse(req.body);await context.highRisk(req,scope);return mutation(req,reply,scope,svc=>svc.reviewKyc(scope,params(req).id!,input));});
  app.get(`${staffBase}/kyc/:id/documents`,async req=>({data:await service.listDocuments(await context.staff(req,'brokerage.kyc.read'),params(req).id!)}));
  app.post(`${staffBase}/kyc/documents`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.kyc.review',true);const input=documentSchema.parse(req.body);reply.code(201);return mutation(req,reply,scope,svc=>svc.addDocument(scope,input));});
  app.get(`${staffBase}/connections`,async req=>service.listConnections(await context.staff(req,'brokerage.connections.read'),accountListSchema.parse(req.query)));
  app.post(`${staffBase}/connections`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.connections.write',true);const input=connectionSchema.parse(req.body);if(input.credentials)await context.highRisk(req,scope);reply.code(201);return mutation(req,reply,scope,svc=>svc.createConnection(scope,input));});
  app.post(`${staffBase}/connections/:id/rotate`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.connections.write',true);const input=z.object({credentials:credentialSchema}).strict().parse(req.body);await context.highRisk(req,scope);return mutation(req,reply,scope,svc=>svc.rotateConnection(scope,params(req).id!,input.credentials));});
  app.delete(`${staffBase}/connections/:id`,async(req,reply)=>{const scope=await context.staff(req,'brokerage.connections.write',true);z.object({}).strict().parse(req.body??{});await context.highRisk(req,scope);return mutation(req,reply,scope,svc=>svc.disconnect(scope,params(req).id!));});
  app.get(`${clientBase}/offerings`,async req=>service.listOfferings(await context.client(req),accountListSchema.omit({client_id:true}).parse(req.query),true));
  app.get(`${clientBase}/accounts`,async req=>service.listAccounts(await context.client(req),accountListSchema.omit({client_id:true}).parse(req.query),true));
  app.get(`${clientBase}/accounts/:id`,async req=>({data:await service.getAccount(await context.client(req),params(req).id!,true)}));
  app.post(`${clientBase}/accounts/requests`,async(req,reply)=>{const scope=await context.client(req,true);const input=accountRequestSchema.parse(req.body);reply.code(201);return mutation(req,reply,scope,svc=>svc.requestAccount(scope,input));});
  app.get(`${clientBase}/verification`,async req=>({data:await service.verification(await context.client(req))}));
  app.post(`${clientBase}/kyc/cases`,async(req,reply)=>{const scope=await context.client(req,true);const input=caseSchema.parse(req.body??{});reply.code(201);return mutation(req,reply,scope,svc=>svc.createKycCase(scope,input));});
  app.post(`${clientBase}/kyc/documents`,async(req,reply)=>{const scope=await context.client(req,true);const input=documentSchema.parse(req.body);reply.code(201);return mutation(req,reply,scope,svc=>svc.addDocument(scope,input,true));});
}
