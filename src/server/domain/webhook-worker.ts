import { randomUUID } from 'node:crypto';
import type { Database, Executor } from '../db/database.js';
import type { OutboxEvent } from './outbox-worker.js';
import { retryDelay } from './outbox-worker.js';
import { databaseVault } from './credential-storage.js';
import { postWebhook, signWebhook } from '../security/webhook-http.js';
export async function fanoutWebhooks(tx: Executor, event: OutboxEvent): Promise<void> {
  if (!event.organization_id || ['invitation.email','brokerage.email','domain.delivery_check','domain.delivery_cleanup'].includes(event.event_type)) return;
  const endpoints = (await tx.query<{ id: string; organization_id: string; brand_id: string; environment_id: string; product_instance_id: string; events: string[] }>("SELECT * FROM webhook_endpoints WHERE organization_id=$1 AND status='active' AND signing_secret_reference IS NOT NULL AND (events ? $2 OR events ? '*')", [event.organization_id, event.event_type])).rows;
  for (const endpoint of endpoints) {
    // Audit envelopes include scope; organisation-only events never leak into an unrelated instance endpoint.
    const scope = event.payload.scope as Record<string, unknown> | undefined;
    if (endpoint.product_instance_id && scope?.product_instance_id !== endpoint.product_instance_id) continue;
    await tx.query('INSERT INTO webhook_deliveries(id,organization_id,brand_id,environment_id,product_instance_id,webhook_endpoint_id,event_id,event_type,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(webhook_endpoint_id,event_id) WHERE event_id IS NOT NULL DO NOTHING', [randomUUID(), endpoint.organization_id, endpoint.brand_id, endpoint.environment_id, endpoint.product_instance_id, endpoint.id, event.id, event.event_type, JSON.stringify({ id: event.id, type: event.event_type, data: event.payload })]);
  }
}
interface Delivery { id: string; organization_id: string; product_instance_id: string; webhook_endpoint_id: string; event_id: string; payload: unknown; attempts: number; max_attempts: number; lease_token: string }
export class WebhookWorker {
  constructor(private db: Database, private send = postWebhook, private key = process.env.SECRET_ENCRYPTION_KEY) {}
  async runOnce(): Promise<boolean> {
    const delivery = await this.db.transaction({ core: true }, async tx => {
      await tx.query("UPDATE webhook_deliveries SET status='dead_letter',error='LEASE_EXHAUSTED',lease_token=NULL,lease_until=NULL WHERE status='delivering' AND lease_until<=now() AND attempts>=max_attempts");
      return (await tx.query<Delivery>(`WITH c AS(SELECT d.id FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id=d.webhook_endpoint_id WHERE e.status='active' AND EXISTS(SELECT 1 FROM product_instances i JOIN organizations o ON o.id=i.organization_id JOIN brands b ON b.id=i.brand_id JOIN environments env ON env.id=i.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE i.id=e.product_instance_id AND i.organization_id=e.organization_id AND i.brand_id=e.brand_id AND i.environment_id=e.environment_id AND i.status='active' AND o.status='active' AND b.status='active' AND env.status='active' AND p.status='active' AND s.status='active') AND(e.application_id IS NULL OR EXISTS(SELECT 1 FROM api_applications a WHERE a.id=e.application_id AND a.status='active')) AND d.attempts<d.max_attempts AND ((d.status IN ('pending','failed') AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=now())) OR(d.status='delivering' AND d.lease_until<=now())) ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1) UPDATE webhook_deliveries d SET status='delivering',attempts=d.attempts+1,last_attempt_at=now(),lease_until=now()+interval '30 seconds',lease_token=$1 FROM c WHERE d.id=c.id RETURNING d.*`, [randomUUID()])).rows[0];
    });
    if (!delivery) return false;
    const startedAt = new Date().toISOString();
    let status: number | null = null; let error: string | null = null;
    try {
      const endpoint = await this.db.transaction({ organizationId: delivery.organization_id }, async tx => (await tx.query<{ url: string; status: string; signing_secret_reference: string; secret_version: number }>("SELECT e.url,e.status,e.signing_secret_reference,e.secret_version FROM webhook_endpoints e WHERE e.id=$1 AND EXISTS(SELECT 1 FROM product_instances i JOIN organizations o ON o.id=i.organization_id JOIN brands b ON b.id=i.brand_id JOIN environments env ON env.id=i.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE i.id=e.product_instance_id AND i.organization_id=e.organization_id AND i.brand_id=e.brand_id AND i.environment_id=e.environment_id AND i.status='active' AND o.status='active' AND b.status='active' AND env.status='active' AND p.status='active' AND s.status='active') AND(e.application_id IS NULL OR EXISTS(SELECT 1 FROM api_applications a WHERE a.id=e.application_id AND a.status='active'))", [delivery.webhook_endpoint_id])).rows[0]);
      if (!endpoint || endpoint.status !== 'active') throw new Error('ENDPOINT_DISABLED');
      const { secret } = await databaseVault(this.db, this.key).read({ organizationId: delivery.organization_id, productInstanceId: delivery.product_instance_id, providerId: `webhook:${delivery.webhook_endpoint_id}` }, endpoint.signing_secret_reference);
      const timestamp = Math.floor(Date.now() / 1000); const body = JSON.stringify(delivery.payload);
      status = (await this.send(endpoint.url, body, { 'X-Azuriya-Delivery': delivery.id, 'X-Azuriya-Event': delivery.event_id, 'X-Azuriya-Timestamp': String(timestamp), 'X-Azuriya-Signature': signWebhook(secret, timestamp, delivery.id, body), 'X-Azuriya-Secret-Version': String(endpoint.secret_version) })).status;
      if (status < 200 || status >= 300) error = status >= 300 && status < 400 ? 'REDIRECT_BLOCKED' : 'HTTP_FAILURE';
    } catch { error = 'DELIVERY_FAILED'; }
    const terminal = status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
    await this.db.transaction({ core: true }, async tx => {
      const updated = (await tx.query('UPDATE webhook_deliveries SET status=$1,response_status=$2,error=$3,next_attempt_at=$4,delivered_at=CASE WHEN $1=\'delivered\' THEN now() ELSE NULL END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$5 AND lease_token=$6 AND lease_until>now() RETURNING id', [error ? (terminal || delivery.attempts >= delivery.max_attempts ? 'dead_letter' : 'failed') : 'delivered', status, error, error ? new Date(Date.now() + retryDelay(delivery.attempts)).toISOString() : null, delivery.id, delivery.lease_token])).rows[0];
      if (!updated) return;
      await tx.query('INSERT INTO webhook_attempts(id,organization_id,delivery_id,attempt_number,response_status,error_code,started_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), delivery.organization_id, delivery.id, delivery.attempts, status, error, startedAt]);
      await tx.query('UPDATE webhook_endpoints SET consecutive_failures=CASE WHEN $1 THEN consecutive_failures+1 ELSE 0 END,status=CASE WHEN $1 AND disable_after_failures IS NOT NULL AND consecutive_failures+1>=disable_after_failures THEN \'disabled\' ELSE status END WHERE id=$2', [Boolean(error), delivery.webhook_endpoint_id]);
    });
    return true;
  }
}
