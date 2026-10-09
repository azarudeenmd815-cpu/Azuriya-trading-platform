import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import type { Auth } from '../security/auth.js';
import type { Tenancy } from '../security/tenancy.js';
import { InvitationService } from '../domain/invitations.js';
import { idempotent, validateIdempotency } from './idempotency.js';
import * as v from './validation.js';
import { listRows } from '../domain/lists.js';
import { AppError } from '../domain/errors.js';
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export function registerInvitationRoutes(app: FastifyInstance, db: Database, auth: Auth, tenancy: Tenancy, origin: string, production: boolean) {
  const params = (req: FastifyRequest) => z.object({ instanceId: v.uuid, id: v.uuid.optional() }).parse(req.params);
  const service = new InvitationService(db, origin, production); const base = '/api/v1/instances/:instanceId/invitations';
  app.get(base, async req => {
    const actor = await tenancy.tenant(req, params(req).instanceId, 'staff.read'); const query = v.listSchema.parse(req.query);
    return db.transaction({ organizationId: actor.organizationId }, async tx => {
      return listRows(tx, { table: 'invitations', columns: ['id','organization_id','email','kind','role_id','expires_at','accepted_at','revoked_at','created_at'], search: ['email'], status: "CASE WHEN r.revoked_at IS NOT NULL THEN 'revoked' WHEN r.accepted_at IS NOT NULL THEN 'accepted' WHEN r.expires_at<=now() THEN 'expired' ELSE 'pending' END", extras: ",CASE WHEN r.revoked_at IS NOT NULL THEN 'revoked' WHEN r.accepted_at IS NOT NULL THEN 'accepted' WHEN r.expires_at<=now() THEN 'expired' ELSE 'pending' END AS status" }, query, ['r.organization_id=$1','r.brand_id=$2','r.environment_id=$3','r.product_instance_id=$4'], [actor.organizationId, actor.brandId, actor.environmentId, actor.productInstanceId]);
    });
  });
  app.post(base, async (req, reply) => {
    const actor = await tenancy.tenant(req, params(req).instanceId, 'staff.write', true);
    const input = z.object({ email: v.email, kind: z.enum(['staff', 'client']), role_id: v.uuid.optional(), expires_in_hours: z.number().int().min(1).max(168).optional() }).strict().parse(req.body);
    const principal = await auth.authenticate(req);
    const outcome = await idempotent(db, actor, { key: validateIdempotency(req), route: base, payload: input, credentialId: principal.key?.id }, bound => new InvitationService(bound, req.trustedOrigin ?? origin, production).create(actor, input));
    reply.code(201).header('Idempotency-Replayed', String(outcome.replayed)); return { data: outcome.result };
  });
  for (const action of ['rotate', 'revoke'] as const) app.post(`${base}/:id/${action}`, async (req, reply) => {
    const actor = await tenancy.tenant(req, params(req).instanceId, 'staff.write', true); const principal = await auth.authenticate(req);
    if (req.body !== undefined) throw new AppError(400, 'VALIDATION_ERROR', 'This action does not accept a payload.');
    const result = await idempotent(db, actor, { key: validateIdempotency(req), route: `${action}:${params(req).id}`, payload: {}, credentialId: principal.key?.id }, bound => new InvitationService(bound, req.trustedOrigin ?? origin, production).change(actor, params(req).id!, action === 'rotate'));
    reply.header('Idempotency-Replayed', String(result.replayed)); return { data: result.result };
  });
  app.post('/api/v1/auth/invitations/inspect', async req => { auth.validateOrigin(req); const input = z.object({ token }).strict().parse(req.body); return { data: await service.inspect(input.token, req.domainMapping?.product_instance_id, req.domainMapping?.application_type) }; });
  app.post('/api/v1/auth/invitations/accept', async req => { auth.validateOrigin(req); const input = z.object({ token, password: v.password, display_name: z.string().trim().min(1).max(120) }).strict().parse(req.body); return { data: await service.accept(input.token, input, req.id, req.domainMapping?.product_instance_id, req.domainMapping?.application_type) }; });
}
