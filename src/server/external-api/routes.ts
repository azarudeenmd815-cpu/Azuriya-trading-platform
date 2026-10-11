import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import type { Auth } from '../security/auth.js';
import type { Tenancy } from '../security/tenancy.js';
import type { TenantContext } from '../../shared/types.js';
import { authenticateExternal } from './auth.js';
import { ExternalApiService, externalCredentialInput, externalCredentialListSchema } from './service.js';

const instanceParams = z.object({ instanceId: z.uuid() }).strict();
const credentialParams = z.object({ instanceId: z.uuid(), id: z.uuid() }).strict();
const accountParams = z.object({ accountId: z.uuid() }).strict();
const externalPage = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(1_000_000).default(0), status: z.string().max(40).optional(), sort: z.string().max(40).default('created_at'), direction: z.enum(['asc', 'desc']).default('desc') }).strict();

function externalContext(auth: Awaited<ReturnType<typeof authenticateExternal>>, request: FastifyRequest): TenantContext {
  const permissions = auth.scopes.map(scope => scope === 'accounts:read' ? 'brokerage.accounts.read' : scope);
  return { userId: auth.created_by, requestId: request.id, core: false, organizationId: auth.organization_id, brandId: auth.brand_id, environmentId: auth.environment_id, productInstanceId: auth.product_instance_id, productSlug: auth.product_slug ?? 'brokerage-crm', permissions };
}

export function registerExternalApiRoutes(app: FastifyInstance, db: Database, auth: Auth, tenancy: Tenancy): void {
  const service = new ExternalApiService(db);
  const adminBase = '/api/v1/instances/:instanceId/external-credentials';
  app.post(adminBase, async (request, reply) => {
    const { instanceId } = instanceParams.parse(request.params);
    const scope = await tenancy.tenant(request, instanceId, 'api.write', true);
    const input = externalCredentialInput.parse(request.body);
    const result = await service.createCredential(scope, input);
    reply.code(201).header('Cache-Control', 'no-store');
    return { data: result };
  });
  app.get(adminBase, async request => {
    const { instanceId } = instanceParams.parse(request.params);
    const scope = await tenancy.tenant(request, instanceId, 'api.read');
    return service.listCredentials(scope, externalCredentialListSchema.parse(request.query));
  });
  app.delete(`${adminBase}/:id`, async request => {
    const { instanceId, id } = credentialParams.parse(request.params);
    const scope = await tenancy.tenant(request, instanceId, 'api.write', true);
    return { data: await service.revokeCredential(scope, id) };
  });

  const externalBase = '/api/external/v1';
  app.get(`${externalBase}/accounts`, async request => {
    const credential = await authenticateExternal(request, auth, 'accounts:read');
    const context = externalContext(credential, request);
    const query = externalPage.parse(request.query);
    return service.listAccounts(context, query);
  });
  app.get(`${externalBase}/accounts/:accountId`, async request => {
    const credential = await authenticateExternal(request, auth, 'accounts:read');
    const context = externalContext(credential, request);
    const { accountId } = accountParams.parse(request.params);
    return { data: await service.getAccount(context, accountId) };
  });
}
