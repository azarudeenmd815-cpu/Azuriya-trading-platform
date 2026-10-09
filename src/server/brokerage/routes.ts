import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import type { Auth } from '../security/auth.js';
import type { Tenancy } from '../security/tenancy.js';
import type { TenantContext } from '../../shared/types.js';
import { brokerageContext, recordEvent, scopeValues, scopeWhere } from './common.js';
import { registerBrokerageClientRoutes } from './clients-routes.js';
import { registerBrokerageAccountRoutes } from './accounts-routes.js';
import { registerBrokerageFinanceRoutes } from './finance-routes.js';
import { templateVariables, validateTemplate } from './communications.js';
import { AppError } from '../domain/errors.js';

const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(1000000).default(0), search: z.string().max(120).optional(), status: z.string().max(60).optional(), sort: z.string().optional(), direction: z.enum(['asc','desc']).optional() });
const dateQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).refine(v => !v.from || !v.to || v.from<=v.to, 'Start date must precede end date.');
const templateSchema = z.object({ event_type: z.string().regex(/^brokerage\.[a-z0-9_.]+$/).max(100), subject: z.string().min(1).max(200), body: z.string().min(1).max(10000), enabled: z.boolean().default(true) }).strict();

export function registerBrokerageRoutes(app: FastifyInstance, db: Database, auth: Auth, tenancy: Tenancy) {
  const ctx = brokerageContext(db, auth, tenancy);
  registerBrokerageClientRoutes(app, ctx); registerBrokerageAccountRoutes(app, ctx); registerBrokerageFinanceRoutes(app, ctx);
  const admin = '/api/v1/instances/:instanceId/brokerage';
  const client = '/api/v1/client/instances/:instanceId/brokerage';
  async function summary(scope: TenantContext, range: { from?: string; to?: string }, report: boolean) {
    return db.transaction(scope, async tx => {
      const args = [...scopeValues(scope), range.from ?? null, range.to ?? null];
      const within = "AND ($5::date IS NULL OR created_at >= $5::date) AND ($6::date IS NULL OR created_at < $6::date+interval '1 day')";
      const groups = async (table: string, field: string) => (await tx.query(`SELECT ${field} AS status,count(*)::int AS count FROM ${table} WHERE ${scopeWhere()} ${within} GROUP BY ${field} ORDER BY ${field}`, args)).rows;
      const has = (permission: string) => report || scope.permissions.includes(permission);
      const clients = has('brokerage.clients.read') ? await groups('brokerage_clients','status') : [];
      const accounts = has('brokerage.accounts.read') ? await groups('brokerage_accounts','status') : [];
      const kyc = has('brokerage.kyc.read') ? await groups('brokerage_kyc_cases','status') : [];
      const partners = has('brokerage.partners.read') ? await groups('brokerage_partners','status') : [];
      const payments = has('brokerage.finance.read') ? (await tx.query(`SELECT kind,status,currency,count(*)::int AS count,sum(amount)::text AS amount FROM brokerage_payment_requests WHERE ${scopeWhere()} ${within} GROUP BY kind,status,currency ORDER BY kind,status,currency`, args)).rows : [];
      const tasks = has('brokerage.tasks.read') ? await groups('brokerage_tasks','status') : [];
      return { clients, accounts, kyc, payments, partners, tasks, range, provider_balances_available: false };
    });
  }
  app.get(`${admin}/dashboard`, async request => ({ data: await summary(await ctx.staff(request,'overview.read'),dateQuery.parse(request.query),false) }));
  app.get(`${admin}/reports`, async request => ({ data: await summary(await ctx.staff(request,'brokerage.reports.read'),dateQuery.parse(request.query),true) }));
  async function notifications(scope: TenantContext, query: z.infer<typeof pageQuery>, own: boolean) {
    return db.transaction(scope, async tx => {
      const args = [...scopeValues(scope), own ? scope.userId : null, query.limit, query.offset];
      const filter = `${scopeWhere()} AND ($5::uuid IS NULL OR recipient_user_id=$5)`;
      const data = (await tx.query(`SELECT id,event_type,resource_type,resource_id,message,read_at,created_at FROM brokerage_notifications WHERE ${filter} ORDER BY created_at DESC,id LIMIT $6 OFFSET $7`, args)).rows;
      const total = Number((await tx.query<{ count: string }>(`SELECT count(*) FROM brokerage_notifications WHERE ${filter}`, args.slice(0,5))).rows[0].count);
      return { data, pagination: { total,limit: query.limit,offset: query.offset } };
    });
  }
  app.get(`${admin}/notifications`, async request => notifications(await ctx.staff(request,'brokerage.communications.read'),pageQuery.parse(request.query),false));
  app.get(`${client}/notifications`, async request => notifications(await ctx.client(request),pageQuery.parse(request.query),true));
  app.post(`${client}/notifications/:id/read`, async (request,reply) => {
    const scope = await ctx.client(request,true); const { id } = z.object({ id:z.uuid() }).parse(request.params);
    return ctx.atomic(request,reply,scope,bound=>bound.transaction(scope,async tx=>{
      const row = (await tx.query(`UPDATE brokerage_notifications SET read_at=COALESCE(read_at,now()) WHERE ${scopeWhere()} AND id=$5 AND recipient_user_id=$6 RETURNING id,read_at`,[...scopeValues(scope),id,scope.userId])).rows[0];
      if (!row) throw new AppError(404,'NOT_FOUND','This notification is unavailable.'); return {data:row};
    }));
  });
  app.get(`${admin}/email-templates`, async request => {
    const scope = await ctx.staff(request,'brokerage.communications.read');
    return db.transaction(scope,async tx=>({data:(await tx.query(`SELECT id,event_type,subject,body,enabled,created_at,updated_at FROM brokerage_email_templates WHERE ${scopeWhere()} ORDER BY event_type`,scopeValues(scope))).rows,variables:templateVariables,delivery:process.env.EMAIL_API_KEY && process.env.EMAIL_FROM ? 'configured' : 'not_configured'}));
  });
  app.post(`${admin}/email-templates`,async(request,reply)=>{
    const scope=await ctx.staff(request,'brokerage.communications.write',true); const input=templateSchema.parse(request.body); validateTemplate(input.subject);validateTemplate(input.body);
    return ctx.atomic(request,reply,scope,bound=>bound.transaction(scope,async tx=>{
      const row=(await tx.query<{id:string}>(`INSERT INTO brokerage_email_templates(id,organization_id,brand_id,environment_id,product_instance_id,event_type,subject,body,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,brand_id,environment_id,product_instance_id,event_type) DO UPDATE SET subject=EXCLUDED.subject,body=EXCLUDED.body,enabled=EXCLUDED.enabled,updated_at=now() RETURNING id,event_type,subject,body,enabled`,[randomUUID(),...scopeValues(scope),input.event_type,input.subject,input.body,input.enabled])).rows[0];
      await recordEvent(tx,scope,'brokerage.template.saved','email_template',row.id,{event_type:input.event_type});return{data:row};
    }));
  });
}
