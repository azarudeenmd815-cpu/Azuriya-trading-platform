import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import { FoundationService } from '../domain/service.js';
import { Auth } from '../security/auth.js';
import { IdentityService } from '../security/identity.js';
import { Tenancy } from '../security/tenancy.js';
import { idempotent, idempotencyRoute, validateIdempotency } from './idempotency.js';
import type { Actor } from '../../shared/types.js';
import { DomainActivationService } from '../domain/domain-activation.js';
import * as v from './validation.js';
import { AppError } from '../domain/errors.js';

function params(request: FastifyRequest) { return z.object({ instanceId: v.uuid, id: v.uuid.optional() }).parse(request.params); }
function id(request: FastifyRequest) { return z.object({ id: v.uuid }).parse(request.params).id; }
export function registerRoutes(app: FastifyInstance, db: Database, auth: Auth, tenancy: Tenancy, runtime: { production: boolean; origin: string }) {
  const service = new FoundationService(db);
  const identity = new IdentityService(db);
  const prefix = '/api/v1';
  async function atomic<T>(request: FastifyRequest, reply: FastifyReply, actor: Actor, work: (bound: Database) => Promise<T>, secret = false) {
    const principal = await auth.authenticate(request);
    const outcome = await idempotent(db, actor, { key: validateIdempotency(request), route: idempotencyRoute(request), payload: request.body, credentialId: principal.key?.id, redactResponse: secret ? (result: T) => ({ ...result, secret: undefined, secret_replay_unavailable: true }) : undefined }, work);
    reply.header('Idempotency-Replayed', String(outcome.replayed)); return outcome.result;
  }
  app.post(`${prefix}/auth/login`, { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = v.loginSchema.parse(request.body);
    return auth.login(request, reply, input.email, input.password);
  });
  app.get(`${prefix}/auth/me`, async (request, reply) => {
    const principal = await auth.authenticate(request);
    if (principal.kind !== 'session') throw new AppError(403, 'SESSION_REQUIRED', 'Identity and membership discovery requires a user session.');
    reply.header('Cache-Control', 'no-store');
    return { data: { user: principal.user, csrf_token: principal.kind === 'session' ? request.cookies.azuriya_csrf : undefined, ...await tenancy.memberships(principal) } };
  });
  app.post(`${prefix}/auth/logout`, (request, reply) => auth.logout(request, reply));
  app.get(`${prefix}/core/overview`, async request => ({ data: await service.overview(await tenancy.core(request)) }));
  app.get(`${prefix}/core/infrastructure`, async request => {
    await tenancy.core(request);
    return db.transaction({ core: true }, async tx => {
      const number = async (sql: string) => Number((await tx.query<{ count: string }>(sql)).rows[0].count);
      return { data: {
        database: 'connected',
        unpublished_events: await number('SELECT count(*) FROM outbox_events WHERE published_at IS NULL'),
        outbox_worker: (await number("SELECT count(*) FROM worker_heartbeats WHERE status='running' AND seen_at>now()-interval '60 seconds'")) > 0 ? 'healthy' : 'not_running',
        outbox_processing: await number("SELECT count(*) FROM outbox_events WHERE state='processing'"),
        outbox_dead_letter: await number("SELECT count(*) FROM outbox_events WHERE state='dead_letter'"),
        outbox_oldest_pending_seconds: Number((await tx.query<{ lag: number }>("SELECT COALESCE(EXTRACT(EPOCH FROM now()-min(created_at)),0)::float8 AS lag FROM outbox_events WHERE state IN('pending','processing')")).rows[0].lag),
        webhook_pending: await number("SELECT count(*) FROM webhook_deliveries WHERE status IN('pending','failed','delivering')"),
        webhook_dead_letter: await number("SELECT count(*) FROM webhook_deliveries WHERE status='dead_letter'"),
        webhook_delivered: await number("SELECT count(*) FROM webhook_deliveries WHERE status='delivered'"),
        shared_rate_limiter: 'postgresql',
        catalog_providers: await number('SELECT count(*) FROM integration_providers'),
        available_connectors: await number('SELECT count(*) FROM integration_providers WHERE connector_available=true'),
        active_domains: await number("SELECT count(*) FROM domains WHERE status='active'"),
        ssl_provisioner: process.env.DOMAIN_PROVIDER_URL ? 'bridge_configured' : 'not_configured', edge_router: process.env.DOMAIN_PROVIDER_URL ? 'bridge_configured' : 'not_configured',
        secret_encryption: process.env.SECRET_ENCRYPTION_KEY ? 'key_configured' : 'not_configured',
      } };
    });
  });
  app.get(`${prefix}/core/system-settings`, async request => {
    await tenancy.core(request);
    return { data: { deployment_environment: runtime.production ? 'production' : 'development', application_origin: runtime.origin, session_duration_hours: 8, session_cookie_secure: runtime.production, session_cookie_same_site: 'strict', login_limit_per_minute: 8, request_limit_per_minute: 240, domain_cname_target: process.env.DOMAIN_CNAME_TARGET ?? 'not_configured', idempotency_replay: 'transactional_24_hour_retention', webhook_delivery: 'durable_worker', email_provider: process.env.EMAIL_API_KEY && process.env.EMAIL_FROM ? 'configured' : 'not_configured', core_mfa: runtime.production ? 'mandatory_totp' : 'optional_development', oauth_authorization_server: 'not_configured', proxy_headers: process.env.TRUSTED_PROXY_IPS ? 'explicit_allowlist' : 'not_trusted' } };
  });
  app.get(`${prefix}/core/users`, async request => {
    await tenancy.core(request);
    const query = v.listSchema.parse(request.query);
    const sortable = ['created_at', 'email', 'display_name', 'core_role', 'status'];
    const sort = query.sort ?? 'created_at';
    if (!sortable.includes(sort)) throw new AppError(400, 'INVALID_SORT', 'This field cannot be sorted.');
    return db.transaction({ core: true }, async tx => {
      const filter = query.search ? `%${query.search}%` : '%';
      const data = (await tx.query(`SELECT id,email,display_name,core_role,status,mfa_required,created_at FROM users WHERE (email ILIKE $1 OR display_name ILIKE $1) AND ($2='' OR status=$2) ORDER BY ${sort} ${query.direction} LIMIT $3 OFFSET $4`, [filter, query.status ?? '', query.limit, query.offset])).rows;
      const total = (await tx.query<{ total: string }>('SELECT count(*) AS total FROM users WHERE (email ILIKE $1 OR display_name ILIKE $1) AND ($2=\'\' OR status=$2)', [filter, query.status ?? ''])).rows[0].total;
      return { data, pagination: { total: Number(total), limit: query.limit, offset: query.offset } };
    });
  });
  app.post(`${prefix}/core/users`, async (request, reply) => {
    const actor = await tenancy.core(request, true);
    const input = v.userSchema.parse(request.body);
    reply.code(201);
    return { data: await atomic(request, reply, actor, bound => new IdentityService(bound).createUser(actor, input)) };
  });
  app.post(`${prefix}/core/client-memberships`, async (request, reply) => {
    const actor = await tenancy.core(request, true);
    const input = z.object({ user_id: v.uuid, product_instance_id: v.uuid }).strict().parse(request.body);
    reply.code(201);
    return { data: await identity.assignClient(actor, input) };
  });
  app.post(`${prefix}/core/staff-memberships`, async (request, reply) => {
    const actor = await tenancy.core(request, true);
    const input = z.object({ user_id: v.uuid, product_instance_id: v.uuid, role_id: v.uuid }).strict().parse(request.body);
    reply.code(201);
    return { data: await atomic(request, reply, actor, bound => new IdentityService(bound).assignStaff(actor, input)) };
  });
  app.get(`${prefix}/core/:resource`, async request => {
    const actor = await tenancy.core(request);
    const { resource } = z.object({ resource: z.string().max(80) }).parse(request.params);
    return service.coreList(resource, v.listSchema.parse(request.query), actor);
  });
  app.post(`${prefix}/core/organizations`, async (request, reply) => {
    const actor = await tenancy.core(request, true);
    const input = v.organizationSchema.parse(request.body);
    reply.code(201);
    return { data: await atomic(request, reply, actor, bound => new FoundationService(bound).createOrganization(actor, input)) };
  });
  app.patch(`${prefix}/core/organizations/:id`, async request => {
    const actor = await tenancy.core(request, true);
    const input = z.object({ name: z.string().min(1).max(120).optional(), status: z.enum(['active', 'suspended', 'disabled']).optional() }).strict().parse(request.body);
    return { data: await service.updateOrganization(actor, id(request), input) };
  });
  app.post(`${prefix}/core/product-instances`, async (request, reply) => {
    const actor = await tenancy.core(request, true);
    const input = v.provisionSchema.parse(request.body);
    reply.code(201);
    return { data: await atomic(request, reply, actor, bound => new FoundationService(bound).provision(actor, input)) };
  });
  app.patch(`${prefix}/core/integration-requests/:id`, async request => {
    const actor = await tenancy.core(request, true);
    return { data: await service.triageRequest(actor, id(request), v.triageSchema.parse(request.body)) };
  });
  app.put(`${prefix}/core/feature-flags/:key`, async request => {
    const actor = await tenancy.core(request, true);
    const { key } = z.object({ key: z.string().regex(/^[a-z0-9_.-]{1,100}$/) }).parse(request.params);
    const input = z.object({ enabled: z.boolean(), description: z.string().max(500).optional() }).strict().parse(request.body);
    return { data: await service.setFeatureFlag(actor, { key, ...input }) };
  });
  const base = `${prefix}/instances/:instanceId`;
  app.get(`${base}/context`, async request => {
    const principal = await auth.authenticate(request);
    const actor = await tenancy.tenant(request, params(request).instanceId);
    if (principal.kind === 'api' && (!actor.permissions.includes('overview.read') || !actor.permissions.includes('branding.read'))) throw new AppError(403, 'PERMISSION_DENIED', 'Reading portal context requires overview.read and branding.read scopes.');
    return { data: await tenancy.context(actor) };
  });
  app.get(`${base}/overview`, async request => ({ data: await service.overview(await tenancy.tenant(request, params(request).instanceId, 'overview.read')) }));
  app.get(`${base}/branding`, async request => ({ data: await service.branding(await tenancy.tenant(request, params(request).instanceId, 'branding.read')) }));
  app.patch(`${base}/branding`, async request => {
    const actor = await tenancy.tenant(request, params(request).instanceId, 'branding.write', true);
    return { data: await service.updateBranding(actor, v.brandingSchema.parse(request.body)) };
  });
  const resources: Record<string, [string, string]> = { domains: ['domains', 'domains.read'], integrations: ['integrations', 'integrations.read'], 'integration-connections': ['integration-connections', 'integrations.read'], 'integration-requests': ['integration-requests', 'integrations.read'], staff: ['staff', 'staff.read'], roles: ['roles', 'roles.read'], 'api-keys': ['api-keys', 'api.read'], 'api-applications': ['api-applications', 'api.read'], webhooks: ['webhooks', 'webhooks.read'], audit: ['audit', 'audit.read'], settings: ['settings', 'settings.read'] };
  for (const [path, [resource, permission]] of Object.entries(resources)) {
    app.get(`${base}/${path}`, async request => service.tenantList(await tenancy.tenant(request, params(request).instanceId, permission), resource, v.listSchema.parse(request.query)));
  }
  for (const [path, permission] of [['service-accounts', 'api.read'], ['webhook-deliveries', 'webhooks.read'], ['support-access', 'staff.read']]) {
    app.get(`${base}/${path}`, async request => service.tenantList(await tenancy.tenant(request, params(request).instanceId, permission), path, v.listSchema.parse(request.query)));
  }
  app.post(`${base}/domains`, async (request, reply) => {
    const actor = await tenancy.tenant(request, params(request).instanceId, 'domains.write', true);
    const input = v.domainSchema.parse(request.body); reply.code(201);
    return { data: await atomic(request, reply, actor, bound => new FoundationService(bound).createDomain(actor, input)) };
  });
  app.post(`${base}/domains/:id/verify`, async request => {
    const { instanceId, id } = params(request);
    return { data: await service.verifyDomain(await tenancy.tenant(request, instanceId, 'domains.write', true), id!) };
  });
  app.delete(`${base}/domains/:id`, async request => {
    const { instanceId, id } = params(request);
    const actor = await tenancy.tenant(request, instanceId, 'domains.write', true);
    const result = await service.disableDomain(actor, id!);
    try { await new DomainActivationService(db).disableDelivery(actor, id!); } catch { return { data: { ...result, provider_cleanup_pending: true } }; }
    return { data: result };
  });
  app.post(`${base}/domains/:id/rotate-challenge`, async request => { const { instanceId, id } = params(request); return { data: await new DomainActivationService(db).rotateChallenge(await tenancy.tenant(request, instanceId, 'domains.write', true), id!) }; });
  app.post(`${base}/domains/:id/reconcile`, async request => { const { instanceId, id } = params(request); return { data: await new DomainActivationService(db).reconcile(await tenancy.tenant(request, instanceId, 'domains.write', true), id!) }; });
  app.post(`${base}/integration-requests`, async (request, reply) => {
    const actor = await tenancy.tenant(request, params(request).instanceId, 'integrations.write', true);
    const input = v.integrationRequestSchema.parse(request.body); reply.code(201);
    return { data: await atomic(request, reply, actor, bound => new FoundationService(bound).requestIntegration(actor, input)) };
  });
  app.post(`${base}/api-keys`, async (request, reply) => {
    const actor = await tenancy.tenant(request, params(request).instanceId, 'api.write', true);
    const input = v.keySchema.parse(request.body); reply.header('Cache-Control', 'no-store').code(201);
    return { data: await atomic(request, reply, actor, bound => new FoundationService(bound).createApiKey(actor, input), true) };
  });
  app.delete(`${base}/api-keys/:id`, async request => {
    const { instanceId, id } = params(request);
    return { data: await service.revokeApiKey(await tenancy.tenant(request, instanceId, 'api.write', true), id!) };
  });
  app.post(`${base}/staff`, async (request, reply) => {
    const actor = await tenancy.tenant(request, params(request).instanceId, 'staff.write', true);
    reply.code(201);
    return { data: await service.addStaff(actor, v.staffSchema.parse(request.body)) };
  });
  app.patch(`${base}/staff/:id`, async request => {
    const { instanceId, id } = params(request);
    const actor = await tenancy.tenant(request, instanceId, 'staff.write', true);
    const input = z.object({ role_id: v.uuid.optional(), status: z.enum(['active', 'suspended', 'disabled']).optional() }).strict().parse(request.body);
    return { data: await service.updateStaff(actor, id!, input) };
  });
  app.post(`${base}/roles`, async (request, reply) => {
    const actor = await tenancy.tenant(request, params(request).instanceId, 'roles.write', true);
    reply.code(201);
    return { data: await service.createRole(actor, v.roleSchema.parse(request.body)) };
  });
  app.get(`${prefix}/client/instances/:instanceId/context`, async request => ({ data: await tenancy.client(request, params(request).instanceId) }));
  app.get(`${prefix}/client/profile`, async request => {
    const principal = await auth.authenticate(request);
    if (principal.kind !== 'session') throw new AppError(403, 'SESSION_REQUIRED', 'Client profiles require a user session.');
    return { data: principal.user };
  });
}
