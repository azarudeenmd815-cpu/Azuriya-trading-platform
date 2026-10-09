import type { ListQuery, Page, Row } from '../../shared/types.js';
import type { Executor } from '../db/database.js';
import { AppError } from './errors.js';
import { safeMetadata, serializable } from './utils.js';

export interface Resource { table: string; columns: string[]; search: string[]; status?: string; join?: string; extras?: string }
const timestamps = ['created_at', 'updated_at'];
export const scopeColumns = ['organization_id', 'brand_id', 'environment_id', 'product_instance_id'];
export const resources: Record<string, Resource> = {
  organizations: { table: 'organizations', columns: ['id', 'name', 'slug', 'business_type', 'status', ...timestamps], search: ['name', 'slug', 'business_type'], status: 'status' },
  brands: { table: 'brands', columns: ['id', 'organization_id', 'name', 'config', 'status', ...timestamps], search: ['name'], status: 'status' },
  environments: { table: 'environments', columns: ['id', 'organization_id', 'brand_id', 'name', 'kind', 'status', ...timestamps], search: ['name', 'kind'], status: 'status' },
  products: { table: 'products', columns: ['id', 'slug', 'name', 'description', 'status', 'modules', ...timestamps], search: ['name', 'slug', 'description'], status: 'status' },
  'product-subscriptions': { table: 'product_subscriptions', columns: ['id', 'organization_id', 'product_id', 'plan', 'status', 'limits', ...timestamps], search: ['plan'], status: 'status', join: ' JOIN products p ON p.id=r.product_id', extras: ',p.name AS product_name,p.slug AS product_slug' },
  'product-instances': { table: 'product_instances', columns: ['id', ...scopeColumns.slice(0, 3), 'subscription_id', 'product_id', 'name', 'status', 'config', ...timestamps], search: ['name'], status: 'status', join: ' JOIN products p ON p.id=r.product_id', extras: ',p.slug AS product_slug,p.name AS product_name' },
  domains: { table: 'domains', columns: ['id', ...scopeColumns, 'hostname', 'application_type', 'verification_method', 'verification_expires_at', 'challenge_version', 'verification_attempts', 'status', 'ssl_status', 'edge_status', 'is_primary', 'dns_target', 'verified_at', 'last_checked_at', 'failure_information', 'certificate_issuer', 'certificate_reference', 'certificate_expires_at', 'edge_reference', 'provider_last_checked_at', 'redirect_config', ...timestamps], search: ['hostname', 'application_type'], status: 'status' },
  'integration-providers': { table: 'integration_providers', columns: ['id', 'name', 'slug', 'category', 'description', 'status', 'connection_mode', 'supported_products', 'managed', 'connector_available', ...timestamps], search: ['name', 'slug', 'category', 'description'], status: 'status', extras: ",CASE WHEN r.connector_available THEN COALESCE((SELECT jsonb_agg(c.capability ORDER BY c.capability) FROM integration_provider_capabilities c WHERE c.provider_id=r.id AND c.capability NOT LIKE 'planned.%'),'[]'::jsonb) ELSE '[]'::jsonb END AS capabilities,COALESCE((SELECT jsonb_agg(CASE WHEN c.capability LIKE 'planned.%' THEN substring(c.capability from 9) ELSE c.capability END ORDER BY c.capability) FROM integration_provider_capabilities c WHERE c.provider_id=r.id AND (c.capability LIKE 'planned.%' OR NOT r.connector_available)),'[]'::jsonb) AS planned_capabilities" },
  'integration-connections': { table: 'integration_connections', columns: ['id', ...scopeColumns, 'provider_id', 'status', 'last_checked_at', ...timestamps], search: ['status'], status: 'status', join: ' JOIN integration_providers p ON p.id=r.provider_id', extras: ',p.name AS provider_name,p.slug AS provider_slug' },
  'integration-requests': { table: 'integration_requests', columns: ['id', ...scopeColumns, 'provider_name', 'website', 'category', 'current_provider', 'notes', 'connection_target', 'status', 'assigned_to', 'assigned_team', 'internal_notes', 'priority', 'requested_by', ...timestamps], search: ['provider_name', 'category', 'current_provider'], status: 'status', join: ' JOIN organizations org ON org.id=r.organization_id LEFT JOIN environments env ON env.id=r.environment_id AND env.organization_id=r.organization_id LEFT JOIN product_instances ins ON ins.id=r.product_instance_id AND ins.organization_id=r.organization_id LEFT JOIN products prod ON prod.id=ins.product_id', extras: ',org.name AS organization_name,env.name AS environment_name,ins.name AS product_instance_name,prod.name AS product_name,prod.slug AS product_slug' },
  'api-applications': { table: 'api_applications', columns: ['id', ...scopeColumns, 'name', 'status', 'scopes', 'created_by', ...timestamps], search: ['name'], status: 'status' },
  'api-keys': { table: 'api_keys', columns: ['id', ...scopeColumns, 'application_id', 'name', 'prefix', 'scopes', 'expires_at', 'revoked_at', 'last_used_at', 'created_by', ...timestamps], search: ['name', 'prefix'], extras: ",CASE WHEN r.revoked_at IS NOT NULL THEN 'revoked' WHEN r.expires_at <= now() THEN 'expired' ELSE 'active' END AS status", status: "CASE WHEN r.revoked_at IS NOT NULL THEN 'revoked' WHEN r.expires_at <= now() THEN 'expired' ELSE 'active' END" },
  'oauth-clients': { table: 'oauth_clients', columns: ['id', ...scopeColumns, 'application_id', 'name', 'client_id', 'redirect_uris', 'scopes', 'status', ...timestamps], search: ['name', 'client_id'], status: 'status' },
  'service-accounts': { table: 'service_accounts', columns: ['id', ...scopeColumns, 'name', 'status', 'scopes', 'application_id', 'prefix', 'expires_at', 'revoked_at', 'last_used_at', 'created_by', ...timestamps], search: ['name'], status: 'status' },
  'webhook-endpoints': { table: 'webhook_endpoints', columns: ['id', ...scopeColumns, 'name', 'url', 'events', 'status', 'secret_version', 'consecutive_failures', 'disable_after_failures', ...timestamps], search: ['name', 'url'], status: 'status', extras: ',(r.signing_secret_reference IS NOT NULL) AS delivery_available' },
  'webhook-deliveries': { table: 'webhook_deliveries', columns: ['id', ...scopeColumns, 'webhook_endpoint_id', 'event_id', 'event_type', 'status', 'attempts', 'next_attempt_at', 'last_attempt_at', 'response_status', 'error', 'delivered_at', ...timestamps], search: ['event_type'], status: 'status' },
  staff: { table: 'staff_memberships', columns: ['id', 'organization_id', 'user_id', 'role_id', 'environment_id', 'product_instance_id', 'status', ...timestamps], search: [], status: 'status', join: ' JOIN users u ON u.id=r.user_id JOIN roles ro ON ro.id=r.role_id AND ro.organization_id=r.organization_id', extras: ',u.email,u.display_name,ro.name AS role_name' },
  roles: { table: 'roles', columns: ['id', 'organization_id', 'name', ...timestamps], search: ['name'], extras: ",COALESCE((SELECT jsonb_agg(rp.permission_code ORDER BY rp.permission_code) FROM role_permissions rp WHERE rp.role_id=r.id AND rp.organization_id=r.organization_id),'[]'::jsonb) AS permissions" },
  'audit-events': { table: 'audit_events', columns: ['id', ...scopeColumns, 'actor_id', 'action', 'resource_type', 'resource_id', 'request_id', 'metadata', 'created_at'], search: ['action', 'resource_type', 'resource_id', 'request_id'] },
  'feature-flags': { table: 'feature_flags', columns: ['key', 'enabled', 'description', ...timestamps], search: ['key', 'description'] },
  'support-access-grants': { table: 'support_access_grants', columns: ['id', ...scopeColumns, 'user_id', 'granted_by', 'reason', 'scopes', 'starts_at', 'expires_at', 'revoked_at', ...timestamps], search: ['reason'] },
};
export const tenantResources: Record<string, { resource: string; permission: string; scope: 'instance' | 'organization' | 'staff' | 'catalog' | 'audit' | 'flags' }> = {
  domains: { resource: 'domains', permission: 'domains.read', scope: 'instance' }, integrations: { resource: 'integration-providers', permission: 'integrations.read', scope: 'catalog' },
  'integration-connections': { resource: 'integration-connections', permission: 'integrations.read', scope: 'instance' }, 'integration-requests': { resource: 'integration-requests', permission: 'integrations.read', scope: 'instance' },
  staff: { resource: 'staff', permission: 'staff.read', scope: 'staff' }, roles: { resource: 'roles', permission: 'roles.read', scope: 'organization' }, 'api-keys': { resource: 'api-keys', permission: 'api.read', scope: 'instance' },
  'api-applications': { resource: 'api-applications', permission: 'api.read', scope: 'instance' },
  'service-accounts': { resource: 'service-accounts', permission: 'api.read', scope: 'instance' },
  'webhook-deliveries': { resource: 'webhook-deliveries', permission: 'webhooks.read', scope: 'instance' },
  'support-access': { resource: 'support-access-grants', permission: 'staff.read', scope: 'instance' },
  webhooks: { resource: 'webhook-endpoints', permission: 'webhooks.read', scope: 'instance' }, audit: { resource: 'audit-events', permission: 'audit.read', scope: 'audit' }, settings: { resource: 'feature-flags', permission: 'settings.read', scope: 'flags' },
};
export async function listRows(tx: Executor, resource: Resource, query: ListQuery, predicates: string[] = [], values: unknown[] = []): Promise<Page> {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) throw new AppError(422, 'INVALID_PAGINATION', 'Limit must be 1–100 and offset a nonnegative integer.');
    const sort = query.sort ?? 'created_at';
    if (!resource.columns.includes(sort)) throw new AppError(422, 'INVALID_SORT', 'Choose a supported sort field.');
    const direction = query.direction ?? 'desc';
    if (!['asc', 'desc'].includes(direction)) throw new AppError(422, 'INVALID_SORT', 'Sort direction must be asc or desc.');
    if (query.search) {
      if (query.search.length > 200) throw new AppError(422, 'INVALID_SEARCH', 'Search must contain at most 200 characters.');
      values.push(`%${query.search.replace(/[\\%_]/g, '\\$&')}%`);
      const searches = resource.search.map(column => `r.${column} ILIKE $${values.length}`);
      if (resource.table === 'staff_memberships') searches.push(`u.email ILIKE $${values.length}`, `u.display_name ILIKE $${values.length}`, `ro.name ILIKE $${values.length}`);
      predicates.push(searches.length ? `(${searches.join(' OR ')})` : 'false');
    }
    if (query.status) {
      if (!resource.status) throw new AppError(422, 'INVALID_FILTER', 'Status filtering is unavailable for this resource.');
      values.push(query.status);
      const status = /^[a-z_]+$/.test(resource.status) ? `r.${resource.status}` : resource.status;
      predicates.push(`(${status})=$${values.length}`);
    }
    const organizationJoin = resource.columns.includes('organization_id') && !resource.extras?.includes(' AS organization_name') ? ' LEFT JOIN organizations scope_org ON scope_org.id=r.organization_id' : '';
    const organizationColumn = organizationJoin ? ',scope_org.name AS organization_name' : '';
    const from = `${resource.table} r${resource.join ?? ''}${organizationJoin}`;
    const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
    const count = await tx.query<{ total: string | number }>(`SELECT count(*) AS total FROM ${from}${where}`, values);
    const rows = await tx.query<Row>(`SELECT ${resource.columns.map(column => `r.${column}`).join(',')}${resource.extras ?? ''}${organizationColumn} FROM ${from}${where} ORDER BY r.${sort} ${direction},r.${resource.columns.includes('id') ? 'id' : 'key'} ${direction} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset]);
    return { data: serializable(rows.rows).map(row => ({ ...row, ...(row.config ? { config: safeMetadata(row.config) } : {}), ...(row.metadata ? { metadata: safeMetadata(row.metadata) } : {}) })), pagination: { total: Number(count.rows[0].total), limit, offset } };
  }
