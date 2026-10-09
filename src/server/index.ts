import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import { buildApp } from './app.js';
import { createDatabase } from './db/database.js';
import { migrate } from './db/migrate.js';
import { seedCatalog } from './db/seed.js';
import { storageStartupValidation } from './connectors/kyc-storage.js';

const settings = config();
await storageStartupValidation();
const db = await createDatabase({ dataDir: settings.dataDir, url: settings.databaseUrl, requireTls: settings.production || Boolean(settings.sslCaFile), ...(settings.sslCaFile ? { sslCa: await readFile(settings.sslCaFile, 'utf8') } : {}), onPoolError: code => console.error(JSON.stringify({ component: 'database', code })) });
if (!settings.production) { await migrate(db); await seedCatalog(db); }
await db.query('SELECT 1');
const app = await buildApp({ db, origin: settings.origin, production: settings.production, trustedProxies: settings.trustedProxies, logger: true, ...(existsSync(resolve('dist/web/index.html')) ? { webRoot: resolve('dist/web') } : {}) });
app.addHook('onClose', async () => db.close());
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
await app.listen({ port: settings.port, host: '127.0.0.1' });
