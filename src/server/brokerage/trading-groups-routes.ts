import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { BrokerageRouteContext } from './common.js';
import { BrokerageTradingGroupsService, tradingGroupCreateSchema, tradingGroupListSchema, tradingGroupLifecycleSchema, tradingGroupUpdateSchema } from './trading-groups.js';

const admin = '/api/v1/instances/:instanceId/brokerage';
const paramsSchema = z.object({ instanceId: z.uuid(), id: z.uuid().optional() }).strict();
const params = (request: FastifyRequest) => paramsSchema.parse(request.params);

export function registerTradingGroupRoutes(app: FastifyInstance, context: BrokerageRouteContext): void {
  const service = new BrokerageTradingGroupsService(context.db);

  app.post(admin + '/trading-groups', async (request, reply) => {
    params(request);
    const scope = await context.staff(request, 'brokerage.settings.write', true);
    const input = tradingGroupCreateSchema.parse(request.body);
    const data = await context.atomic(request, reply, scope, bound => new BrokerageTradingGroupsService(bound).create(scope, input));
    reply.code(201);
    return { data };
  });

  app.get(admin + '/trading-groups', async request => {
    params(request);
    const scope = await context.staff(request, 'settings.read');
    return service.list(scope, tradingGroupListSchema.parse(request.query));
  });

  app.get(admin + '/trading-groups/:id', async request => {
    const { id } = params(request);
    const scope = await context.staff(request, 'settings.read');
    return { data: await service.get(scope, id!) };
  });

  app.patch(admin + '/trading-groups/:id', async (request, reply) => {
    const { id } = params(request);
    const scope = await context.staff(request, 'brokerage.settings.write', true);
    const input = tradingGroupUpdateSchema.parse(request.body);
    return { data: await context.atomic(request, reply, scope, bound => new BrokerageTradingGroupsService(bound).update(scope, id!, input)) };
  });

  app.post(admin + '/trading-groups/:id/activate', async (request, reply) => {
    const { id } = params(request);
    const scope = await context.staff(request, 'brokerage.settings.write', true);
    const input = tradingGroupLifecycleSchema.parse(request.body ?? {});
    return { data: await context.atomic(request, reply, scope, bound => new BrokerageTradingGroupsService(bound).activate(scope, id!, input)) };
  });

  app.post(admin + '/trading-groups/:id/deactivate', async (request, reply) => {
    const { id } = params(request);
    const scope = await context.staff(request, 'brokerage.settings.write', true);
    const input = tradingGroupLifecycleSchema.parse(request.body ?? {});
    return { data: await context.atomic(request, reply, scope, bound => new BrokerageTradingGroupsService(bound).deactivate(scope, id!, input)) };
  });
}
