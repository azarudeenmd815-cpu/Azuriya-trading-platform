import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import type { TenantContext, Row } from '../../shared/types.js';
import { AppError } from './errors.js';
import { verificationRecord } from './dns.js';
import { ActivationService } from './activation-service.js';
import { boundDatabase } from '../api/idempotency.js';
export interface CertificateState { hostname: string; ssl_status: 'pending' | 'requested' | 'validating' | 'issued' | 'renewing' | 'active' | 'failed' | 'revoked'; edge_status: 'pending' | 'active' | 'failed'; certificate_issuer?: string; certificate_reference?: string; certificate_expires_at?: string; edge_reference?: string; dns_target?: string; error_code?: string }
export interface DomainProvider { reconcile(domain: Row): Promise<CertificateState>; disable(domain: Row): Promise<void> }
/** Bridge API is deployed with the operator's certificate/edge provider. Private keys stay there. */
export class HttpsDomainProvider implements DomainProvider {
  constructor(private endpoint = process.env.DOMAIN_PROVIDER_URL, private token = process.env.DOMAIN_PROVIDER_TOKEN) {}
  private async call(domain: Row, method: string): Promise<CertificateState> {
    if (!this.endpoint || !this.token) throw new AppError(503, 'DOMAIN_DELIVERY_UNAVAILABLE', 'The certificate and edge provider is not configured.');
    const url = new URL(this.endpoint); if (url.protocol !== 'https:' || url.username || url.password) throw new AppError(503, 'DOMAIN_PROVIDER_INVALID', 'Use an authenticated HTTPS provider bridge.');
    const response = await fetch(new URL(`/v1/hostnames/${String(domain.id)}`, url), { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${String(domain.id)}:${String(domain.challenge_version)}:${method}` }, ...(method === 'PUT' ? { body: JSON.stringify({ hostname: domain.hostname, organization_id: domain.organization_id, brand_id: domain.brand_id, environment_id: domain.environment_id, product_instance_id: domain.product_instance_id, application_type: domain.application_type, verified_at: domain.verified_at, certificate_reference: domain.certificate_reference }) } : {}) });
    if (!response.ok) throw new AppError(503, 'DOMAIN_PROVIDER_FAILED', 'The domain provider did not accept the request.');
    if (method === 'DELETE') return { hostname: String(domain.hostname), ssl_status: 'revoked', edge_status: 'pending' };
    const data = await response.json() as CertificateState;
    if (data.hostname !== domain.hostname || !['pending','requested','validating','issued','renewing','active','failed','revoked'].includes(data.ssl_status) || !['pending','active','failed'].includes(data.edge_status)) throw new AppError(503, 'DOMAIN_PROVIDER_INVALID_RESPONSE', 'The provider returned an invalid hostname or lifecycle state.');
    for (const value of [data.certificate_issuer, data.certificate_reference, data.edge_reference, data.dns_target, data.error_code]) if (value && (!/^[A-Za-z0-9_.:/-]{1,250}$/.test(value))) throw new AppError(503, 'DOMAIN_PROVIDER_INVALID_RESPONSE', 'The provider returned unsafe lifecycle metadata.');
    return data;
  }
  reconcile(domain: Row): Promise<CertificateState> { return this.call(domain, 'PUT'); }
  async disable(domain: Row): Promise<void> { await this.call(domain, 'DELETE'); }
}
export class DomainActivationService {
  constructor(private db: Database, private provider: DomainProvider = new HttpsDomainProvider()) {}
  private authorize(actor: TenantContext) { if (actor.core || !actor.permissions.includes('domains.write')) throw new AppError(403, 'PERMISSION_DENIED', 'Tenant domain administration is required.'); }
  private scope(actor: TenantContext): unknown[] { return [actor.organizationId, actor.brandId, actor.environmentId, actor.productInstanceId]; }
  private async current(actor: TenantContext, id: string) { this.authorize(actor); return this.db.transaction({ organizationId: actor.organizationId }, async tx => { const row = (await tx.query<Row>('SELECT d.* FROM domains d JOIN product_instances i ON i.id=d.product_instance_id JOIN organizations o ON o.id=d.organization_id JOIN brands b ON b.id=d.brand_id JOIN environments e ON e.id=d.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE d.organization_id=$1 AND d.brand_id=$2 AND d.environment_id=$3 AND d.product_instance_id=$4 AND d.id=$5 AND o.status=\'active\' AND b.status=\'active\' AND e.status=\'active\' AND i.status=\'active\' AND p.status=\'active\' AND s.status=\'active\'', [...this.scope(actor), id])).rows[0]; if (!row) throw new AppError(404, 'NOT_FOUND', 'An active tenant domain scope was not found.'); return row; }); }
  async rotateChallenge(actor: TenantContext, id: string) {
    const old = await this.current(actor, id); if (['disabled','suspended'].includes(String(old.status))) throw new AppError(409, 'DOMAIN_DISABLED', 'The domain is disabled.');
    const token = randomBytes(32).toString('base64url');
    return this.db.transaction({ organizationId: actor.organizationId }, async tx => {
      const row = (await tx.query<Row>("UPDATE domains SET verification_token=$1,verification_expires_at=now()+interval '24 hours',challenge_version=challenge_version+1,verification_attempts=0,verified_at=NULL,status='awaiting_dns',ssl_status='revoked',edge_status='pending',failure_information=NULL,updated_at=now() WHERE id=$2 AND organization_id=$3 AND status NOT IN('disabled','suspended') RETURNING *", [token, id, actor.organizationId])).rows[0];
      if (!row) throw new AppError(409, 'DOMAIN_STATE_CHANGED', 'The domain lifecycle changed during this operation.');
      if (row.certificate_reference || row.edge_reference) await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(),actor.organizationId,'domain.delivery_cleanup',JSON.stringify({ domain_id: id, challenge_version: row.challenge_version })]);
      await new ActivationService(boundDatabase(tx, actor)).audit(tx, actor, 'domain.challenge_rotated', 'domain', id); const { verification_token: _token, ...safe } = row; void _token;
      return { ...safe, verification_record: verificationRecord(String(row.hostname), token) };
    });
  }
  async reconcile(actor: TenantContext, id: string) {
    const original = await this.current(actor, id);
    if (!original.verified_at || ['disabled','suspended','awaiting_dns'].includes(String(original.status))) throw new AppError(409, 'DOMAIN_NOT_VERIFIED', 'Verify domain ownership before requesting HTTPS delivery.');
    const claim = await this.db.transaction({ organizationId: actor.organizationId }, tx => tx.query("UPDATE domains SET certificate_last_attempt_at=now(),ssl_status=CASE WHEN ssl_status='active' THEN 'renewing' ELSE 'requested' END,status=CASE WHEN status='active' THEN 'ssl_provisioning' ELSE status END WHERE id=$1 AND challenge_version=$2 AND verified_at IS NOT NULL AND status NOT IN('disabled','suspended','awaiting_dns') RETURNING id", [id, original.challenge_version]));
    if (!claim.rows[0]) throw new AppError(409, 'DOMAIN_STATE_CHANGED', 'Domain ownership changed during provisioning.');
    let state: CertificateState;
    try { state = await this.provider.reconcile(original); }
    catch (error) { await this.failure(actor, id, original.challenge_version, 'PROVIDER_UNAVAILABLE'); throw error; }
    const expiry = state.certificate_expires_at ? new Date(state.certificate_expires_at).getTime() : 0;
    const active = state.ssl_status === 'active' && state.edge_status === 'active' && state.hostname === original.hostname && Boolean(state.certificate_issuer && state.certificate_reference && state.edge_reference) && expiry > Date.now();
    if (state.ssl_status === 'active' && state.edge_status === 'pending' && state.certificate_issuer && state.certificate_reference && expiry > Date.now()) state.ssl_status = 'issued';
    else if ((state.ssl_status === 'active' || state.edge_status === 'active') && !active) { await this.failure(actor,id,original.challenge_version,'PROVIDER_EVIDENCE_INCOMPLETE'); throw new AppError(503, 'DOMAIN_PROVIDER_INCOMPLETE', 'Active delivery requires issuer, certificate expiry and edge evidence.'); }
    return this.db.transaction({ organizationId: actor.organizationId }, async tx => {
      const row = (await tx.query<Row>('UPDATE domains SET status=$1,ssl_status=$2,edge_status=$3,certificate_issuer=$4,certificate_reference=$5,certificate_expires_at=$6,edge_reference=$7,dns_target=COALESCE($8,dns_target),failure_information=$9,provider_last_checked_at=now(),updated_at=now() WHERE id=$10 AND challenge_version=$11 AND verified_at IS NOT NULL AND status NOT IN(\'disabled\',\'suspended\',\'awaiting_dns\') RETURNING id,hostname,status,ssl_status,edge_status,certificate_issuer,certificate_reference,certificate_expires_at,edge_reference,provider_last_checked_at,dns_target', [active ? 'active' : state.ssl_status === 'failed' || state.ssl_status === 'revoked' ? 'failed' : 'ssl_provisioning', state.ssl_status, state.edge_status, state.certificate_issuer ?? null, state.certificate_reference ?? null, state.certificate_expires_at ?? null, state.edge_reference ?? null, state.dns_target ?? null, state.error_code ?? null, id, original.challenge_version])).rows[0];
      if (!row) throw new AppError(409, 'DOMAIN_STATE_CHANGED', 'Domain ownership changed during provisioning.');
      await new ActivationService(boundDatabase(tx, actor)).audit(tx, actor, active ? 'domain.activated' : 'domain.delivery_updated', 'domain', id); return row;
    });
  }
  private async failure(actor: TenantContext, id: string, version: unknown, code: string) {
    await this.db.transaction({ organizationId: actor.organizationId }, async tx => {
      const updated = await tx.query("UPDATE domains SET ssl_status='failed',edge_status='pending',status='failed',failure_information=$3,provider_last_checked_at=now(),updated_at=now() WHERE id=$1 AND challenge_version=$2 AND status NOT IN('disabled','suspended','awaiting_dns') RETURNING id", [id,version,code]);
      if (updated.rows[0]) await new ActivationService(boundDatabase(tx,actor)).audit(tx,actor,'domain.failed','domain',id);
    });
  }
  async disableDelivery(actor: TenantContext, id: string) { const domain = await this.current(actor, id); if (domain.certificate_reference || domain.edge_reference) await this.provider.disable(domain); }
}
