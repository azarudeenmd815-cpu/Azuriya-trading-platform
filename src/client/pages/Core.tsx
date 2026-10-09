import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ResourceView } from '../components/ResourceView';
import { EmptyState, Notice } from '../components/ui';
import { CoreForms, type CoreAction } from './CoreForms';
import { CoreSummary } from './CoreSummary';
import { coreResources } from './coreResources';
import { Overview } from './Overview';
import { Security } from './Security';
import { useAuth } from '../auth';
import { setSupportWorkspace } from '../api';
import { str } from '../values';
import { CoreProviderHealth } from './CoreProviderHealth';

export function CorePage() {
  const { section = 'overview' } = useParams();
  const { session } = useAuth();
  const [action, setAction] = useState<CoreAction | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const definition = coreResources[section];
  if (section === 'security') return <Security />;
  if (section === 'provider-health') return <CoreProviderHealth />;
  if (section === 'overview') return <Overview path="/core/overview" core base="/core" />;
  if (section === 'infrastructure' || section === 'system-settings') return <CoreSummary section={section} />;
  if (!definition) return <EmptyState title="Page unavailable" description="Choose an available section from the navigation." action={<Link className="button secondary" to="/core/overview">Go to overview</Link>} />;
  const actionKind = section === 'organizations' ? 'organization' : section === 'product-instances' ? 'provision' : section === 'feature-flags' ? 'flag' : section === 'users' ? 'user' : section === 'staff' ? 'staffMembership' : null;
  return <>{message && <Notice tone="success">{message}</Notice>}<ResourceView key={section} path={`/core/${definition.resource ?? section}`} {...definition} refresh={revision} action={actionKind && <button className="button primary" onClick={() => setAction({ kind: actionKind })}><Plus size={16} />{actionKind === 'organization' ? 'Create organization' : actionKind === 'provision' ? 'Provision instance' : actionKind === 'user' ? 'Create user' : actionKind === 'staffMembership' ? 'Assign staff access' : 'Create flag'}</button>} rowAction={section === 'support-access-grants' ? row => row.user_id === session?.user.id && !row.revoked_at && new Date(str(row.expires_at)).getTime() > Date.now() && <Link className="button quiet small" to={`/admin/${str(row.product_instance_id)}/overview`} onClick={() => setSupportWorkspace({ id: str(row.id), instanceId: str(row.product_instance_id), reason: str(row.reason), expiresAt: str(row.expires_at) })}>Open approved workspace</Link> : section === 'organizations' ? row => <button className="button quiet small" onClick={() => setAction({ kind: 'organizationEdit', row })}>Edit</button> : section === 'integration-requests' ? row => <button className="button quiet small" onClick={() => setAction({ kind: 'triage', row })}>Triage</button> : section === 'feature-flags' ? row => <button className="button quiet small" onClick={() => setAction({ kind: 'flag', row })}>Edit</button> : section === 'users' ? row => !row.core_role && <button className="button quiet small" onClick={() => setAction({ kind: 'clientMembership', row })}>Assign client access</button> : undefined} />{action && <CoreForms action={action} close={() => setAction(null)} saved={() => { setMessage(action.kind === 'organization' ? 'Organization and product instances provisioned successfully.' : action.kind === 'provision' ? 'Product instance provisioned successfully.' : 'Changes saved and recorded in the audit trail.'); setAction(null); setRevision(value => value + 1); }} />}</>;
}
