import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import type { Auth } from '../security/auth.js';
import type { Tenancy } from '../security/tenancy.js';
import { brokerageContext } from '../brokerage/common.js';
import { MarketDataService } from './quotes.js';
import { AppError } from '../domain/errors.js';

const query = z.object({ instrument_id: z.string().uuid().optional(), instrument_ids: z.string().max(4000).optional(), source_id: z.string().uuid().optional() }).strict();
const params = z.object({ instanceId: z.string().uuid() });

/** Read-only quote surfaces. Ingestion deliberately has no HTTP route. */
export function registerMarketDataRoutes(app: FastifyInstance, db: Database, auth: Auth, tenancy: Tenancy) {
  const context = brokerageContext(db, auth, tenancy);
  const service = new MarketDataService(db);
  const admin = '/api/v1/instances/:instanceId/brokerage/quotes';
  const client = '/api/v1/client/instances/:instanceId/brokerage/quotes';
  const read = async (request: FastifyRequest, self: boolean) => {
    params.parse(request.params); const input = query.parse(request.query);
    const scope = self ? await context.client(request) : await context.staff(request, 'brokerage.accounts.read');
    if (input.instrument_id) return { data: await service.getLatest(scope, input.instrument_id, input.source_id) };
    if (!input.instrument_ids) throw new AppError(400, 'QUOTE_INSTRUMENT_REQUIRED', 'Specify instrument_id or a bounded instrument_ids list.');
    const ids = input.instrument_ids.split(',').filter(Boolean).map(value => z.string().uuid().parse(value));
    return { data: await service.listLatest(scope, ids, input.source_id) };
  };
  app.get(admin, async request => read(request, false));
  app.get(client, async request => read(request, true));
}
