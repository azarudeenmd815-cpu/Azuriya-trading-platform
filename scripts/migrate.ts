import 'dotenv/config';
import { resolve } from 'node:path';
import { createDatabase } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';

const db = await createDatabase({ url: process.env.DATABASE_URL, dataDir: resolve(process.env.DATA_DIR || './data/azuriya') });
try {
  await migrate(db);
  await seedCatalog(db);
  process.stdout.write('Database migrations and shared catalog are ready.\n');
} finally { await db.close(); }
