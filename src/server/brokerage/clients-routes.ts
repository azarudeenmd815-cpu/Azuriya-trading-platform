import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../domain/errors.js';
import { InvitationService } from '../domain/invitations.js';
import { scopeValues,scopeWhere,type BrokerageRouteContext } from './common.js';
import {
  BrokerageClientsService, assignmentRoles, clientCreateSchema, clientListSchema,
  clientPatchSchema, clientStatuses, consentSchema, documentPatchSchema, documentSchema,
  notePatchSchema, noteSchema, pageSchema, profileSchema, settingsSchema,
  tagPatchSchema, tagSchema, taskListSchema, taskPatchSchema, taskSchema,
} from './clients.js';

const admin = '/api/v1/instances/:instanceId/brokerage';
const portal = '/api/v1/client/instances/:instanceId/brokerage';
const paramsSchema = z.object({ instanceId: z.uuid(), id: z.uuid().optional(), noteId: z.uuid().optional(), tagId: z.uuid().optional() }).strict();
const params = (request: FastifyRequest) => paramsSchema.parse(request.params);
const noBody = (request: FastifyRequest) => { if (request.body!==undefined && !(typeof request.body==='object' && request.body!==null && Object.keys(request.body).length===0)) throw new AppError(400,'VALIDATION_ERROR','This action does not accept a payload.'); };

export function registerBrokerageClientRoutes(app: FastifyInstance, context: BrokerageRouteContext): void {
  const service = new BrokerageClientsService(context.db);
  app.get(`${admin}/clients`,async request => {
    params(request); const scope = await context.staff(request,'brokerage.clients.read');
    return service.list(scope,clientListSchema.parse(request.query));
  });
  app.post(`${admin}/clients`,async (request,reply) => {
    params(request); const scope = await context.staff(request,'brokerage.clients.write',true); const input = clientCreateSchema.parse(request.body);
    const data = await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).create(scope,input)); reply.code(201); return { data };
  });
  app.get(`${admin}/clients/:id`,async request => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.clients.read');
    return { data: await service.get(scope,id!) };
  });
  app.patch(`${admin}/clients/:id`,async (request,reply) => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.clients.write',true); const input = clientPatchSchema.parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).update(scope,id!,input)) };
  });
  app.post(`${admin}/clients/:id/status`,async (request,reply) => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.clients.write',true);
    const input = z.object({ status: z.enum(clientStatuses),reason: z.string().trim().min(3).max(1000) }).strict().parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).changeStatus(scope,id!,input.status,input.reason)) };
  });
  app.post(`${admin}/clients/:id/invite`,async (request,reply) => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.clients.write',true);
    await context.staff(request,'staff.write',true);
    const input = z.object({ expires_in_hours: z.number().int().min(1).max(168).optional() }).strict().parse(request.body ?? {});
    const data = await context.atomic(request,reply,scope,async bound => {
      const clients = new BrokerageClientsService(bound); const client = await clients.get(scope,id!);
      if (client.user_id || !['lead','invited'].includes(String(client.status))) throw new AppError(409,'CLIENT_INVITATION_UNAVAILABLE','Invite an unlinked lead or invited client.');
      const invite = await new InvitationService(bound,request.trustedOrigin ?? 'http://127.0.0.1:5173',process.env.NODE_ENV==='production').create(scope,{ email: String(client.email),kind: 'client',...input });
      if (client.status==='lead') await clients.changeStatus(scope,id!,'invited','Client invitation issued'); return invite;
    });
    reply.code(201); return { data };
  });
  app.get(`${admin}/clients/:id/activity`,async request => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.clients.read');
    return service.activity(scope,id!,pageSchema.parse(request.query));
  });
  app.get(`${admin}/clients/:id/consents`,async request => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.clients.read'); const page = pageSchema.parse(request.query);
    return context.db.transaction(scope,async tx => {
      const values = [...scopeValues(scope),id!];
      if (!(await tx.query(`SELECT id FROM brokerage_clients WHERE ${scopeWhere()} AND id=$5`,values)).rows[0]) throw new AppError(404,'NOT_FOUND','The client was not found in this workspace.');
      const total = Number((await tx.query<{ total: string }>(`SELECT count(*) AS total FROM brokerage_consents WHERE ${scopeWhere()} AND client_id=$5`,values)).rows[0].total);
      const data = (await tx.query(`SELECT c.id,c.client_id,c.user_id,c.document_id,c.document_type,c.version,c.document_hash,c.accepted_at,d.title FROM brokerage_consents c JOIN brokerage_consent_documents d ON d.id=c.document_id AND d.organization_id=c.organization_id AND d.brand_id=c.brand_id AND d.environment_id=c.environment_id AND d.product_instance_id=c.product_instance_id WHERE ${scopeWhere('c')} AND c.client_id=$5 ORDER BY c.accepted_at DESC,c.id DESC LIMIT $6 OFFSET $7`,[...values,page.limit,page.offset])).rows;
      return { data,pagination: { total,limit: page.limit,offset: page.offset } };
    });
  });
  app.get(`${admin}/clients/:id/notes`,async request => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.notes.read');
    return { data: await service.notes(scope,id!) };
  });
  app.get(`${admin}/clients/:id/notes/history`,async request => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.notes.read');
    return service.noteHistories(scope,id!,pageSchema.parse(request.query));
  });
  app.get(`${admin}/clients/:id/notes/:noteId/history`,async request => {
    const { id,noteId } = params(request); const scope = await context.staff(request,'brokerage.notes.read');
    return { data: await service.noteHistory(scope,id!,noteId!) };
  });
  app.post(`${admin}/clients/:id/notes`,async (request,reply) => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.notes.write',true); const input = noteSchema.parse(request.body);
    const data = await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).createNote(scope,id!,input)); reply.code(201); return { data };
  });
  app.patch(`${admin}/clients/:id/notes/:noteId`,async (request,reply) => {
    const { id,noteId } = params(request); const scope = await context.staff(request,'brokerage.notes.write',true); const input = notePatchSchema.parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).updateNote(scope,id!,noteId!,input)) };
  });
  app.delete(`${admin}/clients/:id/notes/:noteId`,async (request,reply) => {
    const { id,noteId } = params(request); noBody(request); const scope = await context.staff(request,'brokerage.notes.write',true);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).deleteNote(scope,id!,noteId!)) };
  });
  app.get(`${admin}/tags`,async request => {
    params(request); const scope = await context.staff(request,'brokerage.clients.read'); return { data: await service.tags(scope) };
  });
  app.post(`${admin}/tags`,async (request,reply) => {
    params(request); const scope = await context.staff(request,'brokerage.clients.write',true); const input = tagSchema.parse(request.body);
    const data = await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).createTag(scope,input)); reply.code(201); return { data };
  });
  app.patch(`${admin}/tags/:id`,async (request,reply) => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.clients.write',true); const input = tagPatchSchema.parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).updateTag(scope,id!,input)) };
  });
  for (const method of ['post','delete'] as const) app[method](`${admin}/clients/:id/tags/:tagId`,async (request,reply) => {
    const { id,tagId } = params(request); noBody(request); const scope = await context.staff(request,'brokerage.clients.write',true);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).tagClient(scope,id!,tagId!,method==='post')) };
  });
  app.post(`${admin}/clients/:id/assignments`,async (request,reply) => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.clients.write',true);
    const input = z.object({ role: z.enum(assignmentRoles),staff_id: z.uuid().nullable() }).strict().parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).assign(scope,id!,input.role,input.staff_id)) };
  });
  app.get(`${admin}/tasks`,async request => {
    params(request); const scope = await context.staff(request,'brokerage.tasks.read'); return service.tasks(scope,taskListSchema.parse(request.query));
  });
  app.post(`${admin}/tasks`,async (request,reply) => {
    params(request); const scope = await context.staff(request,'brokerage.tasks.write',true); const input = taskSchema.parse(request.body);
    const data = await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).createTask(scope,input)); reply.code(201); return { data };
  });
  app.patch(`${admin}/tasks/:id`,async (request,reply) => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.tasks.write',true); const input = taskPatchSchema.parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).updateTask(scope,id!,input)) };
  });
  app.get(`${admin}/settings`,async request => {
    params(request); const scope = await context.staff(request,'brokerage.clients.read'); return { data: await service.settings(scope) };
  });
  for (const method of ['put','patch'] as const) app[method](`${admin}/settings`,async (request,reply) => {
    params(request); const scope = await context.staff(request,'brokerage.settings.write',true); const input = settingsSchema.parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).settings(scope,input)) };
  });
  app.get(`${admin}/consent-documents`,async request => {
    params(request); const scope = await context.staff(request,'brokerage.clients.read'); return { data: await service.documents(scope) };
  });
  app.post(`${admin}/consent-documents`,async (request,reply) => {
    params(request); const scope = await context.staff(request,'brokerage.settings.write',true); const input = documentSchema.parse(request.body);
    const data = await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).createDocument(scope,input)); reply.code(201); return { data };
  });
  app.patch(`${admin}/consent-documents/:id`,async (request,reply) => {
    const { id } = params(request); const scope = await context.staff(request,'brokerage.settings.write',true); const input = documentPatchSchema.parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).updateDocument(scope,id!,input)) };
  });
  app.get(`${portal}/profile`,async request => {
    params(request); const scope = await context.client(request); return { data: await service.profile(scope) };
  });
  app.patch(`${portal}/profile`,async (request,reply) => {
    params(request); const scope = await context.client(request,true); const input = profileSchema.parse(request.body);
    return { data: await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).saveProfile(scope,input)) };
  });
  app.get(`${portal}/onboarding`,async request => {
    params(request); const scope = await context.client(request); return { data: await service.onboarding(scope) };
  });
  app.post(`${portal}/consents`,async (request,reply) => {
    params(request); const scope = await context.client(request,true); const input = consentSchema.parse(request.body);
    const data = await context.atomic(request,reply,scope,bound => new BrokerageClientsService(bound).acceptConsent(scope,input,{ ip_address: request.ip,user_agent: request.headers['user-agent'] })); reply.code(201); return { data };
  });
}
