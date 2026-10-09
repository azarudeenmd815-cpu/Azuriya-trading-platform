import { AlertCircle, ArrowUpRight, CheckCircle2, Inbox, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { ApiError } from '../api';
import { words } from '../values';

export function Badge({ value }: { value: string }) {
  const kind = /^(active|ready|connected|enabled|verified|production|success)$/.test(value) ? 'positive' : /^(failed|rejected|revoked|disabled|suspended)$/.test(value) ? 'negative' : /^(pending|requested|reviewing|testing|sandbox|in_development|dns_verified|awaiting_dns)$/.test(value) ? 'pending' : 'neutral';
  return <span className={`badge ${kind}`}><span aria-hidden="true" />{words(value)}</span>;
}
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'error' }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}><Icon size={17} aria-hidden="true" /><div>{children}</div></div>;
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return <div className="state-block error-state"><AlertCircle size={26} aria-hidden="true" /><h2>Unable to load this view</h2><p>{error.message}</p>{error instanceof ApiError && error.requestId && <code>Request {error.requestId}</code>}{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>;
}
export function EmptyState({ title = 'No records yet', description = 'Records will appear here when they are created.', action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="state-block" role="status"><Inbox size={28} aria-hidden="true" /><h2>{title}</h2><p>{description}</p>{action}</div>;
}
export function Loading({ label = 'Loading records' }: { label?: string }) {
  return <div className="loading-block" role="status" aria-label={label}><span className="sr-only">{label}</span><div className="skeleton skeleton-title" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;
}
export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}
export function Modal({ title, description, children, close }: { title: string; description?: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}><div className="modal-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={19} /></button></div>{children}</dialog>;
}
export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <button type="submit" className="button primary" disabled={busy}>{busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}{busy ? 'Saving…' : children}</button>;
}
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-link">{children}<ArrowUpRight size={14} aria-hidden="true" /></a>;
}
