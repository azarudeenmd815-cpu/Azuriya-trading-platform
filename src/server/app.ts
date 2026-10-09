import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import staticPlugin from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { Database } from './db/database.js';
import { AppError } from './domain/errors.js';
import { Auth } from './security/auth.js';
import { Tenancy } from './security/tenancy.js';
import { registerRoutes } from './api/routes.js';
import { registerActivationRoutes } from './api/activation-routes.js';
import { PostgresRateLimiter } from './security/rate-limiter.js';
import { registerHostRouting } from './security/host-routing.js';
import { Metrics } from './observability.js';
import { hashSecret } from './security/crypto.js';
import { registerIdentityRoutes } from './api/identity-routes.js';
import { registerInvitationRoutes } from './api/invitation-routes.js';
import { registerBrokerageRoutes } from './brokerage/routes.js';
import { brokerageContext } from './brokerage/common.js';
import { registerConnectorRoutes } from './connectors/routes.js';
import { registerProviderCallbacks } from './connectors/callbacks.js';
import { registerKycDocumentRoutes } from './connectors/kyc-document-routes.js';

export interface AppOptions { db: Database; origin: string; production: boolean; logger?: boolean; webRoot?: string; strictHosts?: boolean; trustedProxies?: string[]; requireWorker?: boolean; requireCoreMfa?: boolean }
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, logController: new LogController({ disableRequestLogging: true }), trustProxy: options.trustedProxies?.length ? options.trustedProxies : false, bodyLimit: 256 * 1024, requestTimeout: 30_000, genReqId: request => {
    const supplied = request.headers['x-request-id'];
    return typeof supplied === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : `req_${randomUUID()}`;
  } });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'https:', 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } });
  const limiter = new PostgresRateLimiter(options.db); const metrics = new Metrics();
  registerHostRouting(app, options.db, options.origin, options.strictHosts ?? options.production);
  app.addHook('onRequest', async (request, reply) => {
    request.metricStart = metrics.start();
    if (!request.url.startsWith('/api/') || !request.routeOptions.url) return;
    const endpoint = request.url.split('?')[0];
    const authRoute = endpoint.startsWith('/api/v1/auth/');
    const policies = [{ key: `ip:${request.ip}`, limit: 240, windowSeconds: 60 }];
    if (authRoute) policies.push({ key: `auth:${request.ip}:${endpoint}`, limit: endpoint.endsWith('/login') ? 8 : 20, windowSeconds: 60 });
    if (request.headers.authorization) policies.push({ key: `credential:${hashSecret(request.headers.authorization)}`, limit: 120, windowSeconds: 60 });
    if (request.cookies.azuriya_session) policies.push({ key: `session:${hashSecret(request.cookies.azuriya_session)}`, limit: 180, windowSeconds: 60 });
    const instance = endpoint.match(/^\/api\/v1\/instances\/([a-f0-9-]{36})/i)?.[1];
    if (instance) policies.push({ key: `instance:${instance}`, limit: 600, windowSeconds: 60 });
    if (/\/domains\/[^/]+\/(verify|rotate-challenge|reconcile)$/.test(endpoint)) policies.push({ key: `domain:${instance}:${request.ip}`, limit: 10, windowSeconds: 60 });
    const result = await limiter.consume(policies);
    reply.header('RateLimit-Limit', result.limit).header('RateLimit-Remaining', result.remaining).header('RateLimit-Reset', result.reset);
  });
  app.addHook('onRequest', async (request, reply) => { reply.header('X-Request-ID', request.id); if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store'); });
  app.addHook('onResponse', async (request, reply) => { metrics.observe(request.routeOptions.url ?? 'unmatched', reply.statusCode, request.metricStart ?? metrics.start()); app.log.info({ request_id: request.id, method: request.method, route: request.routeOptions.url, status: reply.statusCode }, 'request completed'); });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })), request_id: request.id } });
    if (error instanceof AppError) { if (error.statusCode === 429) reply.header('Retry-After', 60); return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details ?? [], request_id: request.id } }); }
    const err = error as { code?: string; statusCode?: number };
    if (err.code === '23505') return reply.code(409).send({ error: { code: 'CONFLICT', message: 'A record with this unique value already exists.', details: [], request_id: request.id } });
    if (err.code === '23503' || err.code === '23514' || err.code === '22P02') return reply.code(400).send({ error: { code: 'INVALID_REFERENCE', message: 'The record references an unavailable or incompatible resource.', details: [], request_id: request.id } });
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    app.log.error({ request_id: request.id, code: err.code ?? 'UNEXPECTED_ERROR', route: request.routeOptions.url }, 'request failed');
    return reply.code(status).send({ error: { code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message: status === 500 ? 'The request could not be completed.' : 'The request is invalid.', details: [], request_id: request.id } });
  });
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await options.db.query('SELECT 1');
      await limiter.consume([{ key: 'readiness', limit: 1000000, windowSeconds: 60 }]);
      const heartbeat = await options.db.transaction({ core: true }, tx => tx.query("SELECT id FROM worker_heartbeats WHERE status='running' AND seen_at>now()-interval '60 seconds'"));
      if ((options.requireWorker ?? options.production) && !heartbeat.rows.length) { reply.code(503); return { status: 'not_ready', database: 'healthy', limiter: 'healthy', worker: 'unavailable' }; }
      return { status: 'ready', database: 'healthy', limiter: 'healthy', queue: heartbeat.rows.length ? 'worker_healthy' : 'worker_not_running', connectors: 'configured_per_workspace' };
    }
    catch { reply.code(503); return { status: 'not_ready', database: 'unavailable' }; }
  });
  const auth = new Auth(options.db, options.production, options.origin, options.requireCoreMfa ?? options.production);
  const tenancy = new Tenancy(options.db, auth, async context => { await limiter.consume([{ key: `organization:${context.organizationId}:environment:${context.environmentId}`, limit: 1200, windowSeconds: 60 }]); });
  registerRoutes(app, options.db, auth, tenancy, { production: options.production, origin: options.origin });
  registerActivationRoutes(app, options.db, auth, tenancy);
  registerIdentityRoutes(app, options.db, auth, options.requireCoreMfa ?? options.production);
  registerInvitationRoutes(app, options.db, auth, tenancy, options.origin, options.production);
  registerBrokerageRoutes(app, options.db, auth, tenancy);
  const connectorContext = brokerageContext(options.db, auth, tenancy);
  registerConnectorRoutes(app, connectorContext);
  registerKycDocumentRoutes(app, connectorContext);
  registerProviderCallbacks(app, options.db, options.origin);
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url.startsWith('/api/v1/auth/') || request.routeOptions.url === '/api/v1/host-context' || !request.routeOptions.url || (!request.cookies.azuriya_session && !request.headers.authorization)) return;
    const principal = await auth.authenticate(request);
    const dimensions = [{ key: `user:${principal.user.id}`, limit: 240, windowSeconds: 60 }];
    if (request.domainMapping?.application_type === 'client_portal') dimensions.push({ key: `organization:${request.domainMapping.organization_id}:environment:${request.domainMapping.environment_id}`, limit: 1200, windowSeconds: 60 });
    const result = await limiter.consume(dimensions); reply.header('RateLimit-Remaining', result.remaining);
  });
  app.get('/api/v1/core/metrics', async request => { await tenancy.core(request); return { data: { requests: metrics.snapshot(), database: options.db.metrics?.() ?? null } }; });
  if (options.webRoot) await app.register(staticPlugin, { root: options.webRoot, prefix: '/', wildcard: false, list: false });
  app.setNotFoundHandler((request, reply) => {
    if (options.webRoot && (request.method === 'GET' || request.method === 'HEAD') && !request.url.startsWith('/api/') && !request.url.startsWith('/health/')) return reply.sendFile('index.html');
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'The requested route does not exist.', details: [], request_id: request.id } });
  });
  return app;
}
