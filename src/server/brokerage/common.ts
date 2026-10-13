import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Row, TenantContext } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { idempotent, idempotencyRoute, validateIdempotency } from '../api/idempotency.js';
import { AppError } from '../domain/errors.js';
import { safeMetadata } from '../domain/utils.js';
import type { Auth } from '../security/auth.js';
import type { Tenancy } from '../security/tenancy.js';
import { encryptSecret, verifyPassword } from '../security/crypto.js';
import { renderTemplate } from './communications.js';

export function scopeValues(scope: TenantContext): [string, string, string, string] { return [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId]; }
export function scopeWhere(alias = ''): string { const prefix = alias ? `${alias}.` : ''; return ['organization_id', 'brand_id', 'environment_id', 'product_instance_id'].map((field, index) => `${prefix}${field}=$${index + 1}`).join(' AND '); }

/** Re-authorize direct brokerage service calls against the canonical tenant grants. */
export async function authorizeBrokerageStaff(tx: Executor, scope: TenantContext, permission: string, mutate = false): Promise<void> {
  const uuidFields = [scope.userId, scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId];
  const optionalMarkers = [scope.credentialId, scope.supportGrantId];
  if ((scope.credentialId !== undefined && scope.supportGrantId !== undefined) || scope.core !== false || scope.productSlug !== 'brokerage-crm' || uuidFields.some(value => typeof value !== 'string' || !z.uuid().safeParse(value).success) || optionalMarkers.some(value => value !== undefined && (typeof value !== 'string' || !z.uuid().safeParse(value).success)) || typeof scope.requestId !== 'string' || scope.requestId.length < 1 || scope.requestId.length > 200 || !Array.isArray(scope.permissions) || scope.permissions.some(value => typeof value !== 'string')) {
    throw new AppError(403, 'TENANT_CONTEXT_REQUIRED', 'A complete authenticated brokerage tenant context is required.');
  }
  if (!scope.permissions.includes(permission)) throw new AppError(403, 'PERMISSION_DENIED', `The ${permission} permission is required.`);
  if (mutate && scope.supportGrantId) throw new AppError(403, 'BROKERAGE_SUPPORT_READ_ONLY', 'Brokerage changes require business staff.');
  const instance = (await tx.query(`SELECT i.id FROM product_instances i JOIN organizations o ON o.id=i.organization_id JOIN brands b ON b.id=i.brand_id AND b.organization_id=i.organization_id JOIN environments e ON e.id=i.environment_id AND e.organization_id=i.organization_id AND e.brand_id=i.brand_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id AND s.organization_id=i.organization_id AND s.product_id=i.product_id WHERE i.organization_id=$1 AND i.brand_id=$2 AND i.environment_id=$3 AND i.id=$4 AND i.status='active' AND o.status='active' AND b.status='active' AND e.status='active' AND p.status='active' AND p.slug='brokerage-crm' AND s.status='active'`, [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId])).rows[0];
  if (!instance) throw new AppError(403, 'TENANT_CONTEXT_INVALID', 'The authenticated tenant scope is not valid for this product instance.');
  if (scope.supportGrantId) {
    const support = (await tx.query(`SELECT 1 FROM support_access_grants sag WHERE sag.id=$1 AND sag.user_id=$2 AND sag.organization_id=$3 AND sag.brand_id=$4 AND sag.environment_id=$5 AND sag.product_instance_id=$6 AND sag.revoked_at IS NULL AND sag.starts_at<=now() AND sag.expires_at>now() AND sag.scopes @> $7::jsonb AND EXISTS (SELECT 1 FROM users u WHERE u.id=sag.user_id AND u.status='active' AND u.core_role='super_admin') LIMIT 1`, [scope.supportGrantId, scope.userId, scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, JSON.stringify([permission])])).rows[0];
    if (!support) throw new AppError(403, 'PERMISSION_DENIED', `The ${permission} permission is required.`);
    return;
  }
  if (scope.credentialId) {
    const credential = (await tx.query(`SELECT 1 FROM api_keys k JOIN users u ON u.id=k.created_by AND u.status='active' AND u.core_role IS NULL WHERE k.id=$1 AND k.created_by=$2 AND k.organization_id=$3 AND k.brand_id=$4 AND k.environment_id=$5 AND k.product_instance_id=$6 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now()) AND k.scopes @> $7::jsonb UNION ALL SELECT 1 FROM service_accounts s JOIN users u ON u.id=s.created_by AND u.status='active' AND u.core_role IS NULL WHERE s.id=$1 AND s.created_by=$2 AND s.organization_id=$3 AND s.brand_id=$4 AND s.environment_id=$5 AND s.product_instance_id=$6 AND s.status='active' AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now()) AND s.scopes @> $7::jsonb LIMIT 1`, [scope.credentialId, scope.userId, scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, JSON.stringify([permission])])).rows[0];
    if (!credential) throw new AppError(403, 'PERMISSION_DENIED', `The ${permission} permission is required.`);
    return;
  }
  const grant = (await tx.query(`SELECT 1 FROM staff_memberships m JOIN users u ON u.id=m.user_id AND u.status='active' AND u.core_role IS NULL JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id JOIN role_permissions rp ON rp.role_id=r.id AND rp.organization_id=m.organization_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.status='active' AND (m.environment_id IS NULL OR m.environment_id=$3) AND (m.product_instance_id IS NULL OR m.product_instance_id=$4) AND rp.permission_code=$5 LIMIT 1`, [scope.userId, scope.organizationId, scope.environmentId, scope.productInstanceId, permission])).rows[0];
  if (!grant) throw new AppError(403, 'PERMISSION_DENIED', `The ${permission} permission is required.`);
}
export interface BrokerageRouteContext {
  db: Database; auth: Auth; tenancy: Tenancy;
  staff(request: FastifyRequest, permission: string, mutate?: boolean): Promise<TenantContext>;
  client(request: FastifyRequest, mutate?: boolean): Promise<TenantContext>;
  atomic<T>(request: FastifyRequest, reply: FastifyReply, scope: TenantContext, work: (bound: Database) => Promise<T>): Promise<T>;
  highRisk(request: FastifyRequest, scope: TenantContext): Promise<void>;
}
export function brokerageContext(db: Database, auth: Auth, tenancy: Tenancy): BrokerageRouteContext {
  const instanceId = (request: FastifyRequest) => z.object({ instanceId: z.uuid() }).parse(request.params).instanceId;
  const product = (scope: TenantContext) => { if (scope.productSlug !== 'brokerage-crm') throw new AppError(404, 'PRODUCT_UNAVAILABLE', 'Brokerage operations are available in a Brokerage CRM workspace.'); return scope; };
  return {
    db, auth, tenancy,
    staff: async (request, permission, mutate = false) => {
      const scope = product(await tenancy.tenant(request, instanceId(request), permission, mutate));
      if (mutate && scope.supportGrantId) throw new AppError(403, 'BROKERAGE_SUPPORT_READ_ONLY', 'Brokerage changes require business staff.');
      return scope;
    },
    client: async (request, mutate = false) => {
      const principal = await (mutate ? auth.mutation(request) : auth.authenticate(request));
      const context = await tenancy.client(request, instanceId(request));
      const instance = context.instance as Row;
      // Tenancy.client has already checked active membership and the complete instance hierarchy.
      return db.transaction({ core: true }, async tx => {
        const row = (await tx.query<{ organization_id: string; brand_id: string; environment_id: string }>('SELECT organization_id,brand_id,environment_id FROM product_instances WHERE id=$1', [instance.id])).rows[0];
        return product({ userId: principal.user.id, requestId: request.id, core: false, organizationId: row.organization_id, brandId: row.brand_id, environmentId: row.environment_id, productInstanceId: String(instance.id), productSlug: String((context.product as Row).slug), permissions: [] });
      });
    },
    atomic: async (request, reply, scope, work) => {
      const principal = await auth.authenticate(request);
      const result = await idempotent(db, scope, { key: validateIdempotency(request), route: idempotencyRoute(request), payload: request.body, credentialId: principal.key?.id }, work);
      reply.header('Idempotency-Replayed', String(result.replayed)); return result.result;
    },
    highRisk: async (request, scope) => {
      const principal = await auth.authenticate(request);
      if (principal.kind !== 'session' || scope.supportGrantId) throw new AppError(403, 'INTERACTIVE_APPROVAL_REQUIRED', 'A business staff session is required for this approval.');
      const password = request.headers['x-reauth-password'];
      if (typeof password !== 'string' || password.length > 256) throw new AppError(403, 'REAUTH_REQUIRED', 'Confirm your password before approving or processing funds.');
      const user = (await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1 AND status=\'active\'', [principal.user.id])).rows[0];
      if (!user || !await verifyPassword(password, user.password_hash)) throw new AppError(403, 'REAUTH_REQUIRED', 'Password confirmation was unsuccessful.');
      const session = (await db.query<{ mfa_verified_at: string | null }>('SELECT mfa_verified_at FROM sessions WHERE id=$1 AND user_id=$2 AND expires_at>now()', [principal.sessionId, principal.user.id])).rows[0];
      if (!await auth.mfa.enrolled(principal.user.id) || !session?.mfa_verified_at || Date.now() - new Date(session.mfa_verified_at).getTime() > 15 * 60_000) throw new AppError(403, 'RECENT_MFA_REQUIRED', 'Sign in with your authenticator to approve or process funds. Approval verification lasts 15 minutes.');
    },
  };
}

/** Business events never include note text, provider secrets, or payout destinations. */
export async function recordEvent(tx: Executor, scope: TenantContext, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const clean = safeMetadata(Object.fromEntries(Object.entries(metadata).filter(([key]) => !/destination|bank|document_content|note|address/i.test(key))));
  const id = randomUUID();
  await tx.query('INSERT INTO audit_events(id,organization_id,brand_id,environment_id,product_instance_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id, ...scopeValues(scope), scope.userId, action, resourceType, resourceId, scope.requestId, JSON.stringify(clean)]);
  await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(), scope.organizationId, action, JSON.stringify({ ...clean as object, scope: { organization_id: scope.organizationId, brand_id: scope.brandId, environment_id: scope.environmentId, product_instance_id: scope.productInstanceId }, resource_type: resourceType, resource_id: resourceId, audit_event_id: id })]);
  // Staff-only changes remain staff-only. Only explicitly identified clients receive a safe notification.
  let clientId = metadata.client_id ?? (resourceType === 'brokerage_client' ? resourceId : undefined);
  let partnerId = metadata.partner_id ?? (resourceType === 'partner' ? resourceId : undefined);
  if (!clientId && resourceType === 'partner_payout' && !partnerId) partnerId = (await tx.query<{ partner_id: string }>(`SELECT partner_id FROM brokerage_partner_payouts WHERE ${scopeWhere()} AND id=$5`, [...scopeValues(scope), resourceId])).rows[0]?.partner_id;
  if (!clientId && typeof partnerId === 'string') clientId = (await tx.query<{ client_id: string }>(`SELECT client_id FROM brokerage_partners WHERE ${scopeWhere()} AND id=$5`, [...scopeValues(scope), partnerId])).rows[0]?.client_id;
  let recipient: string | null = null;
  if (typeof clientId === 'string') recipient = (await tx.query<{ user_id: string | null }>(`SELECT user_id FROM brokerage_clients WHERE ${scopeWhere()} AND id=$5`, [...scopeValues(scope), clientId])).rows[0]?.user_id ?? null;
  if (!/note|task|assignment|risk|tag/.test(action)) await tx.query('INSERT INTO brokerage_notifications(id,organization_id,brand_id,environment_id,product_instance_id,recipient_user_id,event_type,resource_type,resource_id,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [randomUUID(), ...scopeValues(scope), recipient, action, resourceType, resourceId, action.replace(/^brokerage\./, '').replace(/[._]/g, ' ')]);
  if (recipient && process.env.SECRET_ENCRYPTION_KEY && !/note|task|assignment|risk|tag/.test(action)) {
    const template = (await tx.query<{ subject: string; body: string }>(`SELECT subject,body FROM brokerage_email_templates WHERE ${scopeWhere()} AND event_type=$5 AND enabled=true`, [...scopeValues(scope), action])).rows[0];
    if (template) {
      const client = (await tx.query<{ email: string; full_name: string; client_number: string }>(`SELECT email,full_name,client_number FROM brokerage_clients WHERE ${scopeWhere()} AND user_id=$5`, [...scopeValues(scope), recipient])).rows[0];
      const brand = (await tx.query<{ name: string; config: Record<string, string> }>('SELECT name,config FROM brands WHERE organization_id=$1 AND id=$2', [scope.organizationId, scope.brandId])).rows[0];
      const variables = { business_name: brand.config.business_name || brand.name, client_name: client.full_name, client_number: client.client_number, event: action.replace(/[._]/g, ' '), status: typeof metadata.status === 'string' ? metadata.status : '', support_email: brand.config.support_email || '' };
      const message = { to: client.email, subject: renderTemplate(template.subject, variables), text: renderTemplate(template.body, variables), business_name: variables.business_name, return_url: '', organization_id: scope.organizationId, brand_id: scope.brandId, environment_id: scope.environmentId, product_instance_id: scope.productInstanceId, user_id: recipient };
      await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(), scope.organizationId, 'brokerage.email', JSON.stringify({ encrypted_message: encryptSecret(JSON.stringify(message), process.env.SECRET_ENCRYPTION_KEY) })]);
    }
  }
}
