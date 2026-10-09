import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { permissions, type TenantContext } from '../../shared/types.js';
import type { Database } from '../db/database.js';
import type { Auth } from '../security/auth.js';
import type { Tenancy } from '../security/tenancy.js';
import { ActivationService } from '../domain/activation-service.js';
import { idempotent, idempotencyRoute, validateIdempotency } from './idempotency.js';
import * as v from './validation.js';
import { AppError } from '../domain/errors.js';
const scopes = z.array(z.enum(permissions)).min(1).max(permissions.length);
const name = z.string().trim().min(1).max(120);
function params(req: FastifyRequest) { return z.object({ instanceId: v.uuid, id: v.uuid.optional() }).parse(req.params); }
export function registerActivationRoutes(app: FastifyInstance, db: Database, auth: Auth, tenancy: Tenancy) {
  const base = '/api/v1/instances/:instanceId';
  const actor = (req: FastifyRequest, permission: string) => tenancy.tenant(req, params(req).instanceId, permission, true);
  app.get(`${base}/support-candidates`, async req => { await tenancy.tenant(req, params(req).instanceId, 'staff.write'); return db.transaction({ core: true }, async tx => ({ data: (await tx.query("SELECT id,display_name FROM users WHERE core_role='super_admin' AND status='active' ORDER BY display_name LIMIT 100")).rows })); });
  app.get(`${base}/security-policy`, async req => { const context = await tenancy.tenant(req, params(req).instanceId, 'settings.read'); return db.transaction({ organizationId: context.organizationId }, async tx => ({ data: (await tx.query('SELECT require_staff_mfa,role_ids,user_ids,updated_at FROM security_policies WHERE organization_id=$1 AND product_instance_id=$2', [context.organizationId, context.productInstanceId])).rows[0] ?? { require_staff_mfa: false, role_ids: [], user_ids: [] } })); });
  app.put(`${base}/security-policy`, async req => {
    const context = await actor(req, 'settings.write'); const input = z.object({ require_staff_mfa: z.boolean(), role_ids: z.array(v.uuid).max(100).default([]), user_ids: z.array(v.uuid).max(100).default([]) }).strict().parse(req.body);
    if (context.supportGrantId) throw new AppError(403, 'SUPPORT_DELEGATION_DENIED', 'A tenant administrator must manage security policy.');
    return db.transaction({ organizationId: context.organizationId }, async tx => {
      for (const id of input.role_ids) if (!(await tx.query('SELECT id FROM roles WHERE id=$1 AND organization_id=$2', [id, context.organizationId])).rows[0]) throw new AppError(422, 'INVALID_ROLE', 'Choose a role belonging to this tenant.');
      for (const id of input.user_ids) if (!(await tx.query('SELECT id FROM staff_memberships WHERE user_id=$1 AND organization_id=$2 AND status=\'active\' AND(environment_id IS NULL OR environment_id=$3) AND(product_instance_id IS NULL OR product_instance_id=$4)', [id, context.organizationId, context.environmentId, context.productInstanceId])).rows[0]) throw new AppError(422, 'INVALID_USER', 'Choose an active staff member in this workspace.');
      await tx.query('INSERT INTO security_policies(organization_id,brand_id,environment_id,product_instance_id,require_staff_mfa,role_ids,user_ids,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(product_instance_id) DO UPDATE SET require_staff_mfa=$5,role_ids=$6,user_ids=$7,updated_by=$8,updated_at=now()', [context.organizationId, context.brandId, context.environmentId, context.productInstanceId, input.require_staff_mfa, JSON.stringify(input.role_ids), JSON.stringify(input.user_ids), context.userId]);
      await new ActivationService(db).audit(tx, context, 'security_policy.updated', 'security_policy', context.productInstanceId); return { data: input };
    });
  });
  app.get(`${base}/webhook-deliveries/:id/attempts`, async req => { const context = await tenancy.tenant(req, params(req).instanceId, 'webhooks.read'); return db.transaction({ organizationId: context.organizationId }, async tx => ({ data: (await tx.query('SELECT a.id,a.attempt_number,a.response_status,a.error_code,a.started_at,a.completed_at FROM webhook_attempts a JOIN webhook_deliveries d ON d.id=a.delivery_id AND d.organization_id=a.organization_id WHERE a.delivery_id=$1 AND d.organization_id=$2 AND d.brand_id=$3 AND d.environment_id=$4 AND d.product_instance_id=$5 ORDER BY a.started_at DESC LIMIT 100', [params(req).id, context.organizationId, context.brandId, context.environmentId, context.productInstanceId])).rows })); });
  async function run<T>(req: FastifyRequest, reply: FastifyReply, context: TenantContext, work: (service: ActivationService) => Promise<T>, secret = false) {
    const principal = await auth.authenticate(req);
    const result = await idempotent(db, context, { key: validateIdempotency(req), route: idempotencyRoute(req), credentialId: principal.key?.id, payload: req.body ?? {}, redactResponse: secret ? (value: T) => ({ ...value, secret: undefined, secret_replay_unavailable: true }) : undefined }, bound => work(new ActivationService(bound)));
    reply.header('Idempotency-Replayed', String(result.replayed)).header('Cache-Control', 'no-store'); return { data: result.result };
  }
  app.post(`${base}/api-applications`, async (req, reply) => { const context = await actor(req, 'api.write'); const input = z.object({ name, scopes }).strict().parse(req.body); reply.code(201); return run(req, reply, context, service => service.createApplication(context, input)); });
  app.patch(`${base}/api-applications/:id`, async (req, reply) => { const context = await actor(req, 'api.write'); const input = z.object({ name: name.optional(), status: z.enum(['active', 'disabled']).optional(), scopes: scopes.optional() }).strict().parse(req.body); return run(req, reply, context, service => service.updateApplication(context, params(req).id!, input)); });
  app.post(`${base}/service-accounts`, async (req, reply) => { const context = await actor(req, 'api.write'); const input = v.keySchema.parse(req.body); reply.code(201); return run(req, reply, context, service => service.createAccount(context, input), true); });
  app.post(`${base}/service-accounts/:id/rotate`, async (req, reply) => { const context = await actor(req, 'api.write'); return run(req, reply, context, service => service.rotateAccount(context, params(req).id!), true); });
  app.delete(`${base}/service-accounts/:id`, async (req, reply) => { const context = await actor(req, 'api.write'); return run(req, reply, context, service => service.revokeAccount(context, params(req).id!)); });
  app.post(`${base}/webhooks`, async (req, reply) => {
    const context = await actor(req, 'webhooks.write');
    const input = z.object({ name, url: z.url().max(2048), events: z.array(z.string().regex(/^(\*|[a-z][a-z0-9_.]*)$/).max(100)).min(1).max(50), application_id: v.uuid.optional(), disable_after_failures: z.number().int().min(1).max(100).optional() }).strict().parse(req.body);
    reply.code(201); return run(req, reply, context, service => service.createWebhook(context, input), true);
  });
  app.patch(`${base}/webhooks/:id`, async (req, reply) => { const context = await actor(req, 'webhooks.write'); const { status } = z.object({ status: z.enum(['active', 'disabled']) }).strict().parse(req.body); return run(req, reply, context, service => service.updateWebhook(context, params(req).id!, status), true); });
  app.post(`${base}/webhooks/:id/rotate`, async (req, reply) => { const context = await actor(req, 'webhooks.write'); return run(req, reply, context, service => service.updateWebhook(context, params(req).id!, 'active', true), true); });
  app.post(`${base}/webhook-deliveries/:id/replay`, async (req, reply) => { const context = await actor(req, 'webhooks.write'); return run(req, reply, context, service => service.replayDelivery(context, params(req).id!)); });
  app.post(`${base}/support-access`, async (req, reply) => { const context = await actor(req, 'staff.write'); const input = z.object({ user_id: v.uuid, reason: z.string().trim().min(10).max(1000), scopes, expires_at: z.iso.datetime() }).strict().parse(req.body); reply.code(201); return run(req, reply, context, service => service.grantSupport(context, input)); });
  app.delete(`${base}/support-access/:id`, async (req, reply) => { const context = await actor(req, 'staff.write'); return run(req, reply, context, service => service.revokeSupport(context, params(req).id!)); });
}
