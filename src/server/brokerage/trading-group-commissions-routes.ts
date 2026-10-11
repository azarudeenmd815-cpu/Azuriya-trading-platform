import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { BrokerageRouteContext } from './common.js';
import { BrokerageTradingGroupCommissionService, parseTradingGroupCommissionInput } from './trading-group-commissions.js';

const admin = '/api/v1/instances/:instanceId/brokerage/trading-groups/:groupId/commission';
const paramsSchema = z.object({ instanceId: z.uuid(), groupId: z.uuid() }).strict();

export function registerTradingGroupCommissionRoutes(app: FastifyInstance, context: BrokerageRouteContext): void {
  const params = (request: FastifyRequest) => paramsSchema.parse(request.params);
  const service = new BrokerageTradingGroupCommissionService(context.db);

  app.get(admin, async request => {
    const { groupId } = params(request);
    const scope = await context.staff(request, 'settings.read');
    return { data: await service.getGroupCommissionConfiguration(scope, groupId) };
  });

  app.put(admin, async (request, reply) => {
    const { groupId } = params(request);
    const scope = await context.staff(request, 'brokerage.settings.write', true);
    const input = parseTradingGroupCommissionInput(request.body);
    return { data: await context.atomic(request, reply, scope, bound => new BrokerageTradingGroupCommissionService(bound).upsertGroupCommissionConfiguration(scope, groupId, input)) };
  });
}
