import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Actor, ApiKeyInput, BrandConfig, DomainInput, IntegrationRequestInput, ListQuery, OrganizationInput, Page, ProvisionInput, RoleInput, Row, StaffInput, TenantContext, WebhookInput } from '../../shared/types.js';
import { applicationTypes, businessTypes, permissions, productSlugs, requestStatuses } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { normalizeHostname, systemDns, verificationRecord, type DnsVerifier } from './dns.js';
import { AppError } from './errors.js';
import { listRows, resources, scopeColumns, tenantResources } from './lists.js';
import { dbCode, name, requireRow, safeMetadata } from './utils.js';


export class FoundationService {
  private readonly dns: DnsVerifier;
  constructor(private readonly db: Database, options?: { dns?: DnsVerifier }) { this.dns = options?.dns ?? systemDns; }
  private requireCore(actor?: Actor): asserts actor is Actor {
    if (!actor?.core) throw new AppError(403, 'CORE_ACCESS_REQUIRED', 'This operation requires Core administrator access.');
  }
  private requireTenant(actor: TenantContext, permission: string): void {
    if (!actor || actor.core || !actor.organizationId || !actor.brandId || !actor.environmentId || !actor.productInstanceId) throw new AppError(403, 'TENANT_ACCESS_REQUIRED', 'This operation requires a trusted tenant staff context.');
    if (!actor.permissions?.includes(permission)) throw new AppError(403, 'PERMISSION_DENIED', `The ${permission} permission is required.`);
  }
  private async transaction<T>(actor: Actor, work: (tx: Executor) => Promise<T>): Promise<T> {
    try { return await this.db.transaction({ core: actor.core, organizationId: actor.organizationId }, work); }
    catch (error) {
      if (error instanceof AppError) throw error;
      const code = dbCode(error);
      if (code === '23505') throw new AppError(409, 'ALREADY_EXISTS', 'A resource with these identifying fields already exists.');
      if (code === '23503' || code === '23514' || code === '22P02') throw new AppError(422, 'INVALID_RELATIONSHIP', 'The resource references an invalid scope or value.');
      throw error;
    }
  }
  private async tenant<T>(actor: TenantContext, permission: string, work: (tx: Executor) => Promise<T>): Promise<T> {
    this.requireTenant(actor, permission);
    return this.transaction(actor, async tx => {
      const scope = await tx.query<Row>(`SELECT i.id,(i.status='active' AND o.status='active' AND b.status='active' AND e.status='active' AND p.status='active' AND s.status='active') AS available FROM product_instances i JOIN organizations o ON o.id=i.organization_id JOIN brands b ON b.id=i.brand_id AND b.organization_id=i.organization_id JOIN environments e ON e.id=i.environment_id AND e.brand_id=i.brand_id AND e.organization_id=i.organization_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id AND s.organization_id=i.organization_id AND s.product_id=i.product_id WHERE i.id=$1 AND i.organization_id=$2 AND i.brand_id=$3 AND i.environment_id=$4 AND p.slug=$5`, [actor.productInstanceId, actor.organizationId, actor.brandId, actor.environmentId, actor.productSlug]);
      if (!requireRow(scope.rows).available) throw new AppError(403, 'TENANT_UNAVAILABLE', 'The organization or product scope is not active.');
      return work(tx);
    });
  }
  private scope(actor: TenantContext): unknown[] { return [actor.organizationId, actor.brandId, actor.environmentId, actor.productInstanceId]; }
  private scopedWhere(start = 1, alias = ''): string {
    const prefix = alias ? `${alias}.` : '';
    return scopeColumns.map((column, index) => `${prefix}${column}=$${start + index}`).join(' AND ');
  }
  private async audit(tx: Executor, actor: Actor, action: string, resourceType: string, resourceId: string, metadata: Row = {}): Promise<void> {
    const safe = JSON.stringify(safeMetadata(metadata));
    await tx.query('INSERT INTO audit_events (id,organization_id,brand_id,environment_id,product_instance_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)', [randomUUID(), actor.organizationId ?? null, actor.brandId ?? null, actor.environmentId ?? null, actor.productInstanceId ?? null, actor.userId, action, resourceType, resourceId, actor.requestId, safe]);
    await tx.query('INSERT INTO outbox_events (id,organization_id,event_type,payload) VALUES ($1,$2,$3,$4::jsonb)', [randomUUID(), actor.organizationId ?? null, action, JSON.stringify({ resource_type: resourceType, resource_id: resourceId, request_id: actor.requestId, scope: { organization_id: actor.organizationId, brand_id: actor.brandId, environment_id: actor.environmentId, product_instance_id: actor.productInstanceId }, metadata: JSON.parse(safe) })]);
  }
  async coreList(resource: string, query: ListQuery, actor?: Actor): Promise<Page> {
    this.requireCore(actor);
    if (!Object.hasOwn(resources, resource)) throw new AppError(404, 'UNKNOWN_RESOURCE', 'This resource is not available.');
    const descriptor = resources[resource];
    return this.transaction(actor, tx => listRows(tx, descriptor, query));
  }
  async tenantList(actor: TenantContext, resource: string, query: ListQuery): Promise<Page> {
    const config = Object.hasOwn(tenantResources, resource) ? tenantResources[resource] : undefined;
    if (!config) { this.requireTenant(actor, 'overview.read'); throw new AppError(404, 'UNKNOWN_RESOURCE', 'This tenant resource is not available.'); }
    const descriptor = { ...resources[config.resource], columns: resources[config.resource].columns.filter(column => column !== 'internal_notes' && column !== 'assigned_team' && column !== 'assigned_to'), ...(resource === 'domains' ? { extras: ",jsonb_build_object('type','TXT','name','_azuriya.' || r.hostname,'value','azuriya-verification=' || r.verification_token) AS verification_record" } : {}) };
    return this.tenant(actor, config.permission, async tx => {
      if (config.scope === 'catalog') return listRows(tx, descriptor, query, ["r.supported_products ? $1 AND r.status <> 'disabled'"], [actor.productSlug]);
      if (config.scope === 'flags') return listRows(tx, { ...descriptor, columns: descriptor.columns.filter(column => column !== 'enabled'), join: ' LEFT JOIN tenant_feature_overrides o ON o.feature_key=r.key AND o.organization_id=$1 AND (o.brand_id IS NULL OR o.brand_id=$2) AND (o.environment_id IS NULL OR o.environment_id=$3) AND (o.product_instance_id IS NULL OR o.product_instance_id=$4)', extras: ',COALESCE(o.enabled,r.enabled) AS enabled' }, query, [], this.scope(actor));
      if (config.scope === 'organization') return listRows(tx, descriptor, query, ['r.organization_id=$1'], [actor.organizationId]);
      if (config.scope === 'staff') return listRows(tx, descriptor, query, ['r.organization_id=$1', '(r.environment_id IS NULL OR r.environment_id=$2)', '(r.product_instance_id IS NULL OR r.product_instance_id=$3)'], [actor.organizationId, actor.environmentId, actor.productInstanceId]);
      if (config.scope === 'audit') return listRows(tx, descriptor, query, ['r.organization_id=$1', '(r.brand_id IS NULL OR r.brand_id=$2)', '(r.environment_id IS NULL OR r.environment_id=$3)', '(r.product_instance_id IS NULL OR r.product_instance_id=$4)'], this.scope(actor));
      return listRows(tx, descriptor, query, [this.scopedWhere(1, 'r')], this.scope(actor));
    });
  }
  async overview(actor: Actor): Promise<Row> {
    if (actor.core) return this.transaction(actor, async tx => {
      const row = requireRow((await tx.query<Row>(`SELECT (SELECT count(*)::int FROM organizations) AS organizations,(SELECT count(*)::int FROM brands) AS brands,(SELECT count(*)::int FROM environments) AS environments,(SELECT count(*)::int FROM product_instances) AS product_instances,(SELECT count(*)::int FROM domains) AS domains,(SELECT count(*)::int FROM integration_requests WHERE status IN ('requested','reviewing','assigned')) AS integration_requests,(SELECT count(*)::int FROM api_keys WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) AS api_keys,(SELECT count(*)::int FROM staff_memberships WHERE status='active') AS staff`)).rows);
      const latest = await listRows(tx, resources['audit-events'], { limit: 8 });
      return { ...row, recent_audit: latest.data, external_connectors_available: false, webhook_delivery_available: false };
    });
    return this.tenant(actor as TenantContext, 'overview.read', async tx => {
      const row = requireRow((await tx.query<Row>(`SELECT (SELECT count(*)::int FROM domains WHERE organization_id=$1 AND product_instance_id=$2) AS domains,(SELECT count(*)::int FROM integration_requests WHERE organization_id=$1 AND product_instance_id=$2) AS integration_requests,(SELECT count(*)::int FROM api_keys WHERE organization_id=$1 AND product_instance_id=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) AS api_keys,(SELECT count(*)::int FROM staff_memberships WHERE organization_id=$1 AND status='active' AND (environment_id IS NULL OR environment_id=$3) AND (product_instance_id IS NULL OR product_instance_id=$2)) AS staff`, [actor.organizationId, actor.productInstanceId, actor.environmentId])).rows);
      return { ...row, product_slug: actor.productSlug!, external_connectors_available: false, webhook_delivery_available: false, ssl_provisioning_available: false };
    });
  }
  private async insertProvision(tx: Executor, input: ProvisionInput): Promise<Row> {
    const scope = await tx.query<Row>('SELECT e.id FROM environments e JOIN organizations o ON o.id=e.organization_id JOIN brands b ON b.id=e.brand_id AND b.organization_id=e.organization_id WHERE e.organization_id=$1 AND e.brand_id=$2 AND e.id=$3 AND o.status=\'active\' AND b.status=\'active\' AND e.status=\'active\'', [input.organization_id, input.brand_id, input.environment_id]);
    if (!scope.rows[0]) throw new AppError(422, 'SCOPE_MISMATCH', 'Organization, brand, and active environment must belong to the same scope.');
    const product = (await tx.query<Row>('SELECT id,name,modules FROM products WHERE slug=$1 AND status=\'active\'', [input.product_slug])).rows[0];
    if (!product) throw new AppError(422, 'PRODUCT_UNAVAILABLE', 'This product is not available for provisioning.');
    const existing = (await tx.query<Row>('SELECT id FROM product_subscriptions WHERE organization_id=$1 AND product_id=$2', [input.organization_id, product.id])).rows[0];
    const subscriptionId = existing?.id ?? randomUUID();
    if (!existing) await tx.query('INSERT INTO product_subscriptions (id,organization_id,product_id,plan,limits) VALUES ($1,$2,$3,$4,$5::jsonb)', [subscriptionId, input.organization_id, product.id, name(input.plan, 'Plan'), JSON.stringify(input.limits ?? {})]);
    return requireRow((await tx.query<Row>('INSERT INTO product_instances (id,organization_id,brand_id,environment_id,subscription_id,product_id,name,config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id,organization_id,brand_id,environment_id,subscription_id,product_id,name,status,config,created_at', [randomUUID(), input.organization_id, input.brand_id, input.environment_id, subscriptionId, product.id, product.name, JSON.stringify({ enabled_modules: product.modules ?? [] })])).rows);
  }
  async createOrganization(actor: Actor, input: OrganizationInput): Promise<Row> {
    this.requireCore(actor);
    if (!businessTypes.includes(input.business_type) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 80 || !input.products.length || input.products.length > productSlugs.length || new Set(input.products).size !== input.products.length || input.products.some(product => !productSlugs.includes(product))) throw new AppError(422, 'INVALID_INPUT', 'Choose a valid organization slug, business type, and unique product selection.');
    return this.transaction(actor, async tx => {
      let owner: Row | undefined;
      if (input.owner_email) {
        owner = (await tx.query<Row>('SELECT id,core_role FROM users WHERE email=$1 AND status=\'active\'', [input.owner_email.trim().toLowerCase()])).rows[0];
        if (!owner) throw new AppError(422, 'USER_NOT_FOUND', 'The owner must be an existing active user.');
        if (owner.core_role) throw new AppError(422, 'CORE_IDENTITY_NOT_TENANT_STAFF', 'Use a separate tenant identity for organization staff.');
      }
      const organization = requireRow((await tx.query<Row>('INSERT INTO organizations (id,name,slug,business_type) VALUES ($1,$2,$3,$4) RETURNING id,name,slug,business_type,status,created_at', [randomUUID(), name(input.name), input.slug, input.business_type])).rows);
      const brand = requireRow((await tx.query<Row>('INSERT INTO brands (id,organization_id,name,config) VALUES ($1,$2,$3,$4::jsonb) RETURNING id,organization_id,name,config,status,created_at', [randomUUID(), organization.id, name(input.brand_name), JSON.stringify({ business_name: input.brand_name.trim(), primary_color: '#3869FC' })])).rows);
      const environment = requireRow((await tx.query<Row>('INSERT INTO environments (id,organization_id,brand_id,name,kind) VALUES ($1,$2,$3,$4,$5) RETURNING id,organization_id,brand_id,name,kind,status,created_at', [randomUUID(), organization.id, brand.id, name(input.environment_name), input.environment_kind])).rows);
      const instances: Row[] = [];
      for (const product of input.products) instances.push(await this.insertProvision(tx, { organization_id: String(organization.id), brand_id: String(brand.id), environment_id: String(environment.id), product_slug: product, plan: input.plan, limits: input.limits }));
      const roleId = randomUUID();
      await tx.query('INSERT INTO roles (id,organization_id,name) VALUES ($1,$2,$3)', [roleId, organization.id, 'Owner']);
      for (const permission of permissions) await tx.query('INSERT INTO role_permissions (organization_id,role_id,permission_code) VALUES ($1,$2,$3)', [organization.id, roleId, permission]);
      if (owner) await tx.query('INSERT INTO staff_memberships (id,organization_id,user_id,role_id) VALUES ($1,$2,$3,$4)', [randomUUID(), organization.id, owner.id, roleId]);
      const scopedActor = { ...actor, organizationId: String(organization.id) };
      await this.audit(tx, scopedActor, 'organization.created', 'organizations', String(organization.id), { business_type: input.business_type, products: input.products, owner_assigned: !!owner });
      for (const instance of instances) await this.audit(tx, { ...scopedActor, brandId: String(brand.id), environmentId: String(environment.id), productInstanceId: String(instance.id) }, 'product_instance.provisioned', 'product_instances', String(instance.id), { product_id: instance.product_id });
      return { ...organization, brand, environment, product_instances: instances, owner_role_id: roleId };
    });
  }
  async provision(actor: Actor, input: ProvisionInput): Promise<Row> {
    this.requireCore(actor);
    return this.transaction(actor, async tx => {
      const instance = await this.insertProvision(tx, input);
      await this.audit(tx, { ...actor, organizationId: input.organization_id, brandId: input.brand_id, environmentId: input.environment_id, productInstanceId: String(instance.id) }, 'product_instance.provisioned', 'product_instances', String(instance.id), { product_slug: input.product_slug });
      return instance;
    });
  }
  async branding(actor: TenantContext): Promise<Row> {
    return this.tenant(actor, 'branding.read', async tx => requireRow((await tx.query<Row>('SELECT id,organization_id,name,config,status,updated_at FROM brands WHERE id=$1 AND organization_id=$2', [actor.brandId, actor.organizationId])).rows));
  }
  async updateBranding(actor: TenantContext, input: BrandConfig): Promise<Row> {
    this.requireTenant(actor, 'branding.write');
    if (!/^#[0-9a-f]{6}$/i.test(input.primary_color) || !input.business_name?.trim()) throw new AppError(422, 'INVALID_BRANDING', 'A business name and six-digit primary color are required.');
    const allowed: (keyof BrandConfig)[] = ['business_name', 'product_display_name', 'logo_url', 'dark_logo_url', 'light_logo_url', 'favicon_url', 'primary_color', 'secondary_color', 'accent_color', 'background_color', 'typography', 'support_email', 'support_url', 'terms_url', 'privacy_url', 'custom_footer', 'legal_notices', 'social_links', 'navigation_options', 'enabled_modules', 'login_branding', 'email_branding'];
    const config = Object.fromEntries(allowed.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
    return this.tenant(actor, 'branding.write', async tx => {
      const brand = requireRow((await tx.query<Row>('UPDATE brands SET config=config || $3::jsonb,name=$4,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id,organization_id,name,config,status,updated_at', [actor.brandId, actor.organizationId, JSON.stringify(config), input.business_name.trim()])).rows);
      await this.audit(tx, actor, 'branding.updated', 'brands', actor.brandId, { changed_fields: Object.keys(config) });
      return brand;
    });
  }
  private domainResponse(row: Row): Row {
    const { verification_token, ...safe } = row;
    return { ...safe, ...(verification_token ? { verification_record: verificationRecord(String(row.hostname), String(verification_token)) } : {}), ssl_provisioning_available: Boolean(process.env.DOMAIN_PROVIDER_URL && process.env.DOMAIN_PROVIDER_TOKEN), edge_routing_available: Boolean(process.env.DOMAIN_PROVIDER_URL && process.env.DOMAIN_PROVIDER_TOKEN) };
  }
  async createDomain(actor: TenantContext, input: DomainInput): Promise<Row> {
    this.requireTenant(actor, 'domains.write');
    const hostname = normalizeHostname(input.hostname);
    if ((process.env.NODE_ENV === 'production' || ['staging','production'].includes(process.env.DEPLOYMENT_ENV ?? '')) && /(^|\.)(localhost|local|test|invalid|example)$/.test(hostname)) throw new AppError(422,'INVALID_HOSTNAME','Use a deployable DNS hostname in staging and production.');
    if (!applicationTypes.includes(input.application_type)) throw new AppError(422, 'INVALID_APPLICATION_TYPE', 'Choose a supported application type.');
    try {
      return await this.tenant(actor, 'domains.write', async tx => {
        if (input.is_primary) await tx.query(`UPDATE domains SET is_primary=false,updated_at=now() WHERE ${this.scopedWhere()} AND application_type=$5 AND is_primary`, [...this.scope(actor), input.application_type]);
        const row = requireRow((await tx.query<Row>(`INSERT INTO domains (id,organization_id,brand_id,environment_id,product_instance_id,hostname,application_type,verification_token,status,is_primary,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'awaiting_dns',$9,$10) RETURNING *`, [randomUUID(), ...this.scope(actor), hostname, input.application_type, randomBytes(32).toString('base64url'), input.is_primary ?? false,actor.userId])).rows);
        await this.audit(tx, actor, 'domain.created', 'domains', String(row.id), { hostname, application_type: input.application_type });
        return this.domainResponse(row);
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'ALREADY_EXISTS') throw new AppError(409, 'HOSTNAME_UNAVAILABLE', 'This hostname is already registered or cannot be assigned.');
      throw error;
    }
  }
  async verifyDomain(actor: TenantContext, id: string): Promise<Row> {
    const original = await this.tenant(actor, 'domains.write', async tx => requireRow((await tx.query<Row>(`SELECT * FROM domains WHERE ${this.scopedWhere()} AND id=$5`, [...this.scope(actor), id])).rows));
    if (['disabled', 'suspended'].includes(String(original.status))) throw new AppError(409, 'DOMAIN_DISABLED', 'A disabled domain cannot be verified.');
    if (original.status === 'active') return this.domainResponse(original);
    if (new Date(String(original.verification_expires_at)).getTime() <= Date.now()) throw new AppError(409, 'DNS_CHALLENGE_EXPIRED', 'Rotate this domain challenge before verifying ownership.');
    await this.tenant(actor, 'domains.write', tx => tx.query(`UPDATE domains SET verification_attempts=verification_attempts+1 WHERE ${this.scopedWhere()} AND id=$5`, [...this.scope(actor), id]));
    const record = verificationRecord(String(original.hostname), String(original.verification_token));
    let verified = false;
    let failure: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const answer = await Promise.race([this.dns.resolveTxt(record.name), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('DNS timed out'), { code: 'ETIMEOUT' })), 5000); })]);
      verified = answer.some(chunks => chunks.join('') === record.value);
      if (!verified) failure = 'DNS_TXT_MISMATCH';
    } catch (error) { failure = ['ENODATA', 'ENOTFOUND', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED'].includes(dbCode(error) ?? '') ? `DNS_${dbCode(error)}` : 'DNS_LOOKUP_FAILED'; }
    finally { if (timer) clearTimeout(timer); }
    return this.tenant(actor, 'domains.write', async tx => {
      const row = requireRow((await tx.query<Row>(`UPDATE domains SET status=$6,verified_at=CASE WHEN $7 THEN now() ELSE NULL END,last_checked_at=now(),failure_information=$8,ssl_status='pending',edge_status='pending',updated_at=now() WHERE ${this.scopedWhere()} AND id=$5 AND status NOT IN ('disabled','suspended') AND verification_token=$9 AND verification_expires_at>now() RETURNING *`, [...this.scope(actor), id, verified ? 'verified' : 'awaiting_dns', verified, failure, original.verification_token])).rows);
      await this.audit(tx, actor, verified ? 'domain.verified' : 'domain.verification_failed', 'domains', id, { hostname: row.hostname, verified, failure_code: failure });
      return this.domainResponse(row);
    });
  }
  async disableDomain(actor: TenantContext, id: string): Promise<Row> {
    return this.tenant(actor, 'domains.write', async tx => {
      const row = requireRow((await tx.query<Row>(`UPDATE domains SET status='disabled',ssl_status='disabled',edge_status='disabled',is_primary=false,updated_at=now() WHERE ${this.scopedWhere()} AND id=$5 RETURNING *`, [...this.scope(actor), id])).rows);
      await this.audit(tx, actor, 'domain.disabled', 'domains', id, { hostname: row.hostname });
      if (row.certificate_reference || row.edge_reference) await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4)', [randomUUID(),actor.organizationId,'domain.delivery_cleanup',JSON.stringify({ domain_id: id, challenge_version: row.challenge_version })]);
      return this.domainResponse(row);
    });
  }
  async requestIntegration(actor: TenantContext, input: IntegrationRequestInput): Promise<Row> {
    return this.tenant(actor, 'integrations.write', async tx => {
      const row = requireRow((await tx.query<Row>('INSERT INTO integration_requests (id,organization_id,brand_id,environment_id,product_instance_id,provider_name,website,category,current_provider,notes,connection_target,requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,organization_id,brand_id,environment_id,product_instance_id,provider_name,website,category,current_provider,notes,connection_target,status,priority,created_at', [randomUUID(), ...this.scope(actor), name(input.provider_name, 'Provider name'), input.website || null, name(input.category, 'Category'), input.current_provider || null, input.notes || null, input.connection_target || null, actor.userId])).rows);
      await this.audit(tx, actor, 'integration.requested', 'integration_requests', String(row.id), { provider_name: row.provider_name, category: row.category });
      return row;
    });
  }
  async triageRequest(actor: Actor, id: string, input: { status?: string; assigned_to?: string; assigned_team?: string; internal_notes?: string; priority?: string }): Promise<Row> {
    this.requireCore(actor);
    if (input.status && !(requestStatuses as readonly string[]).includes(input.status)) throw new AppError(422, 'INVALID_STATUS', 'Choose a supported integration request status.');
    if (input.priority && !['low', 'normal', 'high', 'urgent'].includes(input.priority)) throw new AppError(422, 'INVALID_PRIORITY', 'Choose a supported request priority.');
    return this.transaction(actor, async tx => {
      const request = requireRow((await tx.query<Row>('SELECT id,organization_id,brand_id,environment_id,product_instance_id FROM integration_requests WHERE id=$1 FOR UPDATE', [id])).rows);
      if (input.assigned_to) {
        const assignee = await tx.query<Row>('SELECT id FROM users WHERE id=$1 AND core_role=\'super_admin\' AND status=\'active\'', [input.assigned_to]);
        if (!assignee.rows[0]) throw new AppError(422, 'INVALID_ASSIGNEE', 'Assign requests to an existing active Core administrator.');
      }
      const fields: [string, string | null][] = [];
      if (input.status !== undefined) fields.push(['status', input.status]);
      if (input.priority !== undefined) fields.push(['priority', input.priority]);
      if (input.assigned_to !== undefined) fields.push(['assigned_to', input.assigned_to || null]);
      if (input.assigned_team !== undefined) fields.push(['assigned_team', input.assigned_team || null]);
      if (input.internal_notes !== undefined) fields.push(['internal_notes', input.internal_notes]);
      if (!fields.length) throw new AppError(422, 'NO_CHANGES', 'Provide at least one request field to update.');
      const row = requireRow((await tx.query<Row>(`UPDATE integration_requests SET ${fields.map(([field], index) => `${field}=$${index + 2}`).join(',')},updated_at=now() WHERE id=$1 RETURNING *`, [id, ...fields.map(([, value]) => value)])).rows);
      await this.audit(tx, { ...actor, organizationId: String(request.organization_id), brandId: request.brand_id ? String(request.brand_id) : undefined, environmentId: request.environment_id ? String(request.environment_id) : undefined, productInstanceId: request.product_instance_id ? String(request.product_instance_id) : undefined }, 'integration_request.triaged', 'integration_requests', id, { status: row.status, priority: row.priority, changed_fields: fields.map(([field]) => field).filter(field => field !== 'internal_notes') });
      return row;
    });
  }
  private validatePermissions(actor: TenantContext, requested: string[]): void {
    if (!requested.length || new Set(requested).size !== requested.length || requested.some(permission => !(permissions as readonly string[]).includes(permission) || !actor.permissions.includes(permission))) throw new AppError(422, 'INVALID_SCOPES', 'Permissions must be unique supported permissions already held by the acting user.');
  }
  async createApiKey(actor: TenantContext, input: ApiKeyInput): Promise<{ key: Row; secret: string }> {
    if (actor.supportGrantId) throw new AppError(403, 'SUPPORT_DELEGATION_DENIED', 'Support access cannot create persistent credentials.');
    this.requireTenant(actor, 'api.write');
    this.validatePermissions(actor, input.scopes);
    if (input.expires_at && (!Number.isFinite(Date.parse(input.expires_at)) || Date.parse(input.expires_at) <= Date.now())) throw new AppError(422, 'INVALID_EXPIRY', 'API key expiry must be a future timestamp.');
    const secret = `azk_${randomBytes(32).toString('base64url')}`;
    const prefix = secret.slice(0, 12);
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const key = await this.tenant(actor, 'api.write', async tx => {
      if (input.application_id) {
        const app = await tx.query<{ scopes: string[] }>(`SELECT scopes FROM api_applications WHERE ${this.scopedWhere()} AND id=$5 AND status='active'`, [...this.scope(actor), input.application_id]);
        if (!app.rows[0] || input.scopes.some(scope => !app.rows[0].scopes.includes(scope))) throw new AppError(422, 'SCOPE_MISMATCH', 'The application must belong to this workspace and authorize all requested scopes.');
      }
      const row = requireRow((await tx.query<Row>('INSERT INTO api_keys (id,organization_id,brand_id,environment_id,product_instance_id,application_id,name,prefix,secret_hash,scopes,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) RETURNING id,organization_id,brand_id,environment_id,product_instance_id,application_id,name,prefix,scopes,expires_at,revoked_at,last_used_at,created_by,created_at', [randomUUID(), ...this.scope(actor), input.application_id ?? null, name(input.name), prefix, secretHash, JSON.stringify(input.scopes), input.expires_at ?? null, actor.userId])).rows);
      await this.audit(tx, actor, 'api_key.created', 'api_keys', String(row.id), { name: row.name, prefix, scopes: input.scopes });
      return { ...row, status: 'active' };
    });
    return { key, secret };
  }
  async revokeApiKey(actor: TenantContext, id: string): Promise<Row> {
    return this.tenant(actor, 'api.write', async tx => {
      const row = requireRow((await tx.query<Row>(`UPDATE api_keys SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE ${this.scopedWhere()} AND id=$5 RETURNING id,organization_id,brand_id,environment_id,product_instance_id,name,prefix,scopes,expires_at,revoked_at,last_used_at,created_by,created_at`, [...this.scope(actor), id])).rows);
      await this.audit(tx, actor, 'api_key.revoked', 'api_keys', id, { prefix: row.prefix });
      return { ...row, status: 'revoked' };
    });
  }
  private async validateRole(tx: Executor, actor: TenantContext, roleId: string): Promise<void> {
    const role = await tx.query<Row>('SELECT id FROM roles WHERE organization_id=$1 AND id=$2', [actor.organizationId, roleId]);
    if (!role.rows[0]) throw new AppError(422, 'SCOPE_MISMATCH', 'Assign a role owned by this organization.');
    const grants = await tx.query<{ permission_code: string }>('SELECT permission_code FROM role_permissions WHERE organization_id=$1 AND role_id=$2', [actor.organizationId, roleId]);
    if (grants.rows.some(row => !actor.permissions.includes(row.permission_code))) throw new AppError(403, 'PERMISSION_DENIED', 'You cannot assign a role with permissions you do not hold.');
  }
  async addStaff(actor: TenantContext, input: StaffInput): Promise<Row> {
    this.requireTenant(actor, 'staff.write');
    if ((input.environment_id && input.environment_id !== actor.environmentId) || (input.product_instance_id && input.product_instance_id !== actor.productInstanceId)) throw new AppError(422, 'SCOPE_MISMATCH', 'Staff assignments must use the current environment and product instance.');
    return this.tenant(actor, 'staff.write', async tx => {
      await this.validateRole(tx, actor, input.role_id);
      const user = (await tx.query<Row>('SELECT id,email,display_name,core_role FROM users WHERE email=$1 AND status=\'active\'', [input.email.trim().toLowerCase()])).rows[0];
      if (!user) throw new AppError(422, 'USER_NOT_FOUND', 'Staff must be an existing active user.');
      if (user.core_role) throw new AppError(422, 'CORE_IDENTITY_NOT_TENANT_STAFF', 'Use a separate tenant identity for organization staff.');
      const row = requireRow((await tx.query<Row>('INSERT INTO staff_memberships (id,organization_id,user_id,role_id,environment_id,product_instance_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,organization_id,user_id,role_id,environment_id,product_instance_id,status,created_at', [randomUUID(), actor.organizationId, user.id, input.role_id, actor.environmentId, actor.productInstanceId])).rows);
      await this.audit(tx, actor, 'staff.added', 'staff_memberships', String(row.id), { role_id: input.role_id, user_id: user.id });
      return { ...row, email: user.email, display_name: user.display_name };
    });
  }
  async updateStaff(actor: TenantContext, id: string, input: { role_id?: string; status?: string }): Promise<Row> {
    this.requireTenant(actor, 'staff.write');
    if (input.status && !['active', 'invited', 'suspended', 'disabled'].includes(input.status)) throw new AppError(422, 'INVALID_STATUS', 'Choose a supported staff status.');
    return this.tenant(actor, 'staff.write', async tx => {
      const existing = requireRow((await tx.query<Row>('SELECT id,role_id,status FROM staff_memberships WHERE id=$1 AND organization_id=$2 AND environment_id=$3 AND product_instance_id=$4 FOR UPDATE', [id, actor.organizationId, actor.environmentId, actor.productInstanceId])).rows);
      if (input.role_id || input.status === 'active') await this.validateRole(tx, actor, input.role_id ?? String(existing.role_id));
      const row = requireRow((await tx.query<Row>('UPDATE staff_memberships SET role_id=COALESCE($5,role_id),status=COALESCE($6,status),updated_at=now() WHERE id=$1 AND organization_id=$2 AND environment_id=$3 AND product_instance_id=$4 RETURNING id,organization_id,user_id,role_id,environment_id,product_instance_id,status,created_at,updated_at', [id, actor.organizationId, actor.environmentId, actor.productInstanceId, input.role_id ?? null, input.status ?? null])).rows);
      await this.audit(tx, actor, 'staff.updated', 'staff_memberships', id, { role_id: row.role_id, status: row.status });
      return row;
    });
  }
  async updateOrganization(actor: Actor, id: string, input: { name?: string; status?: string }): Promise<Row> {
    this.requireCore(actor);
    if (input.status && !['active', 'suspended', 'disabled'].includes(input.status)) throw new AppError(422, 'INVALID_STATUS', 'Choose a supported organization status.');
    return this.transaction(actor, async tx => {
      const row = requireRow((await tx.query<Row>('UPDATE organizations SET name=COALESCE($2,name),status=COALESCE($3,status),updated_at=now() WHERE id=$1 RETURNING id,name,slug,business_type,status,created_at,updated_at', [id, input.name !== undefined ? name(input.name) : null, input.status ?? null])).rows);
      await this.audit(tx, { ...actor, organizationId: id }, 'organization.updated', 'organizations', id, { status: row.status, name: row.name });
      return row;
    });
  }
  async createRole(actor: TenantContext, input: RoleInput): Promise<Row> {
    this.requireTenant(actor, 'roles.write');
    this.validatePermissions(actor, input.permissions);
    return this.tenant(actor, 'roles.write', async tx => {
      const row = requireRow((await tx.query<Row>('INSERT INTO roles (id,organization_id,name) VALUES ($1,$2,$3) RETURNING id,organization_id,name,created_at', [randomUUID(), actor.organizationId, name(input.name)])).rows);
      for (const permission of input.permissions) await tx.query('INSERT INTO role_permissions (organization_id,role_id,permission_code) VALUES ($1,$2,$3)', [actor.organizationId, row.id, permission]);
      await this.audit(tx, actor, 'role.created', 'roles', String(row.id), { name: row.name, permissions: input.permissions });
      return { ...row, permissions: input.permissions };
    });
  }
  async createWebhook(actor: TenantContext, input: WebhookInput): Promise<Row> {
    this.requireTenant(actor, 'webhooks.write');
    let target: URL;
    try { target = new URL(input.url); }
    catch { throw new AppError(422, 'INVALID_WEBHOOK_URL', 'Configure a valid public HTTPS webhook URL.'); }
    if (target.protocol !== 'https:' || target.username || target.password || target.hash || target.port && target.port !== '443' || isIP(target.hostname) || !target.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(target.hostname)) throw new AppError(422, 'INVALID_WEBHOOK_URL', 'Configure a public HTTPS URL without embedded credentials or a nonstandard port.');
    if (!input.events.length || input.events.some(event => !/^[a-z][a-z0-9_.]{0,99}$/.test(event)) || new Set(input.events).size !== input.events.length) throw new AppError(422, 'INVALID_WEBHOOK_EVENTS', 'Choose unique valid webhook event names.');
    return this.tenant(actor, 'webhooks.write', async tx => {
      const row = requireRow((await tx.query<Row>('INSERT INTO webhook_endpoints (id,organization_id,brand_id,environment_id,product_instance_id,name,url,events,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,\'disabled\') RETURNING id,organization_id,brand_id,environment_id,product_instance_id,name,url,events,status,created_at', [randomUUID(), ...this.scope(actor), name(input.name), target.href, JSON.stringify(input.events)])).rows);
      await this.audit(tx, actor, 'webhook.created', 'webhook_endpoints', String(row.id), { name: row.name, events: input.events, delivery_available: false });
      return { ...row, delivery_available: false };
    });
  }
  async setFeatureFlag(actor: Actor, input: { key: string; enabled: boolean; description?: string }): Promise<Row> {
    this.requireCore(actor);
    if (!/^[a-z][a-z0-9_.-]{0,99}$/.test(input.key) || typeof input.enabled !== 'boolean') throw new AppError(422, 'INVALID_FLAG', 'Use a valid feature key and boolean state.');
    return this.transaction(actor, async tx => {
      const row = requireRow((await tx.query<Row>('INSERT INTO feature_flags (key,enabled,description) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET enabled=EXCLUDED.enabled,description=COALESCE($4,feature_flags.description),updated_at=now() RETURNING key,enabled,description,created_at,updated_at', [input.key, input.enabled, input.description ?? '', input.description ?? null])).rows);
      await this.audit(tx, actor, 'feature_flag.updated', 'feature_flags', input.key, { enabled: input.enabled });
      return row;
    });
  }
}
