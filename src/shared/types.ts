export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Row = Record<string, JsonValue>;
export const productSlugs = ['brokerage', 'brokerage-crm', 'prop-crm', 'api', 'trading-hub', 'affiliate-portal', 'trading-terminal'] as const;
export type ProductSlug = typeof productSlugs[number];
export const businessTypes = ['brokerage', 'prop_firm', 'hybrid', 'trading_community', 'technology_provider', 'other'] as const;
export const applicationTypes = ['admin_portal', 'client_portal', 'trading_terminal', 'trading_hub', 'affiliate_portal', 'main_app', 'custom'] as const;
export const requestStatuses = ['requested', 'reviewing', 'assigned', 'in_development', 'testing', 'ready', 'connected', 'rejected', 'failed'] as const;
export const brokeragePermissions = ['brokerage.clients.read', 'brokerage.clients.write', 'brokerage.notes.read', 'brokerage.notes.write', 'brokerage.accounts.read', 'brokerage.accounts.write', 'brokerage.kyc.read', 'brokerage.kyc.review', 'brokerage.finance.read', 'brokerage.finance.write', 'brokerage.finance.approve', 'brokerage.finance.process', 'brokerage.partners.read', 'brokerage.partners.write', 'brokerage.reports.read', 'brokerage.reports.export', 'brokerage.settings.write', 'brokerage.connections.read', 'brokerage.connections.write', 'brokerage.communications.read', 'brokerage.communications.write', 'brokerage.tasks.read', 'brokerage.tasks.write'] as const;
export const permissions = ['overview.read', 'branding.read', 'branding.write', 'domains.read', 'domains.write', 'integrations.read', 'integrations.write', 'staff.read', 'staff.write', 'roles.read', 'roles.write', 'api.read', 'api.write', 'webhooks.read', 'webhooks.write', 'audit.read', 'settings.read', 'settings.write', ...brokeragePermissions] as const;
export type Permission = typeof permissions[number];
export interface Actor { userId: string; requestId: string; core: boolean; organizationId?: string; brandId?: string; environmentId?: string; productInstanceId?: string; productSlug?: string; permissions?: string[]; supportGrantId?: string }
export interface TenantContext extends Actor { organizationId: string; brandId: string; environmentId: string; productInstanceId: string; productSlug: string; permissions: string[] }
export interface ListQuery { search?: string; status?: string; limit?: number; offset?: number; sort?: string; direction?: 'asc' | 'desc' }
export interface Page { data: Row[]; pagination: { total: number; limit: number; offset: number } }
export interface BrandConfig { business_name: string; product_display_name?: string; logo_url?: string; dark_logo_url?: string; light_logo_url?: string; favicon_url?: string; primary_color: string; secondary_color?: string; accent_color?: string; background_color?: string; typography?: string; support_email?: string; support_url?: string; terms_url?: string; privacy_url?: string; custom_footer?: string; legal_notices?: string; social_links?: Record<string, string>; navigation_options?: string[]; enabled_modules?: string[]; login_branding?: Record<string, string>; email_branding?: Record<string, string> }
export interface OrganizationInput { name: string; slug: string; business_type: typeof businessTypes[number]; brand_name: string; environment_name: string; environment_kind: 'sandbox' | 'production'; products: ProductSlug[]; plan: string; owner_email?: string; limits?: Record<string, number> }
export interface ProvisionInput { organization_id: string; brand_id: string; environment_id: string; product_slug: ProductSlug; plan: string; limits?: Record<string, number> }
export interface DomainInput { hostname: string; application_type: typeof applicationTypes[number]; is_primary?: boolean }
export interface IntegrationRequestInput { provider_name: string; website?: string; category: string; current_provider?: string; notes?: string; connection_target?: string }
export interface ApiKeyInput { name: string; scopes: Permission[]; expires_at?: string; application_id?: string }
export interface StaffInput { email: string; role_id: string; environment_id?: string; product_instance_id?: string }
export interface RoleInput { name: string; permissions: Permission[] }
export interface WebhookInput { url: string; events: string[]; name: string }
