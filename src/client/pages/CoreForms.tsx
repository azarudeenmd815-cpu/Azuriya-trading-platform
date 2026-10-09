import { useState } from 'react';
import type { OrganizationInput, Page, ProductSlug, ProvisionInput, Row } from '../../shared/types';
import { businessTypes, productSlugs, requestStatuses } from '../../shared/types';
import { mutate, useApi } from '../api';
import { FormDialog, value, selected, type FormField, type Values } from '../components/FormDialog';
import { str, words } from '../values';

export type CoreAction = { kind: 'organization' | 'organizationEdit' | 'provision' | 'flag' | 'triage' | 'user' | 'clientMembership' | 'staffMembership'; row?: Row };
const productOptions = productSlugs.map(slug => ({ value: slug, label: words(slug) }));
const organizationFields: FormField[] = [
  { key: 'name', label: 'Organization name', required: true },
  { key: 'slug', label: 'Workspace slug', required: true, help: 'Lowercase letters, numbers and hyphens.' },
  { key: 'business_type', label: 'Business type', type: 'select', required: true, options: businessTypes.map(type => ({ value: type, label: words(type) })) },
  { key: 'owner_email', label: 'Existing owner email', type: 'email', help: 'Optional. Create the identity in User identities first, or assign business access later through Staff access.' },
  { key: 'brand_name', label: 'First brand name', required: true },
  { key: 'environment_name', label: 'Environment name', required: true },
  { key: 'environment_kind', label: 'Environment type', type: 'select', required: true, options: [{ value: 'sandbox', label: 'Sandbox' }, { value: 'production', label: 'Production' }] },
  { key: 'plan', label: 'Subscription plan', required: true, placeholder: 'standard' },
  { key: 'products', label: 'Products to provision', type: 'multiselect', options: productOptions, full: true, help: 'Select the actual product instances to provision.' },
  { key: 'limits', label: 'Subscription limits', type: 'textarea', placeholder: '{"staff": 25}', full: true, help: 'Optional JSON object containing numeric limits.' },
];
function limits(values: Values): Record<string, number> | undefined {
  const raw = value(values, 'limits');
  if (!raw) return undefined;
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(item => typeof item !== 'number' || !Number.isFinite(item) || item < 0)) throw new Error('Limits must be a JSON object with nonnegative numeric values.');
  return parsed as Record<string, number>;
}
export function CoreForms({ action, close, saved }: { action: CoreAction; close: () => void; saved: () => void }) {
  if (action.kind === 'organizationEdit') return <FormDialog title="Edit organization" description="Organization state controls access to its product instances. Suspended or disabled organizations cannot be accessed by tenant staff or clients." fields={[{ key: 'name', label: 'Organization name', required: true }, { key: 'status', label: 'Organization status', type: 'select', required: true, options: ['active', 'suspended', 'disabled'].map(status => ({ value: status, label: words(status) })) }]} initial={{ name: str(action.row?.name, ''), status: str(action.row?.status, 'active') }} submit={values => mutate(`/core/organizations/${str(action.row?.id)}`, 'PATCH', { name: value(values, 'name'), status: value(values, 'status') })} onClose={close} onSaved={saved} />;
  if (action.kind === 'user') return <FormDialog title="Create user identity" description="Create an account before assigning an organization owner, staff role or client membership." fields={[{ key: 'email', label: 'Work email', type: 'email', required: true }, { key: 'display_name', label: 'Display name', required: true }, { key: 'password', label: 'Initial password', type: 'password', required: true, minLength: 12, full: true, help: 'Use at least 12 characters. Share credentials through your approved secure process.' }, { key: 'core_role', label: 'Core administrator', type: 'checkbox', help: 'Grant Core Super Admin access' }]} submit={values => mutate('/core/users', 'POST', { email: value(values, 'email'), display_name: value(values, 'display_name'), password: value(values, 'password'), ...(values.core_role === true ? { core_role: 'super_admin' } : {}) })} onClose={close} onSaved={saved} label="Create user" />;
  if (action.kind === 'clientMembership') return <ClientMembershipForm user={action.row} close={close} saved={saved} />;
  if (action.kind === 'staffMembership') return <StaffMembershipForm close={close} saved={saved} />;
  if (action.kind === 'organization') return <FormDialog title="Create organization" description="Provision its first brand, environment, subscriptions and selected product instances in one transaction." fields={organizationFields} initial={{ environment_kind: 'sandbox', products: [] }} submit={async values => {
    const products = selected(values, 'products') as ProductSlug[];
    if (!products.length) throw new Error('Select at least one product to provision.');
    const input: OrganizationInput = { name: value(values, 'name'), slug: value(values, 'slug'), business_type: value(values, 'business_type') as OrganizationInput['business_type'], brand_name: value(values, 'brand_name'), environment_name: value(values, 'environment_name'), environment_kind: value(values, 'environment_kind') as OrganizationInput['environment_kind'], products, plan: value(values, 'plan'), limits: limits(values), ...(value(values, 'owner_email') ? { owner_email: value(values, 'owner_email') } : {}) };
    return mutate('/core/organizations', 'POST', input);
  }} onClose={close} onSaved={saved} label="Create & provision" />;
  if (action.kind === 'provision') return <ProvisionForm close={close} saved={saved} />;
  if (action.kind === 'flag') return <FormDialog title={action.row ? 'Edit feature flag' : 'Create feature flag'} description="This updates a global platform control and records an audit event." fields={[{ key: 'key', label: 'Feature key', required: true }, { key: 'enabled', label: 'Feature state', type: 'checkbox', help: 'Enabled globally' }, { key: 'description', label: 'Description', type: 'textarea', full: true }]} initial={{ key: str(action.row?.key, ''), enabled: action.row?.enabled === true, description: str(action.row?.description, '') }} submit={values => mutate(`/core/feature-flags/${encodeURIComponent(value(values, 'key'))}`, 'PUT', { enabled: values.enabled === true, description: value(values, 'description') })} onClose={close} onSaved={saved} />;
  return <TriageForm requestRow={action.row} close={close} saved={saved} />;
}
function TriageForm({ requestRow, close, saved }: { requestRow?: Row; close: () => void; saved: () => void }) {
  const users = useApi<Page>('/core/users?limit=100');
  const assignees = (users.data?.data ?? []).filter(user => user.core_role === 'super_admin' && user.status === 'active');
  return <FormDialog title="Triage integration request" description={`Review and update ${str(requestRow?.provider_name, 'the request')}. Internal notes are visible only to Core staff.`} fields={[
    { key: 'status', label: 'Status', type: 'select', required: true, options: requestStatuses.map(status => ({ value: status, label: words(status) })) },
    { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high', 'urgent'].map(item => ({ value: item, label: words(item) })) },
    { key: 'assigned_to', label: 'Core assignee', type: 'select', options: assignees.map(user => ({ value: str(user.id), label: `${str(user.display_name)} · ${str(user.email)}` })), help: users.error ? users.error.message : 'Optional. Assign to an active Core administrator.' },
    { key: 'assigned_team', label: 'Assigned team', help: 'Optional operations team responsible for this request.' },
    { key: 'internal_notes', label: 'Internal notes', type: 'textarea', full: true },
  ]} initial={{ status: str(requestRow?.status, 'requested'), priority: str(requestRow?.priority, 'normal'), assigned_to: str(requestRow?.assigned_to, ''), assigned_team: str(requestRow?.assigned_team, ''), internal_notes: str(requestRow?.internal_notes, '') }} submit={values => mutate(`/core/integration-requests/${str(requestRow?.id)}`, 'PATCH', { status: value(values, 'status'), priority: value(values, 'priority'), ...(value(values, 'assigned_to') && value(values, 'assigned_to') !== str(requestRow?.assigned_to, '') ? { assigned_to: value(values, 'assigned_to') } : {}), assigned_team: value(values, 'assigned_team'), internal_notes: value(values, 'internal_notes') })} onClose={close} onSaved={saved} label="Update request" />;
}
function ClientMembershipForm({ user, close, saved }: { user?: Row; close: () => void; saved: () => void }) {
  const instances = useApi<Page>('/core/product-instances?limit=100');
  return <FormDialog title="Assign client portal access" description={`Grant ${str(user?.email)} client access to an existing product instance. Business staff access is assigned from business administration.`} fields={[{ key: 'product_instance_id', label: 'Product instance', type: 'select', required: true, full: true, options: (instances.data?.data ?? []).map(instance => ({ value: str(instance.id), label: `${str(instance.name)} · ${str(instance.organization_id).slice(0, 8)}` })) }]} submit={values => mutate('/core/client-memberships', 'POST', { user_id: str(user?.id), product_instance_id: value(values, 'product_instance_id') })} onClose={close} onSaved={saved} label="Assign client access" />;
}
function StaffMembershipForm({ close, saved }: { close: () => void; saved: () => void }) {
  const [instanceId, setInstanceId] = useState('');
  const users = useApi<Page>('/core/users?limit=100');
  const instances = useApi<Page>('/core/product-instances?limit=100');
  const roles = useApi<Page>('/core/roles?limit=100');
  const instance = instances.data?.data.find(record => record.id === instanceId);
  const availableRoles = (roles.data?.data ?? []).filter(role => role.organization_id === instance?.organization_id);
  const error = users.error ?? instances.error ?? roles.error;
  return <FormDialog title="Assign business staff access" description={error ? `Reference data could not be loaded: ${error.message}` : 'Assign an existing business identity to a product instance and an organization-owned role. Core identities cannot become business staff.'} fields={[
    { key: 'user_id', label: 'Business user', type: 'select', required: true, full: true, options: (users.data?.data ?? []).filter(user => !user.core_role && user.status === 'active').map(user => ({ value: str(user.id), label: `${str(user.display_name)} · ${str(user.email)}` })) },
    { key: 'product_instance_id', label: 'Product instance', type: 'select', required: true, full: true, resetFields: ['role_id'], options: (instances.data?.data ?? []).map(record => ({ value: str(record.id), label: `${str(record.organization_name, str(record.organization_id))} · ${str(record.name)} · ${str(record.id)}` })) },
    { key: 'role_id', label: 'Organization role', type: 'select', required: true, full: true, options: availableRoles.map(role => ({ value: str(role.id), label: `${str(role.name)} · ${str(role.id)}` })), help: 'Roles are limited to the selected instance’s organization.' },
  ]} submit={values => mutate('/core/staff-memberships', 'POST', { user_id: value(values, 'user_id'), product_instance_id: value(values, 'product_instance_id'), role_id: value(values, 'role_id') })} onValuesChange={values => setInstanceId(value(values, 'product_instance_id'))} onClose={close} onSaved={saved} label="Assign staff access" />;
}
function ProvisionForm({ close, saved }: { close: () => void; saved: () => void }) {
  const [scope, setScope] = useState({ organization: '', brand: '' });
  const organizations = useApi<Page>('/core/organizations?limit=100');
  const brands = useApi<Page>('/core/brands?limit=100');
  const environments = useApi<Page>('/core/environments?limit=100');
  const options = (records: Row[]) => records.map(row => ({ value: str(row.id), label: str(row.name) }));
  const brandOptions = (brands.data?.data ?? []).filter(row => row.organization_id === scope.organization);
  const environmentOptions = (environments.data?.data ?? []).filter(row => row.organization_id === scope.organization && row.brand_id === scope.brand);
  const error = organizations.error ?? brands.error ?? environments.error;
  return <FormDialog title="Provision product instance" description={error ? `Reference data could not be loaded: ${error.message}` : 'Bind a product subscription to an existing organization, brand and environment. Scope ownership is validated by the server.'} fields={[{ key: 'organization_id', label: 'Organization', type: 'select', required: true, options: options(organizations.data?.data ?? []), resetFields: ['brand_id', 'environment_id'] }, { key: 'brand_id', label: 'Brand', type: 'select', required: true, options: options(brandOptions), resetFields: ['environment_id'] }, { key: 'environment_id', label: 'Environment', type: 'select', required: true, options: options(environmentOptions) }, { key: 'product_slug', label: 'Product', type: 'select', required: true, options: productOptions }, { key: 'plan', label: 'Subscription plan', required: true }, { key: 'limits', label: 'Subscription limits', type: 'textarea', full: true, help: 'Optional JSON object containing numeric limits.' }]} submit={values => { const input: ProvisionInput = { organization_id: value(values, 'organization_id'), brand_id: value(values, 'brand_id'), environment_id: value(values, 'environment_id'), product_slug: value(values, 'product_slug') as ProductSlug, plan: value(values, 'plan'), limits: limits(values) }; return mutate('/core/product-instances', 'POST', input); }} onClose={close} onSaved={saved} label="Provision instance" onValuesChange={values => setScope({ organization: value(values, 'organization_id'), brand: value(values, 'brand_id') })} />;
}
