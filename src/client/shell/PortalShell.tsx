import { ChevronDown, ChevronRight, Command, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import type { Row } from '../../shared/types';
import { getSupportWorkspace, setSupportWorkspace, useApi } from '../api';
import { useAuth } from '../auth';
import { object, str } from '../values';
import { ErrorState, ExternalLink, Loading, Notice } from '../components/ui';
import { PlatformMark, platformLogoUrl, usePageFavicon } from '../components/PlatformMark';
import { ThemeToggle, useLightTheme } from '../components/ThemeToggle';
import { useHost } from '../host';
import { brokerageClientNavigation, brokerageNavigation, clientNavigation, coreNavigation, tenantNavigation, tradingTerminalNavigation, type NavigationItem } from './navigation';

export type Surface = 'core' | 'admin' | 'portal';
export interface WorkspaceContext { context: Row; base: string; instanceId: string; can: (permission: string) => boolean; refreshContext: () => void }
export function useWorkspace() { return useOutletContext<WorkspaceContext>(); }

export function PortalShell({ surface }: { surface: Surface }) {
  const { session, loading, error, logout } = useAuth();
  const { host } = useHost();
  const light = useLightTheme();
  const { instanceId = '', section = 'overview' } = useParams();
  const location = useLocation();
  const support = surface === 'admin' && session?.user.core_role ? getSupportWorkspace() : null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const sidebarRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const memberships = (surface === 'portal' ? session?.client_memberships ?? [] : session?.memberships ?? []).filter(item => host?.kind !== 'tenant' || item.product_instance_id === host.product_instance_id);
  const authorized = surface === 'core' ? Boolean(session?.user.core_role) : Boolean(support?.instanceId === instanceId) || !session?.user.core_role && memberships.some(item => item.product_instance_id === instanceId);
  const contextPath = authorized && surface !== 'core' ? surface === 'portal' ? `/client/instances/${instanceId}/context` : `/instances/${instanceId}/context` : null;
  const resource = useApi<{ data: Row }>(contextPath);
  const context = resource.data?.data ?? {};
  const instance = object(context.instance);
  const product = object(context.product);
  const brand = object(context.brand);
  const config = object(context.branding ?? brand.config);
  const permissions = Array.isArray(context.permissions) ? context.permissions : [];
  const can = (permission: string) => surface === 'core' || permissions.includes(permission) && !(support && ['staff.write','roles.write','api.write','settings.write'].includes(permission));
  const brokerage = product.slug === 'brokerage-crm';
  const terminal = product.slug === 'trading-terminal';
  const navigation = (surface === 'core' ? coreNavigation : surface === 'portal' ? brokerage ? brokerageClientNavigation : terminal ? tradingTerminalNavigation : clientNavigation : brokerage ? brokerageNavigation : tenantNavigation).filter(item => !item.permission || can(item.permission));
  const active = navigation.find(item => item.section === section);
  const base = surface === 'core' ? '/core' : `/${surface}/${instanceId}`;
  const label = surface === 'core' ? 'Azuriya Core' : str(config.business_name, str(brand.name, 'Business workspace'));
  const productLabel = surface === 'core' ? 'Platform control plane' : str(config.product_display_name, str(product.name, str(instance.name, 'Product workspace')));
  const accent = typeof config.primary_color === 'string' && /^#[a-f\d]{6}$/i.test(config.primary_color) ? config.primary_color : undefined;
  const footer = str(config.custom_footer, surface === 'core' ? 'Azuriya · Shared platform foundation' : `${label} · ${surface === 'portal' ? 'Client portal' : 'Business administration'}`);
  const logo = str(light ? config.light_logo_url : config.dark_logo_url, str(config.logo_url, str(light ? config.dark_logo_url : config.light_logo_url, '')));
  usePageFavicon(surface === 'core' ? platformLogoUrl : typeof config.favicon_url === 'string' && /^https?:\/\//.test(config.favicon_url) ? config.favicon_url : undefined);
  useEffect(() => { setMobileOpen(false); }, [section, instanceId]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setMobileOpen(false); return; }
      if (event.key !== 'Tab') return;
      const targets = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),select');
      if (!targets?.length) return;
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [mobileOpen]);
  useEffect(() => { document.title = `${active?.label ?? 'Workspace'} · ${label}`; }, [active?.label, label]);
  if (loading) return <div className="full-state"><Loading label="Restoring your session" /></div>;
  if (!session) return error ? <div className="full-state"><ErrorState error={error} /><Link className="button secondary" to="/login">Return to sign in</Link></div> : <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />;
  if (!authorized) return <div className="full-state"><Notice tone="error">This account does not have access to this {surface === 'core' ? 'Core administration' : surface === 'portal' ? 'client' : 'business administration'} workspace.</Notice><Link className="button primary" to="/">Open my authorized workspace</Link></div>;
  if (contextPath && resource.loading && !resource.data) return <div className="full-state"><Loading label="Resolving your workspace" /></div>;
  if (resource.error) return <div className="full-state"><ErrorState error={resource.error} retry={resource.reload} /></div>;
  const shellStyle = { ...(accent ? { '--brand-accent': accent, '--button-text': readableForeground(accent) } : {}), ...(typeof config.typography === 'string' && config.typography ? { fontFamily: config.typography } : {}) } as CSSProperties;
  const groups = Array.from(new Set(navigation.map(item => item.group)));
  async function signOut() { try { await logout(); } catch (reason) { setLogoutError(reason instanceof Error ? reason.message : 'Unable to sign out.'); } }
  return <div className={`app-shell surface-${surface}`} style={shellStyle}><a className="skip-link" href="#workspace-content">Skip to content</a>{mobileOpen && <button tabIndex={-1} className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}<aside ref={sidebarRef} className={`sidebar ${mobileOpen ? 'open' : ''}`}><div className="brand-lockup">{surface === 'core' ? <PlatformMark /> : <div className="brand-mark">{/^https?:\/\//.test(logo) ? <img src={logo} alt="" /> : <Command size={22} strokeWidth={1.7} />}</div>}<div><strong>{label}</strong><span>{surface === 'core' ? 'CORE PLATFORM' : surface === 'portal' ? 'CLIENT PORTAL' : 'BUSINESS ADMIN'}</span></div><button ref={closeButtonRef} className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button></div><div className="workspace-switcher"><p>{surface === 'core' ? 'Administration' : 'Product workspace'}</p>{surface === 'core' ? <div><ShieldCheck size={17} /><strong>Core Super Admin</strong></div> : <div className="select-wrapper"><select aria-label="Select authorized product instance" value={instanceId} onChange={event => { window.location.assign(`/${surface}/${event.target.value}/overview`); }}>{support && <option value={instanceId}>{label} · Approved support scope</option>}{memberships.map(item => <option key={str(item.product_instance_id)} value={str(item.product_instance_id)}>{[str(item.organization_name, ''), str(item.instance_name, str(item.product_name, str(item.product_instance_id))), str(item.environment_name, '')].filter(Boolean).join(' · ')}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div>}</div><nav aria-label={`${surface === 'core' ? 'Core' : surface === 'portal' ? 'Client' : 'Business'} navigation`} className="sidebar-nav">{groups.map(group => <div className="nav-group" key={group}><p>{group}</p>{navigation.filter(item => item.group === group).map(item => <NavigationLink key={item.section} item={item} base={base} />)}</div>)}</nav><div className="sidebar-footer"><span className="environment-indicator" /><span>{surface === 'core' ? 'Core platform' : str(object(context.environment).kind, 'Authorized workspace')}</span><span className="foundation-label">Platform</span></div></aside><div className="workspace" inert={mobileOpen}><header className="topbar"><div className="breadcrumb"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><span>{productLabel}</span><ChevronRight size={14} aria-hidden="true" /><strong>{active?.label ?? 'Workspace'}</strong></div><div className="topbar-actions"><ThemeToggle /><span className="security-tag"><ShieldCheck size={13} />{surface === 'core' ? 'Global access' : 'Scoped access'}</span><div className="user-chip"><span className="avatar">{session.user.display_name.slice(0, 2).toUpperCase()}</span><span><strong>{session.user.display_name}</strong><small>{session.user.email}</small></span></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><LogOut size={17} /></button></div></header><main id="workspace-content" tabIndex={-1}>{support && <div className="support-banner"><span>Approved support access · {support.reason} · Expires {new Date(support.expiresAt).toLocaleTimeString()}</span><Link to="/core/support-access-grants" className="button secondary small" onClick={() => setSupportWorkspace(null)}>Leave support workspace</Link></div>}{logoutError && <Notice tone="error">{logoutError}</Notice>}<Outlet context={{ context, base, instanceId, can, refreshContext: resource.reload } satisfies WorkspaceContext} /></main><footer className="workspace-footer"><span>{footer}</span><div className="footer-links">{surface !== 'core' && typeof config.support_url === 'string' && config.support_url && <ExternalLink href={config.support_url}>Support</ExternalLink>}{surface !== 'core' && typeof config.terms_url === 'string' && config.terms_url && <ExternalLink href={config.terms_url}>Terms</ExternalLink>}{surface !== 'core' && typeof config.privacy_url === 'string' && config.privacy_url && <ExternalLink href={config.privacy_url}>Privacy</ExternalLink>}</div></footer></div></div>;
}
function NavigationLink({ item, base }: { item: NavigationItem; base: string }) { const Icon = item.icon; return <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to={`${base}/${item.section}`}><Icon size={17} strokeWidth={1.7} aria-hidden="true" /><span>{item.label}</span></NavLink>; }
function readableForeground(hex: string) {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  return luminance > .179 ? '#000000' : '#ffffff';
}
