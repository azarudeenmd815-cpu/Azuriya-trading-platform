import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/database.js';
import { DatabaseDomainResolver, type ActiveDomainMapping } from '../domain/domain-delivery.js';
import { AppError } from '../domain/errors.js';
declare module 'fastify' { interface FastifyRequest { trustedOrigin?: string; domainMapping?: ActiveDomainMapping; metricStart?: number } }
export function registerHostRouting(app: FastifyInstance, db: Database, origin: string, strict: boolean) {
  const core = new URL(origin); const resolver = new DatabaseDomainResolver(db);
  app.decorateRequest('trustedOrigin', undefined); app.decorateRequest('domainMapping', undefined);
  app.addHook('onRequest', async (request, reply) => {
    const hostname = request.hostname.toLowerCase().replace(/\.$/, '');
    if (!strict || hostname === core.hostname.toLowerCase()) { request.trustedOrigin = origin; }
    else {
      let mapping: ActiveDomainMapping | null;
      try { mapping = await resolver.resolve(hostname); } catch { throw new AppError(421, 'UNKNOWN_HOST', 'This hostname is unavailable.'); }
      if (!mapping) throw new AppError(421, 'UNKNOWN_HOST', 'This hostname is unavailable.');
      request.domainMapping = mapping; request.trustedOrigin = `https://${mapping.hostname}`;
    }
    if (strict && request.protocol !== 'https' && request.trustedOrigin.startsWith('https:') && !request.url.startsWith('/health/')) return reply.code(308).header('Location', `${request.trustedOrigin}${request.url.startsWith('/') && !request.url.startsWith('//') ? request.url : '/'}`).send();
    const path = request.url.split('?')[0];
    if (request.domainMapping) {
      if (path.startsWith('/api/v1/core/')) throw new AppError(403, 'CORE_HOST_REQUIRED', 'Core administration is unavailable on this hostname.');
      const match = path.match(/^\/api\/v1\/(?:client\/)?instances\/([^/]+)/);
      if (match && match[1] !== request.domainMapping.product_instance_id) throw new AppError(403, 'HOST_SCOPE_MISMATCH', 'This product instance does not belong to this hostname.');
      if (request.domainMapping.application_type === 'client_portal' && path.startsWith('/api/v1/instances/')) throw new AppError(403, 'APPLICATION_HOST_MISMATCH', 'This hostname serves a client application.');
      if (request.domainMapping.application_type === 'admin_portal' && path.startsWith('/api/v1/client/')) throw new AppError(403, 'APPLICATION_HOST_MISMATCH', 'This hostname serves an administration application.');
    }
  });
  app.get('/api/v1/host-context', async request => {
    if (!request.domainMapping) return { data: { kind: 'core' } };
    const mapping = request.domainMapping;
    const brand = await db.transaction({ organizationId: mapping.organization_id }, async tx => (await tx.query('SELECT id,name,config FROM brands WHERE id=$1 AND organization_id=$2', [mapping.brand_id, mapping.organization_id])).rows[0]);
    return { data: { kind: 'tenant', ...mapping, brand } };
  });
}
