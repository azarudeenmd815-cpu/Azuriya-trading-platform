import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, migrationTransaction } from '../src/server/db/database.js';

const mock = vi.hoisted(() => ({ pools: [] as { client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }; listeners: Record<string, (...args: unknown[]) => void> }[] }));
vi.mock('pg', () => ({ default: { Pool: class {
  totalCount = 1; idleCount = 0; waitingCount = 0;
  client = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('owns_tables') ? [{ rolsuper: false, rolbypassrls: false, owns_tables: false }] : sql.includes('current_user') ? [{ current_user: 'azuriya_app', rolsuper: false, rolbypassrls: false }] : [{ value: 1 }] })), release: vi.fn() };
  listeners: Record<string, (...args: unknown[]) => void> = {};
  constructor() { mock.pools.push(this); }
  on(name: string, listener: (...args: unknown[]) => void) { this.listeners[name] = listener; return this; }
  async connect() { return this.client; }
  async end() {}
} } }));

describe('PostgreSQL adapter failure handling and safe telemetry', () => {
  beforeEach(() => { mock.pools.length = 0; });
  it('discards a migration client when rollback also fails and preserves both errors', async () => {
    const db = await createDatabase({ url: 'postgresql://runtime@localhost/test', migrationUrl: 'postgresql://owner@localhost/test' });
    const original = new Error('migration failed'); const rollback = new Error('rollback failed');
    await expect(migrationTransaction(db, async () => {
      mock.pools[1].client.query.mockImplementation(async (sql: string) => { if (sql === 'ROLLBACK') throw rollback; return { rows: [] }; });
      throw original;
    })).rejects.toMatchObject({ errors: [original, rollback], cause: original });
    expect(mock.pools[1].client.release).toHaveBeenCalledWith(expect.any(AggregateError));
    await db.close();
  });
  it('records query and pool metrics without SQL, parameters, connection secrets or raw errors', async () => {
    const events: unknown[] = [];
    const db = await createDatabase({ url: 'postgresql://runtime:connection-secret@localhost/test', onMetric: event => events.push(event) });
    await db.query('SELECT $1 AS value /* sensitive-query */', ['sensitive-parameter']);
    mock.pools[0].listeners.error(Object.assign(new Error('raw-secret'), { code: '57P01' }));
    const metrics = db.metrics!();
    expect(metrics.transactions).toBe(1);
    expect(metrics.queries).toBeGreaterThan(1);
    expect(metrics.poolErrors).toBe(1);
    expect(metrics.runtimePool).toEqual({ total: 1, idle: 0, waiting: 0 });
    const serialized = JSON.stringify(events);
    for (const secret of ['connection-secret', 'sensitive-query', 'sensitive-parameter', 'raw-secret']) expect(serialized).not.toContain(secret);
    expect(serialized).toContain('57P01');
    await db.close();
  });
  it('does not let a broken metrics observer interrupt successful database work', async () => {
    const db = await createDatabase({ url: 'postgresql://runtime@localhost/test', onMetric: () => { throw new Error('observer failed'); } });
    expect((await db.query<{ value: number }>('SELECT 1 AS value')).rows[0].value).toBe(1);
    await db.close();
  });
});
