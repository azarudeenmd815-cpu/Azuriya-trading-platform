import type { Database } from '../db/database.js';
import { AppError } from './errors.js';
import { normalizeHostname } from './dns.js';

export interface DomainScope { organization_id: string; brand_id: string; environment_id: string; product_instance_id: string }
export interface VerifiedDomain extends DomainScope { id: string; hostname: string; verified_at: string }
export interface CertificateResult { status: 'pending' | 'active' | 'failed'; certificate_reference?: string; expires_at?: string; error_code?: string }
export interface EdgeResult { status: 'pending' | 'active' | 'failed'; route_reference?: string; dns_target?: string; error_code?: string }
export interface SslProvisioner { provision(domain: VerifiedDomain): Promise<CertificateResult>; revoke(domain: VerifiedDomain): Promise<void> }
export interface EdgeProvisioner { configure(domain: VerifiedDomain, certificateReference: string): Promise<EdgeResult>; disable(domain: VerifiedDomain): Promise<void> }
export interface ActiveDomainMapping extends DomainScope { id: string; hostname: string; application_type: string; product_slug: string }
export interface DomainResolver { resolve(hostname: string): Promise<ActiveDomainMapping | null> }
export interface DomainDeliveryAdapters { ssl: SslProvisioner; edge: EdgeProvisioner; resolver: DomainResolver }
export class UnconfiguredSslProvisioner implements SslProvisioner {
  async provision(domain: VerifiedDomain): Promise<CertificateResult> { void domain; throw new AppError(503, 'DOMAIN_DELIVERY_UNAVAILABLE', 'Configure a certificate issuer before provisioning SSL.'); }
  async revoke(domain: VerifiedDomain): Promise<void> { void domain; throw new AppError(503, 'DOMAIN_DELIVERY_UNAVAILABLE', 'Configure a certificate issuer before revoking SSL.'); }
}
export class UnconfiguredEdgeProvisioner implements EdgeProvisioner {
  async configure(domain: VerifiedDomain, certificateReference: string): Promise<EdgeResult> { void domain; void certificateReference; throw new AppError(503, 'DOMAIN_DELIVERY_UNAVAILABLE', 'Configure an edge provider before provisioning a route.'); }
  async disable(domain: VerifiedDomain): Promise<void> { void domain; throw new AppError(503, 'DOMAIN_DELIVERY_UNAVAILABLE', 'Configure an edge provider before disabling a route.'); }
}
/** Resolution identifies an active mapping; it never grants staff or client authorization. */
export class DatabaseDomainResolver implements DomainResolver {
  constructor(private readonly db: Database) {}
  async resolve(hostname: string): Promise<ActiveDomainMapping | null> {
    const normalized = normalizeHostname(hostname);
    return this.db.transaction({ core: true }, async tx => {
      const { rows } = await tx.query<ActiveDomainMapping>(`SELECT d.id,d.hostname,d.organization_id,d.brand_id,d.environment_id,d.product_instance_id,d.application_type,p.slug AS product_slug FROM domains d JOIN organizations o ON o.id=d.organization_id JOIN brands b ON b.id=d.brand_id AND b.organization_id=d.organization_id JOIN environments e ON e.id=d.environment_id AND e.brand_id=d.brand_id AND e.organization_id=d.organization_id JOIN product_instances i ON i.id=d.product_instance_id AND i.organization_id=d.organization_id AND i.brand_id=d.brand_id AND i.environment_id=d.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id AND s.organization_id=i.organization_id AND s.product_id=i.product_id WHERE d.hostname=$1 AND d.status='active' AND d.verified_at IS NOT NULL AND d.ssl_status='active' AND d.edge_status='active' AND o.status='active' AND b.status='active' AND e.status='active' AND i.status='active' AND p.status='active' AND s.status='active'`, [normalized]);
      if (!rows[0]) return null;
      const certificate = (await tx.query<{ certificate_expires_at: string; certificate_reference: string; edge_reference: string }>('SELECT certificate_expires_at,certificate_reference,edge_reference FROM domains WHERE id=$1', [rows[0].id])).rows[0];
      if (!certificate?.certificate_reference || !certificate.edge_reference || new Date(certificate.certificate_expires_at).getTime() <= Date.now()) return null;
      return rows[0];
    });
  }
}
