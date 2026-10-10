import type { FastifyRequest } from 'fastify';
import type { Actor, Row, TenantContext } from '../../shared/types.js';
import type { Database } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import type { Auth, Principal } from './auth.js';
import { randomUUID } from 'node:crypto';

interface Instance { id: string; organization_id: string; brand_id: string; environment_id: string; product_slug: string }
export class Tenancy {
  constructor(private db: Database, private auth: Auth, private limitTenant?: (context: TenantContext) => Promise<void>) {}
  async core(request: FastifyRequest, mutate = false): Promise<Actor> {
    const principal = await (mutate ? this.auth.mutation(request) : this.auth.authenticate(request));
    if (principal.kind !== 'session' || principal.user.core_role !== 'super_admin') throw new AppError(403, 'CORE_ACCESS_REQUIRED', 'Core administration requires an Azuriya staff account.');
    return { userId: principal.user.id, requestId: request.id, core: true };
  }
  async tenant(request: FastifyRequest, instanceId: string, permission?: string, mutate = false): Promise<TenantContext> {
    const principal = await (mutate ? this.auth.mutation(request) : this.auth.authenticate(request));
    const context = await this.db.transaction({ core: true }, async tx => {
      const { rows } = await tx.query<Instance>(`SELECT i.id,i.organization_id,i.brand_id,i.environment_id,p.slug AS product_slug FROM product_instances i JOIN products p ON p.id=i.product_id JOIN brands b ON b.id=i.brand_id JOIN organizations o ON o.id=i.organization_id JOIN environments e ON e.id=i.environment_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE i.id=$1 AND i.status='active' AND o.status='active' AND b.status='active' AND p.status='active' AND e.status='active' AND s.status='active'`, [instanceId]);
      const instance = rows[0];
      if (!instance) throw new AppError(403, 'TENANT_ACCESS_DENIED', 'This product instance is not available to your account.');
      let codes: string[]; let supportGrantId: string | undefined;
      if (principal.kind === 'api') {
        const key = principal.key!;
        if (key.product_instance_id !== instance.id || key.organization_id !== instance.organization_id || key.brand_id !== instance.brand_id || key.environment_id !== instance.environment_id) throw new AppError(403, 'TENANT_ACCESS_DENIED', 'This credential does not authorize this product instance.');
        codes = key.scopes;
      } else if (principal.user.core_role) {
        const grantId = request.headers['x-support-grant-id'];
        if (typeof grantId !== 'string' || !/^[a-f0-9-]{36}$/i.test(grantId)) throw new AppError(403, 'SUPPORT_GRANT_REQUIRED', 'Core support access requires an explicit tenant-approved grant.');
        const grant = (await tx.query<{ scopes: string[] }>(`SELECT scopes FROM support_access_grants WHERE id=$1 AND user_id=$2 AND organization_id=$3 AND brand_id=$4 AND environment_id=$5 AND product_instance_id=$6 AND revoked_at IS NULL AND starts_at<=now() AND expires_at>now() FOR UPDATE`, [grantId, principal.user.id, instance.organization_id, instance.brand_id, instance.environment_id, instance.id])).rows[0];
        if (!grant || (permission && !grant.scopes.includes(permission))) throw new AppError(403, 'SUPPORT_ACCESS_DENIED', 'The support grant does not authorize this operation.');
        if (mutate && permission && ['staff.write','roles.write','api.write'].includes(permission)) throw new AppError(403, 'SUPPORT_DELEGATION_DENIED', 'Use a tenant administrator for identity, role or credential changes.');
        codes = grant.scopes;
        supportGrantId = grantId;
        await tx.query('UPDATE support_access_grants SET last_used_at=now() WHERE id=$1', [grantId]);
        await tx.query('INSERT INTO audit_events(id,organization_id,brand_id,environment_id,product_instance_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [randomUUID(), instance.organization_id, instance.brand_id, instance.environment_id, instance.id, principal.user.id, 'support.access_used', 'support_grant', grantId, request.id, JSON.stringify({ route: request.routeOptions.url, method: request.method })]);
      } else {
        const permissions = await tx.query<{ permission_code: string }>(`SELECT DISTINCT rp.permission_code FROM staff_memberships m JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id JOIN role_permissions rp ON rp.role_id=r.id AND rp.organization_id=m.organization_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.status='active' AND (m.environment_id IS NULL OR m.environment_id=$3) AND (m.product_instance_id IS NULL OR m.product_instance_id=$4)`, [principal.user.id, instance.organization_id, instance.environment_id, instance.id]);
        if (!permissions.rows.length) throw new AppError(403, 'TENANT_ACCESS_DENIED', 'You do not have an active staff membership for this product instance.');
        codes = permissions.rows.map(row => row.permission_code);
      }
      return { userId: principal.user.id, requestId: request.id, core: false, organizationId: instance.organization_id, brandId: instance.brand_id, environmentId: instance.environment_id, productInstanceId: instance.id, productSlug: instance.product_slug, permissions: codes, supportGrantId, credentialId: principal.kind === 'api' ? principal.key?.id : undefined };
    });
    if (permission && !context.permissions.includes(permission)) throw new AppError(403, 'PERMISSION_DENIED', `The ${permission} permission is required.`);
    await this.limitTenant?.(context);
    return context;
  }
  async context(actor: TenantContext): Promise<Record<string, unknown>> {
    return this.db.transaction({ organizationId: actor.organizationId }, async tx => {
      const organization = (await tx.query<Row>('SELECT id,name,slug,business_type,status FROM organizations WHERE id=$1', [actor.organizationId])).rows[0];
      const brand = (await tx.query<Row>('SELECT id,organization_id,name,config FROM brands WHERE id=$1 AND organization_id=$2', [actor.brandId, actor.organizationId])).rows[0];
      const environment = (await tx.query<Row>('SELECT id,name,kind,status FROM environments WHERE id=$1 AND organization_id=$2', [actor.environmentId, actor.organizationId])).rows[0];
      const instance = (await tx.query<Row>('SELECT id,name,status,config,product_id FROM product_instances WHERE id=$1 AND organization_id=$2', [actor.productInstanceId, actor.organizationId])).rows[0];
      const product = (await tx.query<Row>('SELECT id,name,slug,modules FROM products WHERE id=$1', [instance.product_id])).rows[0];
      return { organization, brand, environment, instance, product, permissions: actor.permissions };
    });
  }
  async memberships(principal: Principal) {
    return this.db.transaction({ core: true }, async tx => {
      const staff = await tx.query<Row>(`SELECT DISTINCT i.id AS product_instance_id,i.name AS instance_name,p.name AS product_name,p.slug AS product_slug,o.name AS organization_name,o.id AS organization_id,b.name AS brand_name,e.name AS environment_name,e.kind AS environment_kind,r.name AS role_name FROM staff_memberships m JOIN organizations o ON o.id=m.organization_id JOIN roles r ON r.id=m.role_id JOIN product_instances i ON i.organization_id=m.organization_id JOIN brands b ON b.id=i.brand_id JOIN environments e ON e.id=i.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE m.user_id=$1 AND m.status='active' AND o.status='active' AND i.status='active' AND b.status='active' AND p.status='active' AND e.status='active' AND s.status='active' AND (m.environment_id IS NULL OR m.environment_id=i.environment_id) AND (m.product_instance_id IS NULL OR m.product_instance_id=i.id) ORDER BY o.name,p.name`, [principal.user.id]);
      const clients = await tx.query<Row>(`SELECT i.id AS product_instance_id,i.name AS instance_name,p.name AS product_name,p.slug AS product_slug,o.name AS organization_name,b.name AS brand_name FROM client_memberships m JOIN product_instances i ON i.id=m.product_instance_id AND i.organization_id=m.organization_id JOIN organizations o ON o.id=m.organization_id JOIN brands b ON b.id=i.brand_id JOIN products p ON p.id=i.product_id JOIN environments e ON e.id=i.environment_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE m.user_id=$1 AND m.status='active' AND o.status='active' AND i.status='active' AND b.status='active' AND p.status='active' AND e.status='active' AND s.status='active' ORDER BY o.name,p.name`, [principal.user.id]);
      return { memberships: staff.rows, client_memberships: clients.rows };
    });
  }
  async client(request: FastifyRequest, instanceId: string) {
    const principal = await this.auth.authenticate(request);
    if (principal.kind !== 'session' || principal.user.core_role) throw new AppError(403, 'CLIENT_ACCESS_REQUIRED', 'Client portals require a separate customer session.');
    const instance = await this.db.transaction({ core: true }, async tx => {
      const { rows } = await tx.query<Instance>(`SELECT i.id,i.organization_id,i.brand_id,i.environment_id,p.slug AS product_slug FROM client_memberships m JOIN product_instances i ON i.id=m.product_instance_id AND i.organization_id=m.organization_id JOIN products p ON p.id=i.product_id JOIN brands b ON b.id=i.brand_id JOIN organizations o ON o.id=i.organization_id JOIN environments e ON e.id=i.environment_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE m.user_id=$1 AND i.id=$2 AND m.status='active' AND i.status='active' AND o.status='active' AND b.status='active' AND p.status='active' AND e.status='active' AND s.status='active'`, [principal.user.id, instanceId]);
      if (!rows[0]) throw new AppError(403, 'CLIENT_ACCESS_DENIED', 'This client portal is not available to your account.');
      return rows[0];
    });
    const context = await this.context({ userId: principal.user.id, requestId: request.id, core: false, organizationId: instance.organization_id, brandId: instance.brand_id, environmentId: instance.environment_id, productInstanceId: instance.id, productSlug: instance.product_slug, permissions: [] });
    return { brand: context.brand, instance: context.instance, product: context.product, profile: principal.user };
  }
}
