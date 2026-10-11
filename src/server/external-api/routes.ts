import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import type { Auth } from '../security/auth.js';
import type { Tenancy } from '../security/tenancy.js';
import type { TenantContext } from '../../shared/types.js';
import { authenticateExternal } from './auth.js';
import { ExternalApiService, externalAccountListSchema, externalCredentialInput, externalCredentialListSchema, externalOrderListSchema, externalPositionListSchema } from './service.js';

const instanceParams = z.object({ instanceId: z.uuid() }).strict();
const credentialParams = z.object({ instanceId: z.uuid(), id: z.uuid() }).strict();
const accountParams = z.object({ accountId: z.uuid() }).strict();
const orderParams = z.object({ accountId: z.uuid(), orderId: z.uuid() }).strict();
const positionParams = z.object({ accountId: z.uuid(), positionId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_.:-]+$/) }).strict();

function externalContext(auth: Awaited<ReturnType<typeof authenticateExternal>>, request: FastifyRequest): TenantContext {
  const permissions = auth.scopes.map(scope => scope === 'accounts:read' ? 'brokerage.accounts.read' : scope === 'orders:read' ? 'brokerage.orders.read' : scope);
  return { userId: auth.created_by, requestId: request.id, core: false, organizationId: auth.organization_id, brandId: auth.brand_id, environmentId: auth.environment_id, productInstanceId: auth.product_instance_id, productSlug: auth.product_slug ?? 'brokerage-crm', permissions, credentialId: auth.credentialId };
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
    const query = externalAccountListSchema.parse(request.query);
    return service.listAccounts(context, query);
  });
  app.get(`${externalBase}/accounts/:accountId`, async request => {
    const credential = await authenticateExternal(request, auth, 'accounts:read');
    const context = externalContext(credential, request);
    const { accountId } = accountParams.parse(request.params);
    return { data: await service.getAccount(context, accountId) };
  });
  app.get(`${externalBase}/accounts/:accountId/orders`, async request => {
    const credential = await authenticateExternal(request, auth, 'orders:read');
    const context = externalContext(credential, request);
    const { accountId } = accountParams.parse(request.params);
    return service.listOrders(context, accountId, externalOrderListSchema.parse(request.query));
  });
  app.get(`${externalBase}/accounts/:accountId/orders/:orderId`, async request => {
    const credential = await authenticateExternal(request, auth, 'orders:read');
    const context = externalContext(credential, request);
    const { accountId, orderId } = orderParams.parse(request.params);
    return { data: await service.getOrder(context, accountId, orderId) };
  });
  app.get(`${externalBase}/accounts/:accountId/positions`, async request => {
    const credential = await authenticateExternal(request, auth, 'positions:read');
    const context = externalContext(credential, request);
    const { accountId } = accountParams.parse(request.params);
    return service.listPositions(context, accountId, externalPositionListSchema.parse(request.query));
  });
  app.get(`${externalBase}/accounts/:accountId/positions/:positionId`, async request => {
    const credential = await authenticateExternal(request, auth, 'positions:read');
    const context = externalContext(credential, request);
    const { accountId, positionId } = positionParams.parse(request.params);
    return { data: await service.getPosition(context, accountId, positionId) };
  });
}
