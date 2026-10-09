import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import type { Row, TenantContext } from '../../shared/types.js';
import { DomainActivationService, HttpsDomainProvider, type DomainProvider } from './domain-activation.js';
import type { OutboxEvent } from './outbox-worker.js';
/** Scheduling is serialized across workers; delivery checks run under durable outbox leases. */
export async function scheduleDomainChecks(db: Database) {
  return db.transaction({ core: true }, async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(73001921)');
    const rows = (await tx.query<Row>("SELECT d.id,d.organization_id,d.challenge_version FROM domains d JOIN product_instances i ON i.id=d.product_instance_id JOIN organizations o ON o.id=d.organization_id WHERE d.verified_at IS NOT NULL AND i.status='active' AND o.status='active' AND (d.status IN('verified','ssl_provisioning','failed') OR(d.status='active' AND d.certificate_expires_at<now()+interval '30 days')) AND(d.provider_last_checked_at IS NULL OR d.provider_last_checked_at<now()-interval '5 minutes') AND NOT EXISTS(SELECT 1 FROM outbox_events e WHERE e.event_type='domain.delivery_check' AND e.payload->>'domain_id'=d.id::text AND e.state IN('pending','processing')) ORDER BY d.created_at LIMIT 100")).rows;
    for (const domain of rows) await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(),domain.organization_id,'domain.delivery_check',JSON.stringify({ domain_id: domain.id, challenge_version: domain.challenge_version })]);
    return rows.length;
  });
}
export function domainHandlers(db: Database, provider: DomainProvider = new HttpsDomainProvider()) {
  const current = async (event: OutboxEvent) => db.transaction({ core: true }, async tx => (await tx.query<Row>('SELECT * FROM domains WHERE id=$1 AND organization_id=$2 AND challenge_version=$3', [event.payload.domain_id,event.organization_id,event.payload.challenge_version])).rows[0]);
  return {
    'domain.delivery_cleanup': async (event: OutboxEvent) => { const domain = await current(event); if (domain && ['disabled','awaiting_dns'].includes(String(domain.status)) && (domain.certificate_reference || domain.edge_reference)) await provider.disable(domain); },
    'domain.delivery_check': async (event: OutboxEvent) => {
      const domain = await current(event); if (!domain || !domain.verified_at || ['disabled','suspended','awaiting_dns'].includes(String(domain.status))) return;
      if (typeof domain.created_by !== 'string') throw new Error('DOMAIN_WORKER_PROVENANCE_REQUIRED');
      const actor: TenantContext = { core: false, userId: String(domain.created_by), requestId: `event_${event.id}`, organizationId: String(domain.organization_id), brandId: String(domain.brand_id), environmentId: String(domain.environment_id), productInstanceId: String(domain.product_instance_id), productSlug: '', permissions: ['domains.write'] };
      await new DomainActivationService(db,provider).reconcile(actor,String(domain.id));
    },
  };
}
