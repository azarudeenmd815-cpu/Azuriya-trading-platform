import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import { createDatabase } from './db/database.js';
import { migrate } from './db/migrate.js';
import { OutboxWorker } from './domain/outbox-worker.js';
import { brokerageEmailHandler } from './brokerage/communications.js';
import { WebhookWorker, fanoutWebhooks } from './domain/webhook-worker.js';
import { PostgresRateLimiter } from './security/rate-limiter.js';
import { invitationEmailHandler } from './domain/invitations.js';
import { domainHandlers, scheduleDomainChecks } from './domain/domain-maintenance.js';
import { ConnectorWorker, connectorRuntime } from './connectors/connector-worker.js';
import { connectorHandlers, scheduleConnectorReconciliation } from './connectors/scheduling.js';
import { processVerifiedCallback } from './connectors/callbacks.js';
import { getKycHandlers, enqueueKycRetention } from './connectors/kyc-document-service.js';
import { storageStartupValidation } from './connectors/kyc-storage.js';

const settings = config();
await storageStartupValidation();
if (!settings.databaseUrl) throw new Error('The separate worker requires network PostgreSQL; an embedded data directory cannot be shared between processes.');
const db = await createDatabase({ url: settings.databaseUrl, requireTls: settings.production || Boolean(settings.sslCaFile), ...(settings.sslCaFile ? { sslCa: await readFile(settings.sslCaFile, 'utf8') } : {}) });
if (!settings.production) await migrate(db);
const connectors = new ConnectorWorker(db, { origin: settings.origin });
const outbox = new OutboxWorker(db, { 'invitation.email': invitationEmailHandler(db), 'brokerage.email': brokerageEmailHandler(db), ...domainHandlers(db), ...getKycHandlers(db), ...connectorHandlers(db, connectors), 'connector.callback': async event => {
  const receipt = event.payload.receipt_id;
  if (typeof receipt !== 'string' || !/^[a-f0-9-]{36}$/i.test(receipt)) throw new Error('CALLBACK_RECEIPT_INVALID');
  await processVerifiedCallback(db, receipt, settings.origin);
} }, { fanout: fanoutWebhooks });
const webhooks = new WebhookWorker(db); const limiter = new PostgresRateLimiter(db);
let stopping = false; let maintenanceAt = 0;
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { stopping = true; });
try {
  while (!stopping) {
    try {
      const didOutbox = await outbox.runOnce(); const didWebhook = await webhooks.runOnce(); const didConnector = await connectors.runOnce();
      if (Date.now() - maintenanceAt >= 60000) {
        maintenanceAt = Date.now();
        if (process.env.DOMAIN_PROVIDER_URL && process.env.DOMAIN_PROVIDER_TOKEN) await scheduleDomainChecks(db);
        await scheduleConnectorReconciliation(db);
        await enqueueKycRetention(db);
        await limiter.cleanup();
        await db.transaction({ core: true }, async tx => {
          await tx.query('UPDATE worker_heartbeats SET connector_metrics=$1::jsonb WHERE id=$2',[JSON.stringify(connectorRuntime.snapshot()),outbox.id]);
          await tx.query('DELETE FROM idempotency_records WHERE expires_at<=now()');
          await tx.query('DELETE FROM sessions WHERE expires_at<=now()');
          await tx.query("DELETE FROM worker_heartbeats WHERE seen_at<now()-interval '1 day'");
        });
      }
      if (!didOutbox && !didWebhook && !didConnector) await delay(1000);
    } catch { console.error(JSON.stringify({ component: 'worker', code: 'DEPENDENCY_UNAVAILABLE' })); await delay(5000); }
  }
} finally { await outbox.stop().catch(() => {}); await db.close(); }
