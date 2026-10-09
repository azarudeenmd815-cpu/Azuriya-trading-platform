import { ArrowRight, Command, ShieldCheck } from 'lucide-react';
import { lazy, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorState, Loading, Notice, SubmitButton } from '../components/ui';
import { PlatformMark, platformLogoUrl, usePageFavicon } from '../components/PlatformMark';
import { object, str } from '../values';
import { ApiError } from '../api';
import { ThemeToggle, useLightTheme } from '../components/ThemeToggle';
import { useHost } from '../host';

const MfaChallenge = lazy(() => import('../components/MfaChallenge').then(module => ({ default: module.MfaChallenge })));
const RecoveryCodes = lazy(() => import('../components/MfaChallenge').then(module => ({ default: module.RecoveryCodes })));

export function HomeRedirect() {
  const { session, loading } = useAuth();
  const { host, loading: hostLoading, error } = useHost();
  const location = useLocation();
  if (loading || hostLoading) return <div className="full-state"><Loading label="Opening your workspace" /></div>;
  if (error) return <div className="full-state"><ErrorState error={error} /></div>;
  if (!session) return <Navigate to="/login" replace />;
  const referral = str(object(location.state).returnTo, '').match(/^\/portal\/([a-f0-9-]{36})\/ib\?ref=([A-Z0-9]{8,32})$/);
  if (referral && !session.user.core_role && session.client_memberships?.some(row => row.product_instance_id === referral[1]) && (host?.kind !== 'tenant' || host.application_type === 'client_portal' && host.product_instance_id === referral[1])) return <Navigate to={`/portal/${referral[1]}/ib?ref=${referral[2]}`} replace />;
  if (host?.kind === 'tenant') {
    const clientHost = host.application_type === 'client_portal';
    const memberships = clientHost ? session.client_memberships : session.memberships;
    const membership = memberships?.find(row => row.product_instance_id === host.product_instance_id);
    if (!membership || session.user.core_role) return <NoMembership />;
    return <Navigate to={`/${clientHost ? 'portal' : 'admin'}/${host.product_instance_id}/overview`} replace />;
  }
  if (session.user.core_role) return <Navigate to="/core/overview" replace />;
  const staff = session.memberships?.[0];
  if (staff) return <Navigate to={`/admin/${str(staff.product_instance_id)}/overview`} replace />;
  const client = session.client_memberships?.[0];
  if (client) return <Navigate to={`/portal/${str(client.product_instance_id)}/overview`} replace />;
  return <NoMembership />;
}
export function Login() {
  const light = useLightTheme();
  const { host, loading: hostLoading, error: hostError } = useHost();
  const config = object(host?.brand?.config);
  const tenant = host?.kind === 'tenant';
  const label = tenant ? str(config.business_name, str(host.brand?.name, 'Business workspace')) : 'Azuriya Core';
  useEffect(() => { document.title = `Sign in · ${label}`; }, [label]);
  const logo = str(light ? config.light_logo_url : config.dark_logo_url, str(config.logo_url, str(light ? config.dark_logo_url : config.light_logo_url, '')));
  const mark = tenant ? <div className="brand-mark">{/^https?:\/\//.test(logo) ? <img src={logo} alt={`${label} logo`} /> : <Command size={22} />}</div> : <PlatformMark />;
  usePageFavicon(tenant ? typeof config.favicon_url === 'string' ? config.favicon_url : undefined : platformLogoUrl);
  const { session, login, loading, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<{ token: string; enroll: boolean } | null>(null); const [codes, setCodes] = useState<string[] | null>(null);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await login(email, password); } catch (reason) { if (reason instanceof ApiError && reason.code === 'MFA_REQUIRED' && typeof reason.details?.[0]?.challenge_token === 'string') { setPassword(''); setChallenge({ token: reason.details[0].challenge_token, enroll: Boolean(reason.details[0].enrollment_required) }); } else setError(reason instanceof Error ? reason.message : 'Sign in failed.'); } finally { setBusy(false); } }
  if (hostLoading) return <div className="full-state"><Loading label="Resolving your sign-in page" /></div>;
  if (hostError) return <div className="full-state"><ErrorState error={hostError} /></div>;
  if (challenge || codes) return <div className="login-page"><div className="login-brand">{mark}<strong>{label}</strong><ThemeToggle /></div><main className="login-card">{codes ? <RecoveryCodes codes={codes} close={() => { setCodes(null); setChallenge(null); void refresh(); }} /> : challenge && <MfaChallenge token={challenge.token} enroll={challenge.enroll} complete={async recovery => { if (recovery) setCodes(recovery); else { setChallenge(null); await refresh(); } }} />}</main></div>;
  if (session) return <HomeRedirect />;
  return <div className="login-page"><div className="login-brand">{mark}<strong>{label}</strong><span>{tenant ? host.application_type === 'client_portal' ? 'CLIENT PORTAL' : 'BUSINESS ADMIN' : 'PLATFORM ACCESS'}</span><ThemeToggle /></div><main className="login-card">{!tenant && <PlatformMark large />}<p className="eyebrow">Secure workspace</p><h1>Welcome back</h1><p className="page-description">{tenant ? `Sign in to your ${label} ${host.application_type === 'client_portal' ? 'client portal' : 'administration workspace'}.` : 'Sign in to manage your organizations, products, and platform operations.'}</p><form onSubmit={submit}><div className="field"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@company.com" /></div><div className="field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></div>{error && <Notice tone="error">{error}</Notice>}<SubmitButton busy={busy || loading}>Sign in<ArrowRight size={16} /></SubmitButton></form><div className="bootstrap-hint"><ShieldCheck size={17} /><p>Your account opens only the workspaces assigned to you. Contact your administrator if you need access.</p></div></main><p className="login-footnote">{str(config.custom_footer, tenant ? `${label} · Secure account access` : 'Azuriya · Secure platform access')}</p></div>;
}
function NoMembership() {
  const { logout } = useAuth();
  const [error, setError] = useState('');
  return <div className="full-state"><Notice>No product access has been assigned to this account. Ask your administrator to assign an active staff or client membership.</Notice>{error && <Notice tone="error">{error}</Notice>}<button className="button secondary" onClick={() => { void logout().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to sign out.')); }}>Sign out</button></div>;
}
