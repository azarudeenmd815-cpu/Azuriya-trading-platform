import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { type Database, migrationTransaction } from './database.js';

/** Migrations are checksummed and applied atomically by the schema owner. */
export async function migrate(db: Database): Promise<void> {
  const directory = fileURLToPath(new URL('../../../migrations/', import.meta.url));
  const files = (await readdir(directory)).filter(file => /^\d+_[a-z0-9_-]+\.sql$/.test(file)).sort();
  await migrationTransaction(db, async owner => {
    await owner.query('SELECT pg_advisory_xact_lock(1948512301)');
    await owner.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await owner.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    for (const name of files) {
      const source = await readFile(join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const applied = await owner.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum) throw new Error(`Migration checksum differs: ${name}; create a new migration instead of editing an applied one`);
        continue;
      }
      await owner.exec(source);
      await owner.query('INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)', [name, checksum]);
    }
    await owner.query('REVOKE ALL ON schema_migrations FROM azuriya_app');
  });
}
