import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface Executor {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface DatabaseContext { core?: boolean; organizationId?: string; brandId?: string; environmentId?: string; productInstanceId?: string }
export interface Database extends Executor {
  transaction<T>(context: DatabaseContext, work: (tx: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  metrics?(): DatabaseMetrics;
}
export interface DatabaseMetric { kind: 'query' | 'transaction' | 'pool'; source: 'runtime' | 'migration'; duration_ms: number; success: boolean; code?: string }
export interface DatabaseMetrics { queries: number; queryFailures: number; transactions: number; transactionFailures: number; poolErrors: number; queryDurationMs: number; runtimePool?: { total: number; idle: number; waiting: number } }
function telemetry(options: DatabaseOptions) {
  const values: DatabaseMetrics = { queries: 0, queryFailures: 0, transactions: 0, transactionFailures: 0, poolErrors: 0, queryDurationMs: 0 };
  const emit = (event: DatabaseMetric) => { try { options.onMetric?.(event); } catch { /* Observability cannot break persistence. */ } };
  const code = (error: unknown) => { const value = (error as { code?: unknown })?.code; return typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value) ? value : 'DATABASE_OPERATION_FAILED'; };
  async function measure<T>(kind: 'query' | 'transaction', source: 'runtime' | 'migration', work: () => Promise<T>): Promise<T> {
    const start = performance.now(); let success = false; let failure: string | undefined;
    if (kind === 'query') values.queries++; else values.transactions++;
    try { const result = await work(); success = true; return result; } catch (error) { failure = code(error); if (kind === 'query') values.queryFailures++; else values.transactionFailures++; throw error; }
    finally { const duration_ms = performance.now() - start; if (kind === 'query') values.queryDurationMs += duration_ms; emit({ kind, source, duration_ms, success, ...(failure ? { code: failure } : {}) }); }
  }
  return { values, measure, poolError(error: unknown, source: 'runtime' | 'migration') { values.poolErrors++; const failure = code(error); emit({ kind: 'pool', source, duration_ms: 0, success: false, code: failure }); try { options.onPoolError?.(failure); } catch { /* Ignore observer errors. */ } } };
}

interface OwnerExecutor extends Executor { exec(sql: string): Promise<void> }
type MigrationRunner = <T>(work: (owner: OwnerExecutor) => Promise<T>) => Promise<T>;
const migrationRunners = new WeakMap<Database, MigrationRunner>();

/** Internal migration capability. HTTP and domain code must use Database only. */
export async function migrationTransaction<T>(db: Database, work: (owner: OwnerExecutor) => Promise<T>): Promise<T> {
  const run = migrationRunners.get(db);
  if (!run) throw new Error('Database was not created by createDatabase');
  return run(work);
}

/** Verify the PostgreSQL login before assuming the restricted application role. */
export async function validateServerRuntimeLogin(executor: Executor): Promise<void> {
  const login = await executor.query<{ rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean }>(
    `SELECT r.rolsuper,r.rolbypassrls,EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_has_role(session_user,c.relowner,'MEMBER')
     ) AS owns_tables FROM pg_roles r WHERE r.rolname=session_user`,
  );
  if (!login.rows[0] || login.rows[0].rolsuper || login.rows[0].rolbypassrls) {
    throw new Error('PostgreSQL runtime login must be non-superuser and NOBYPASSRLS; use MIGRATION_DATABASE_URL for schema-owner access');
  }
  if (login.rows[0].owns_tables) {
    throw new Error('PostgreSQL runtime login must not own application tables or belong to a table-owner role; use a separate migration connection');
  }
}

function serialized() {
  let tail = Promise.resolve();
  return async <T>(work: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  };
}

async function inTransaction<T>(
  query: Executor['query'],
  context: DatabaseContext | null,
  work: (executor: Executor) => Promise<T>,
): Promise<T> {
  await query('BEGIN');
  let active = true;
  const executor: Executor = {
    query: async <R>(sql: string, params?: unknown[]) => {
      if (!active) throw new Error('Transaction executor cannot be used after completion');
      return query<R>(sql, params);
    },
  };
  try {
    if (context !== null) {
      await query('SET LOCAL ROLE azuriya_app');
      await query("SELECT set_config('azuriya.core',$1,true), set_config('azuriya.organization_id',$2,true)", [context.core === true ? 'true' : 'false', context.organizationId ?? '']);
      await query("SELECT set_config('azuriya.brand_id',$1,true), set_config('azuriya.environment_id',$2,true), set_config('azuriya.product_instance_id',$3,true)", [context.brandId ?? '', context.environmentId ?? '', context.productInstanceId ?? '']);
      const role = await query<{ rolsuper: boolean; rolbypassrls: boolean; current_user: string }>('SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname = current_user');
      if (role.rows[0]?.current_user !== 'azuriya_app' || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
        throw new Error('Unsafe database runtime role: azuriya_app must not bypass row security');
      }
    }
    const result = await work(executor);
    await query('COMMIT');
    return result;
  } catch (error) {
    try { await query('ROLLBACK'); }
    catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Database operation failed and rollback also failed', { cause: error }); }
    throw error;
  } finally { active = false; }
}

/**
 * In memory by default; dataDir persists embedded PostgreSQL locally.
 * PostgreSQL uses url for a non-superuser runtime login granted azuriya_app.
 * MIGRATION_DATABASE_URL supplies the separate schema-owner connection.
 */
export interface DatabaseOptions { dataDir?: string; url?: string; migrationUrl?: string; requireTls?: boolean; sslCa?: string; connectionTimeoutMs?: number; statementTimeoutMs?: number; onPoolError?: (code: string) => void; onMetric?: (event: DatabaseMetric) => void }
export async function createDatabase(options: DatabaseOptions = {}): Promise<Database> {
  if (options.url) return createServerDatabase(options.url, options);
  const dataDir = options.dataDir ? resolve(options.dataDir) : undefined;
  if (dataDir) await mkdir(dirname(dataDir), { recursive: true });
  const instance = new PGlite(dataDir);
  await instance.waitReady;
  const lock = serialized();
  const monitor = telemetry(options);
  let closing = false;
  const query: Executor['query'] = async <T>(sql: string, params?: unknown[]) => monitor.measure('query', 'runtime', async () => ({ rows: (await instance.query<T>(sql, params)).rows }));
  const runtime = async <T>(context: DatabaseContext, work: (tx: Executor) => Promise<T>) => {
    if (closing) throw new Error('Database is closed');
    return monitor.measure('transaction', 'runtime', () => lock(() => inTransaction(query, context, work)));
  };
  const db: Database = {
    query: <T>(sql: string, params?: unknown[]) => runtime({}, tx => tx.query<T>(sql, params)),
    transaction: runtime,
    metrics: () => ({ ...monitor.values }),
    close: async () => { if (closing) return; closing = true; await lock(() => instance.close()); },
  };
  migrationRunners.set(db, async work => {
    if (closing) throw new Error('Database is closed');
    return lock(() => inTransaction(query, null, tx => work({ ...tx, exec: async sql => { await instance.exec(sql); } })));
  });
  return db;
}

async function createServerDatabase(url: string, options: DatabaseOptions): Promise<Database> {
  const monitor = telemetry(options);
  const makePool = (connectionString: string, max: number) => {
    if (options.requireTls && new URL(connectionString).searchParams.has('sslmode')) throw new Error('Use the verified TLS configuration instead of a URL sslmode override.');
    const pool = new pg.Pool({ connectionString, max, connectionTimeoutMillis: options.connectionTimeoutMs ?? 5000, statement_timeout: options.statementTimeoutMs ?? 15000, idle_in_transaction_session_timeout: 15000, idleTimeoutMillis: 30000, ...(options.requireTls ? { ssl: { rejectUnauthorized: true, ...(options.sslCa ? { ca: options.sslCa } : {}) } } : {}) });
    pool.on('error', error => monitor.poolError(error, max === 10 ? 'runtime' : 'migration'));
    return pool;
  };
  const runtimePool = makePool(url, 10);
  let ownerPool: pg.Pool | undefined;
  let closed = false;
  const runtime: Database['transaction'] = (context, work) => monitor.measure('transaction', 'runtime', async () => {
    if (closed) throw new Error('Database is closed');
    const client = await runtimePool.connect();
    let released = false;
    try {
      {
        await validateServerRuntimeLogin({ query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await client.query(sql, params)).rows as T[] }) });
      }
      const query: Executor['query'] = async <T>(sql: string, params?: unknown[]) => monitor.measure('query', 'runtime', async () => ({ rows: (await client.query(sql, params)).rows as T[] }));
      return await inTransaction(query, context, work);
    } catch (error) { client.release(error instanceof Error ? error : new Error('Database operation failed')); released = true; throw error; }
    finally { if (!released) client.release(); }
  });
  const db: Database = {
    query: <T>(sql: string, params?: unknown[]) => runtime({}, tx => tx.query<T>(sql, params)),
    transaction: runtime,
    metrics: () => ({ ...monitor.values, runtimePool: { total: runtimePool.totalCount, idle: runtimePool.idleCount, waiting: runtimePool.waitingCount } }),
    close: async () => { if (closed) return; closed = true; await Promise.all([runtimePool.end(), ownerPool?.end()]); },
  };
  migrationRunners.set(db, async work => {
    if (closed) throw new Error('Database is closed');
    const ownerUrl = options.migrationUrl ?? process.env.MIGRATION_DATABASE_URL;
    if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL is required for migration operations.');
    ownerPool ??= makePool(ownerUrl, 1);
    const client = await ownerPool.connect();
    let released = false;
    try {
      const query: Executor['query'] = async <T>(sql: string, params?: unknown[]) => monitor.measure('query', 'migration', async () => ({ rows: (await client.query(sql, params)).rows as T[] }));
      return await inTransaction(query, null, tx => work({ ...tx, exec: async sql => { await client.query(sql); } }));
    } catch (error) { client.release(error instanceof Error ? error : new Error('Migration operation failed')); released = true; throw error; }
    finally { if (!released) client.release(); }
  });
  return db;
}
