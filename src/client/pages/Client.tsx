import { ArrowRight, Blocks, CircleUserRound, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { JsonValue, Row } from '../../shared/types';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, EmptyState, ErrorState, Loading, Notice, PageHeading } from '../components/ui';
import { useWorkspace } from '../shell/PortalShell';
import { display, object, str, words } from '../values';
import { Security } from './Security';
import { BrokerageClient } from './BrokerageClient';
import { TradingTerminalPage } from '../trading/TradingTerminalPage';

export function ClientPage() {
  const { section = 'overview' } = useParams();
  const { context, base } = useWorkspace();
  const { session } = useAuth();
  const product = object(context.product);
  const instance = object(context.instance);
  const brand = object(context.brand);
  const config = object(context.branding ?? brand.config);
  const modules: JsonValue[] = Array.isArray(product.modules) ? product.modules : [];
  if (section === 'security') return <Security />;
  if (product.slug === 'brokerage-crm') return <BrokerageClient key={section} section={section} />;
  if (product.slug === 'trading-terminal' && section === 'overview') return <TradingTerminalPage context={context} scopeKey={str(context.product_instance_id, str(instance.id, 'trading-terminal'))} />;
  if (section === 'profile') return <ClientProfile />;
  if (section === 'modules') return <><PageHeading title="Product modules" description={`Modules declared by ${str(product.name, 'this product')}.`} /><Notice>Your business has these product modules configured. Trading, balances and payments are not yet available.</Notice>{modules.length ? <div className="module-list">{modules.map((module, index) => <section className="panel module-panel" key={index}><span className="module-icon"><Blocks size={22} /></span><div><h2>{typeof module === 'string' ? words(module) : str(object(module).name, str(object(module).slug, 'Product module'))}</h2><p>Declared product module. Its operational workflow is a future implementation.</p></div><Badge value="foundation_only" /></section>)}</div> : <EmptyState title="No modules declared" description="Your provisioned product has no module definitions in the current catalog." />}</>;
  if (section !== 'overview') return <EmptyState title="Page unavailable" action={<Link className="button secondary" to={`${base}/overview`}>Open my workspace</Link>} />;
  return <><PageHeading eyebrow="Client workspace" title={`Welcome, ${session?.user.display_name ?? 'client'}`} description={`Your authorized portal for ${str(config.business_name, str(brand.name, 'this business'))}.`} /><div className="client-overview-grid"><section className="panel"><div className="panel-heading"><div><h2>Your product access</h2><p>Resolved from your client membership</p></div><ShieldCheck size={21} /></div><dl className="context-list"><div><dt>Product</dt><dd>{str(config.product_display_name, str(product.name))}</dd></div><div><dt>Workspace</dt><dd>{str(instance.name)}</dd></div><div><dt>Status</dt><dd><Badge value={str(instance.status, 'unknown')} /></dd></div><div><dt>Portal</dt><dd>Client access</dd></div></dl><div className="panel-actions"><Link className="button secondary" to={`${base}/modules`}>Explore product modules<ArrowRight size={15} /></Link></div></section><section className="panel"><div className="panel-heading"><div><h2>Account</h2><p>Your own profile and identity</p></div><CircleUserRound size={21} /></div><div className="access-summary"><span className="large-avatar">{session?.user.display_name.slice(0, 2).toUpperCase()}</span><div><strong>{session?.user.display_name}</strong><span>{session?.user.email}</span></div></div><div className="panel-actions"><Link className="text-link" to={`${base}/profile`}>View my profile<ArrowRight size={14} /></Link></div></section></div><Notice>Your business staff manage product administration. Use this portal to view your workspace, profile and account security.</Notice>{config.legal_notices && <section className="panel legal-notice"><h2>Business legal notice</h2><p>{display(config.legal_notices)}</p></section>}</>;
}
function ClientProfile() {
  const result = useApi<{ data: Row }>('/client/profile');
  return <><PageHeading title="My profile" description="View your account details. Contact your business staff to request a profile change." />{result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : <section className="panel"><div className="panel-heading"><div><h2>Account details</h2><p>Own identity only</p></div><CircleUserRound size={21} /></div><dl className="detail-grid">{Object.entries(result.data?.data ?? {}).map(([key, value]) => <div key={key}><dt>{words(key)}</dt><dd>{display(value)}</dd></div>)}</dl></section>}</>;
}
