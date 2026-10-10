import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { validateIdempotency } from '../api/idempotency.js';
import type { TenantContext } from '../../shared/types.js';
import type { BrokerageRouteContext } from './common.js';
import { BrokerageOrdersService, cancelOrderSchema, orderCreateSchema, orderListSchema } from './orders.js';

const staffBase = '/api/v1/instances/:instanceId/brokerage';
const clientBase = '/api/v1/client/instances/:instanceId/brokerage';
const params = (request: FastifyRequest) => z.object({ instanceId: z.uuid(), id: z.uuid() }).parse(request.params);
export function registerBrokerageOrderRoutes(app: FastifyInstance, context: BrokerageRouteContext): void {
  const mutation = async <T>(request: FastifyRequest, reply: FastifyReply, scope: TenantContext, work: (service: BrokerageOrdersService) => Promise<T>) => {
    if (!validateIdempotency(request)) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Supply an Idempotency-Key for brokerage changes.');
    return { data: await context.atomic(request, reply, scope, (bound: Database) => work(new BrokerageOrdersService(bound))) };
  };
  app.get(`${staffBase}/orders`, async request => new BrokerageOrdersService(context.db).list(await context.staff(request, 'brokerage.orders.read'), orderListSchema.parse(request.query)));
  app.get(`${staffBase}/orders/:id`, async request => ({ data: await new BrokerageOrdersService(context.db).get(await context.staff(request, 'brokerage.orders.read'), params(request).id) }));
  app.get(`${staffBase}/orders/:id/history`, async request => ({ data: await new BrokerageOrdersService(context.db).history(await context.staff(request, 'brokerage.orders.read'), params(request).id) }));
  app.get(`${staffBase}/orders/:id/fills`, async request => ({ data: await new BrokerageOrdersService(context.db).fills(await context.staff(request, 'brokerage.orders.read'), params(request).id) }));
  app.post(`${staffBase}/orders`, async (request, reply) => { const scope = await context.staff(request, 'brokerage.orders.write', true); const input = orderCreateSchema.parse(request.body); reply.code(201); return mutation(request, reply, scope, service => service.create(scope, input)); });
  app.post(`${staffBase}/orders/:id/cancel`, async (request, reply) => { const scope = await context.staff(request, 'brokerage.orders.write', true); const input = cancelOrderSchema.parse(request.body ?? {}); return mutation(request, reply, scope, service => service.cancel(scope, params(request).id, input.reason)); });
  app.get(`${clientBase}/orders`, async request => { const scope = await context.client(request); return new BrokerageOrdersService(context.db).list(scope, orderListSchema.omit({ account_id: true }).parse(request.query), scope.userId); });
  app.get(`${clientBase}/orders/:id`, async request => { const scope = await context.client(request); return { data: await new BrokerageOrdersService(context.db).get(scope, params(request).id, scope.userId) }; });
  app.get(`${clientBase}/orders/:id/history`, async request => { const scope = await context.client(request); return { data: await new BrokerageOrdersService(context.db).history(scope, params(request).id, scope.userId) }; });
  app.get(`${clientBase}/orders/:id/fills`, async request => { const scope = await context.client(request); return { data: await new BrokerageOrdersService(context.db).fills(scope, params(request).id, scope.userId) }; });
  app.post(`${clientBase}/orders`, async (request, reply) => { const scope = await context.client(request, true); const input = orderCreateSchema.parse(request.body); reply.code(201); return mutation(request, reply, scope, service => service.create(scope, input, scope.userId)); });
  app.post(`${clientBase}/orders/:id/cancel`, async (request, reply) => { const scope = await context.client(request, true); const input = cancelOrderSchema.parse(request.body ?? {}); return mutation(request, reply, scope, service => service.cancel(scope, params(request).id, input.reason, scope.userId)); });
}
