import { Copy, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Row } from '../../shared/types';
import { mutate } from '../api';
import { ResourceView } from '../components/ResourceView';
import { EmptyState, Modal, Notice } from '../components/ui';
import { useWorkspace } from '../shell/PortalShell';
import { object, str } from '../values';
import { BrokerageAdmin, brokerageResources } from './Brokerage';
import { Branding } from './Branding';
import { DomainInstructions } from './DomainInstructions';
import { Integrations } from './Integrations';
import { Overview } from './Overview';
import { Settings } from './Settings';
import { TenantForms, type TenantAction } from './TenantForms';
import { tenantResources } from './tenantResources';
import { Security } from './Security';
import { Activation } from './Activation';

export function TenantPage() {
  const { section = 'overview' } = useParams();
  const { instanceId, context, base, can, refreshContext } = useWorkspace();
  const apiBase = `/instances/${instanceId}`;
  const [action, setAction] = useState<TenantAction | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [domain, setDomain] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setMessage(''); setError(''); setSecret(''); setDomain(null); }, [section, instanceId]);
  function saved(result: unknown) {
    const kind = action?.kind;
    setAction(null);
    setRevision(value => value + 1);
    setMessage(kind === 'integration' ? 'Integration request submitted to Core operations.' : kind === 'key' ? 'API key created. Copy the secret below before closing.' : 'Changes saved and captured in the audit trail.');
    if (kind === 'key' && result !== null && typeof result === 'object' && 'secret' in result && typeof result.secret === 'string') setSecret(result.secret);
    if (kind === 'domain' && result !== null && typeof result === 'object' && 'hostname' in result) setDomain(result as Row);
  }
  async function verify(operation = 'verify') { if (!domain) return; setBusy(true); setError(''); try { const record = await mutate<Row>(`${apiBase}/domains/${str(domain.id)}/${operation}`, 'POST'); setDomain(record); setRevision(value => value + 1); setMessage('Domain operation completed. Review the current verification, HTTPS and routing status.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to verify DNS.'); } finally { setBusy(false); } }
  const definition = tenantResources[section];
  const actionKind = section === 'domains' ? 'domain' : section === 'integration-requests' ? 'integration' : section === 'staff' ? 'staff' : section === 'roles' ? 'role' : section === 'api-keys' ? 'key' : section === 'webhooks' ? 'webhook' : null;
  const permission = section === 'api-keys' ? 'api' : section.startsWith('integration') ? 'integrations' : section;
  let content;
  if (object(context.product).slug === 'brokerage-crm' && (brokerageResources[section] || ['overview','reports','brokerage-settings','trading-hub'].includes(section))) content = <BrokerageAdmin key={section} section={section} />;
  else if (section === 'security') content = <Security apiBase={apiBase} can={can} />;
  else if (['invitations', 'api-applications', 'service-accounts', 'webhooks', 'webhook-deliveries', 'support-access'].includes(section)) content = <Activation section={section} apiBase={apiBase} can={can} />;
  else if (section === 'overview') content = <Overview path={`${apiBase}/overview`} context={context} base={base} />;
  else if (section === 'branding') content = <Branding apiBase={apiBase} canWrite={can('branding.write')} onSaved={refreshContext} />;
  else if (section === 'settings') content = <Settings apiBase={apiBase} />;
  else if (section === 'integrations') content = <Integrations apiBase={apiBase} routeBase={base} canRequest={can('integrations.write')} requestProvider={row => setAction({ kind: 'integration', row })} />;
  else if (definition) content = <ResourceView key={section} path={`${apiBase}/${section}`} {...definition} refresh={revision} action={actionKind && can(`${permission}.write`) && <button className="button primary" onClick={() => setAction({ kind: actionKind })}><Plus size={16} />{section === 'domains' ? 'Add domain' : section === 'staff' ? 'Assign member' : section === 'roles' ? 'Create role' : section === 'api-keys' ? 'Create API key' : section === 'webhooks' ? 'Create endpoint' : 'Request Integration'}</button>} rowAction={section === 'staff' && can('staff.write') ? row => row.product_instance_id === instanceId && <button className="button quiet small" onClick={() => setAction({ kind: 'staffEdit', row })}>Edit access</button> : section === 'domains' ? row => <><button className="button quiet small" onClick={() => setDomain(row)}>DNS instructions</button>{can('domains.write') && row.status !== 'disabled' && <button className="button quiet danger small" onClick={() => setAction({ kind: 'disable', row })}>Disable</button>}</> : section === 'api-keys' && can('api.write') ? row => !row.revoked_at && <button className="button quiet danger small" onClick={() => setAction({ kind: 'revoke', row })}>Revoke</button> : undefined} />;
  else content = <EmptyState title="Page unavailable" description="Select an available workspace section." action={<Link className="button secondary" to={`${base}/overview`}>Go to overview</Link>} />;
  return <>{message && <Notice tone="success">{message}</Notice>}{error && <Notice tone="error">{error}</Notice>}{content}{action && <TenantForms action={action} base={apiBase} can={can} close={() => setAction(null)} saved={saved} />}{domain && <DomainInstructions domain={domain} close={() => setDomain(null)} verify={() => void verify()} rotate={() => void verify('rotate-challenge')} reconcile={() => void verify('reconcile')} busy={busy} canVerify={can('domains.write')} />}{secret && <Modal title="Copy your API secret" description="This secret is held only in this page's memory. It cannot be recovered after closing." close={() => setSecret('')}><div className="modal-body"><Notice>Store the key in a secure secrets manager before closing this dialog.</Notice><code className="secret-value">{secret}</code><button className="button secondary" onClick={() => { void navigator.clipboard.writeText(secret).then(() => setCopied(true)).catch(() => setError('Clipboard access failed. Select and copy the secret manually.')); }}><Copy size={15} />{copied ? 'Copied' : 'Copy secret'}</button></div><div className="modal-footer"><button className="button primary" onClick={() => { setSecret(''); setCopied(false); }}>I have saved the secret</button></div></Modal>}</>;
}
