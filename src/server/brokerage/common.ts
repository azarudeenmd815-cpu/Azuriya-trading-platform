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
