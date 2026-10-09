import { createHash, randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
export function validateIdempotency(request: FastifyRequest): string | undefined {
  const key = request.headers['idempotency-key'];
  if (!key) return;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) throw new AppError(400, 'VALIDATION_ERROR', 'Idempotency-Key must contain 8–128 safe characters.');
  return key;
}
function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function requestHash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function idempotencyRoute(request: FastifyRequest): string {
  // Route parameters distinguish rotations and updates of different resources.
  return `${request.method}:${request.routeOptions.url}:${canonical(request.params ?? {})}`;
}
export function boundDatabase(tx: Executor, actor: Actor): Database {
  return { query: tx.query, close: async () => { throw new Error('A transaction does not own its database'); }, transaction: async (scope, work) => {
    if ((scope.core && !actor.core) || (!actor.core && scope.organizationId !== actor.organizationId)) throw new AppError(403, 'SCOPE_MISMATCH', 'The operation cannot change its authorized database scope.');
    for (const field of ['brandId', 'environmentId', 'productInstanceId'] as const) if (scope[field] && scope[field] !== actor[field]) throw new AppError(403, 'SCOPE_MISMATCH', 'The operation cannot change its authorized product scope.');
    return work(tx);
  } };
}
export async function idempotent<T>(db: Database, actor: Actor, options: { key?: string; route: string; payload: unknown; credentialId?: string; status?: number; ttlMs?: number; redactResponse?: (result: T) => unknown }, work: (bound: Database) => Promise<T>): Promise<{ result: T; replayed: boolean }> {
  return db.transaction({ core: actor.core, organizationId: actor.organizationId, brandId: actor.brandId, environmentId: actor.environmentId, productInstanceId: actor.productInstanceId }, async tx => {
    const bound = boundDatabase(tx, actor);
    if (!options.key) return { result: await work(bound), replayed: false };
    const scope = [actor.userId, options.credentialId ?? 'session', actor.organizationId ?? 'core', actor.brandId ?? '', actor.environmentId ?? '', actor.productInstanceId ?? ''].join(':');
    const hash = requestHash(options.payload);
    await tx.query('DELETE FROM idempotency_records WHERE credential_scope=$1 AND route=$2 AND key=$3 AND expires_at<=now()', [scope, options.route, options.key]);
    const claim = await tx.query<{ id: string }>('INSERT INTO idempotency_records(id,organization_id,actor_id,credential_scope,key,route,request_hash,status,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(credential_scope,route,key) DO NOTHING RETURNING id', [randomUUID(), actor.organizationId ?? null, actor.userId, scope, options.key, options.route, hash, options.status ?? 201, new Date(Date.now() + (options.ttlMs ?? 86400_000)).toISOString()]);
    if (!claim.rows[0]) {
      const previous = (await tx.query<{ request_hash: string; response: T }>('SELECT request_hash,response FROM idempotency_records WHERE credential_scope=$1 AND route=$2 AND key=$3 FOR UPDATE', [scope, options.route, options.key])).rows[0];
      if (!previous || previous.request_hash !== hash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.');
      return { result: previous.response, replayed: true };
    }
    const result = await work(bound);
    await tx.query('UPDATE idempotency_records SET response=$1::jsonb WHERE id=$2', [JSON.stringify(options.redactResponse ? options.redactResponse(result) : result), claim.rows[0].id]);
    return { result, replayed: false };
  });
}
