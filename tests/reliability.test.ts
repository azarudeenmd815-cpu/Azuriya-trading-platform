import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { idempotent, idempotencyRoute, validateIdempotency } from '../src/server/api/idempotency.js';
import { OutboxWorker } from '../src/server/domain/outbox-worker.js';
import { PostgresRateLimiter } from '../src/server/security/rate-limiter.js';
import { publicAddress, resolvePublicWebhook, signWebhook, verifyWebhook } from '../src/server/security/webhook-http.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';

describe('production reliability activation', () => {
  let db: Database;
  const actor = randomUUID();
  beforeAll(async () => {
    db = await createDatabase(); await migrate(db);
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [actor, 'retry@test.local', 'unused', 'Retry']));
  });
  afterAll(async () => db?.close());
  it('accepts a valid idempotency key for a transactional operation', () => {
    expect(() => validateIdempotency({ headers: { 'idempotency-key': 'retry-0000001' } } as unknown as FastifyRequest)).not.toThrow();
  });
  it('binds idempotency to resource parameters and allows a fresh operation after expiry', async () => {
    const request = { method: 'POST', routeOptions: { url: '/accounts/:id/rotate' }, params: { id: 'first' } };
    expect(idempotencyRoute(request as unknown as FastifyRequest)).not.toBe(idempotencyRoute({ ...request, params: { id: 'second' } } as unknown as FastifyRequest));
    const context = { userId: actor, requestId: 'expiry-test', core: true }; let calls = 0;
    const options = { key: 'expiry-00001', route: '/expiry', payload: { a: 1 } };
    await idempotent(db,context,options,async () => ({ sequence: ++calls }));
    await db.transaction({ core: true },tx => tx.query("UPDATE idempotency_records SET expires_at=now()-interval '1 second' WHERE key=$1", [options.key]));
    expect((await idempotent(db,context,options,async () => ({ sequence: ++calls }))).result.sequence).toBe(2);
  });
  it('commits the mutation once under concurrent retries and rejects changed payloads', async () => {
    let calls = 0;
    const context = { userId: actor, requestId: 'retry-test', core: true };
    const options = { key: 'concurrent-0001', route: 'POST:/core/example', payload: { b: 2, a: 1 } };
    const work = async (bound: Database) => {
      calls++; const id = randomUUID();
      await bound.transaction({ core: true }, tx => tx.query('INSERT INTO outbox_events(id,event_type,payload) VALUES($1,$2,$3)', [id, 'retry.created', '{}']));
      return { id };
    };
    const results = await Promise.all(Array.from({ length: 5 }, () => idempotent(db, context, options, work)));
    expect(calls).toBe(1); expect(new Set(results.map(result => result.result.id)).size).toBe(1);
    expect(results.filter(result => result.replayed)).toHaveLength(4);
    await expect(idempotent(db, context, { ...options, payload: { a: 3 } }, work)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('rolls back the idempotency claim and business result together on failure', async () => {
    const context = { userId: actor, requestId: 'retry-test', core: true };
    await expect(idempotent(db, context, { key: 'rollback-0001', route: '/rollback', payload: {} }, async bound => {
      await bound.query('INSERT INTO outbox_events(id,event_type,payload) VALUES($1,$2,$3)', [randomUUID(), 'rollback.created', '{}']);
      throw new Error('simulate failure');
    })).rejects.toThrow('simulate failure');
    const rows = await db.transaction({ core: true }, tx => tx.query('SELECT id FROM idempotency_records WHERE key=$1', ['rollback-0001']));
    expect(rows.rows).toHaveLength(0);
    expect((await db.transaction({ core: true }, tx => tx.query("SELECT id FROM outbox_events WHERE event_type='rollback.created'"))).rows).toHaveLength(0);
  });
  it('never stores or replays a one-time secret', async () => {
    const options = { key: 'secret-00001', route: '/secret', payload: {}, redactResponse: (value: { id: string; secret?: string }) => ({ id: value.id, secret_replay_unavailable: true }) };
    const context = { userId: actor, requestId: 'secret-test', core: true };
    const first = await idempotent(db, context, options, async () => ({ id: 'credential', secret: 'once-only-secret' }));
    const replay = await idempotent(db, context, options, async () => ({ id: 'wrong' }));
    expect(first.result.secret).toBe('once-only-secret'); expect(JSON.stringify(replay)).not.toContain('once-only-secret');
    expect(JSON.stringify((await db.transaction({ core: true }, tx => tx.query('SELECT response FROM idempotency_records WHERE key=$1', [options.key]))).rows)).not.toContain('once-only-secret');
  });
  it('claims each job exclusively, recovers expired leases, and rejects stale acknowledgements', async () => {
    await db.transaction({ core: true }, tx => tx.query("DELETE FROM outbox_events"));
    const id = randomUUID(); await db.transaction({ core: true }, tx => tx.query('INSERT INTO outbox_events(id,event_type,payload) VALUES($1,$2,$3)', [id, 'lease.test', '{}']));
    const one = new OutboxWorker(db, {}); const two = new OutboxWorker(db, {});
    const claims = await Promise.all([one.claim(), two.claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await db.transaction({ core: true }, tx => tx.query("UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=$1", [id]));
    const recovery = await two.claim(); expect(recovery?.id).toBe(id); expect(recovery?.lease_token).not.toBe(claims.find(Boolean)?.lease_token);
    await db.transaction({ core: true }, tx => tx.query("UPDATE outbox_events SET lease_until=now()-interval '1 second',attempts=max_attempts WHERE id=$1", [id]));
    expect(await one.claim()).toBeUndefined();
    expect((await db.transaction({ core: true }, tx => tx.query<{ state: string }>('SELECT state FROM outbox_events WHERE id=$1', [id]))).rows[0].state).toBe('dead_letter');
  });
  it('shares limits across limiter instances and fails closed on database failure', async () => {
    const policy = [{ key: 'auth:shared-test', limit: 2, windowSeconds: 60 }];
    await new PostgresRateLimiter(db).consume(policy); await new PostgresRateLimiter(db).consume(policy);
    await expect(new PostgresRateLimiter(db).consume(policy)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    const unavailable = { ...db, transaction: async () => { throw new Error('offline'); } } as Database;
    await expect(new PostgresRateLimiter(unavailable).consume(policy)).rejects.toMatchObject({ code: 'RATE_LIMIT_UNAVAILABLE' });
  });
  it('rejects private IPv4 and IPv6, mapped loopback, mixed DNS and metadata destinations', async () => {
    for (const address of ['127.0.0.1', '10.0.0.2', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1']) expect(publicAddress(address), address).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true); expect(publicAddress('2606:4700:4700::1111')).toBe(true);
    const mixed = async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }];
    await expect(resolvePublicWebhook('https://hooks.example/events', mixed as unknown as typeof import('node:dns/promises').lookup)).rejects.toMatchObject({ code: 'WEBHOOK_SSRF_BLOCKED' });
  });
  it('authenticates exact signed bytes, delivery identity, and a five-minute timestamp window', () => {
    const timestamp = Math.floor(Date.now() / 1000); const body = '{"id":"event"}';
    const signature = signWebhook('secret', timestamp, 'delivery', body);
    expect(verifyWebhook('secret', timestamp, 'delivery', body, signature)).toBe(true);
    expect(verifyWebhook('secret', timestamp, 'other', body, signature)).toBe(false);
    expect(verifyWebhook('secret', timestamp, 'delivery', body + ' ', signature)).toBe(false);
    expect(verifyWebhook('secret', timestamp, 'delivery', body, signature, Date.now() + 301_000)).toBe(false);
  });
});
