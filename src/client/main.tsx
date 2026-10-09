import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import { HostProvider } from './host';
import { EmptyState, Loading } from './components/ui';
import { HomeRedirect, Login } from './pages/Login';
import { PortalShell } from './shell/PortalShell';
import './styles.css';
import './brokerage.css';

const ClientPage = lazy(() => import('./pages/Client').then(module => ({ default: module.ClientPage })));
const CorePage = lazy(() => import('./pages/Core').then(module => ({ default: module.CorePage })));
const TenantPage = lazy(() => import('./pages/Tenant').then(module => ({ default: module.TenantPage })));
const AcceptInvitation = lazy(() => import('./pages/Security').then(module => ({ default: module.AcceptInvitation })));

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><HostProvider><AuthProvider><Suspense fallback={<div className="full-state"><Loading label="Opening your workspace" /></div>}><Routes>
  <Route path="/" element={<HomeRedirect />} /><Route path="/login" element={<Login />} />
  <Route path="/accept-invitation" element={<AcceptInvitation />} />
  <Route path="/core" element={<Navigate to="/core/overview" replace />} />
  <Route path="/core/:section" element={<PortalShell surface="core" />}><Route index element={<CorePage />} /></Route>
  <Route path="/admin/:instanceId" element={<PortalShell surface="admin" />}><Route index element={<Navigate to="overview" replace />} /><Route path=":section" element={<TenantPage />} /></Route>
  <Route path="/portal/:instanceId" element={<PortalShell surface="portal" />}><Route index element={<Navigate to="overview" replace />} /><Route path=":section" element={<ClientPage />} /></Route>
  <Route path="*" element={<div className="full-state"><EmptyState title="Page not found" description="This route is not available." action={<Link className="button secondary" to="/">Open my workspace</Link>} /></div>} />
</Routes></Suspense></AuthProvider></HostProvider></BrowserRouter></StrictMode>);
