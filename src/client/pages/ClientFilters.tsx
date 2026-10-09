import { useDeferredValue, useState, type FormEvent } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { Page, Row } from '../../shared/types';
import { useApi } from '../api';
import { Field, value, type FormField, type Values } from '../components/FormDialog';
import { Notice } from '../components/ui';
import { useWorkspace } from '../shell/PortalShell';
import { str, words } from '../values';

export const clientFilterKeys = ['country', 'kyc_status', 'tag_id', 'assigned_staff_id', 'source', 'client_type', 'registered_from', 'registered_to'];
const kycStates = ['not_started', 'required', 'submitted', 'in_review', 'additional_information', 'approved', 'rejected', 'expired'];

function localDate(timestamp: string): string {
  const parsed = new Date(timestamp);
  return timestamp && Number.isFinite(parsed.getTime()) ? new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';
}
function initialFilters(params: URLSearchParams): Values {
  return Object.fromEntries(clientFilterKeys.map(key => [key, key.startsWith('registered_') ? localDate(params.get(key) ?? '') : params.get(key) ?? '']));
}
function dateBoundary(input: string, end: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('Choose a valid registration date.');
  const date = new Date(`${input}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  if (!Number.isFinite(date.getTime()) || localDate(date.toISOString()) !== input) throw new Error('Choose a valid registration date.');
  return date.toISOString();
}

export function ClientFilters({ api }: { api: string }) {
  const { can } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const signature = JSON.stringify(clientFilterKeys.map(key => params.get(key) ?? ''));
  return can('brokerage.clients.read') ? <ClientFilterForm key={signature} api={api} params={params} update={next => setParams(next, { replace: true })} /> : null;
}

function ClientFilterForm({ api, params, update }: { api: string; params: URLSearchParams; update: (next: URLSearchParams) => void }) {
  const { can } = useWorkspace();
  const [values, setValues] = useState<Values>(() => initialFilters(params));
  const [failure, setFailure] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const deferred = useDeferredValue(staffSearch);
  const tags = useApi<{ data: Row[] }>(`${api}/tags`);
  const staffQuery = new URLSearchParams({ status: 'active', limit: '100', ...(deferred.trim() ? { search: deferred.trim().slice(0, 200) } : {}) });
  const staff = useApi<Page>(can('staff.read') ? `${api.replace(/\/brokerage$/, '')}/staff?${staffQuery}` : null);
  const members = Array.from(new Map((staff.data?.data ?? []).filter(member => member.status === 'active').map(member => [str(member.user_id), member])).values());
  const selectedTag = value(values, 'tag_id');
  const selectedStaff = value(values, 'assigned_staff_id');
  const tagOptions = (tags.data?.data ?? []).map(tag => ({ value: str(tag.id), label: `${str(tag.name)}${tag.archived_at || tag.archived === true ? ' · Archived' : ''}` }));
  const staffOptions = members.map(member => ({ value: str(member.user_id), label: `${str(member.display_name, str(member.email, 'Team member'))}${member.email ? ` · ${str(member.email)}` : ''}` }));
  if (selectedTag && !tagOptions.some(tag => tag.value === selectedTag)) tagOptions.unshift({ value: selectedTag, label: 'Current selected tag' });
  if (selectedStaff && !staffOptions.some(member => member.value === selectedStaff)) staffOptions.unshift({ value: selectedStaff, label: 'Current selected team member' });
  const fields: FormField[] = [
    { key: 'country', label: 'Country', placeholder: 'Two-letter code, such as IN', help: 'Use the client’s two-letter country code.' },
    { key: 'kyc_status', label: 'Verification status', type: 'select', options: kycStates.map(status => ({ value: status, label: words(status) })) },
    { key: 'client_type', label: 'Client type', type: 'select', options: ['individual', 'corporate'].map(type => ({ value: type, label: words(type) })) },
    { key: 'source', label: 'Acquisition source', placeholder: 'Exact recorded source', help: 'Match the recorded source, up to 120 characters.' },
    { key: 'tag_id', label: 'Client tag', type: 'select', options: tagOptions, help: tags.loading ? 'Loading workspace tags…' : 'Include clients assigned this tag.' },
    ...(can('staff.read') ? [{ key: 'staff_search', label: 'Find account manager', placeholder: 'Search name or work email', help: 'Narrow the active staff list before choosing a manager.' }, { key: 'assigned_staff_id', label: 'Account manager', type: 'select' as const, options: staffOptions, help: staff.loading ? 'Loading active team members…' : 'Showing up to 100 active memberships per search.' }] : []),
  ];
  const active = clientFilterKeys.filter(key => params.get(key)).length;
  function setField(key: string, next: Values[string]) {
    if (key === 'staff_search') setStaffSearch(typeof next === 'string' ? next : '');
    else setValues(current => ({ ...current, [key]: next }));
    setFailure('');
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    try {
      const next = new URLSearchParams(params);
      const normalized: Record<string, string> = {};
      for (const key of clientFilterKeys) normalized[key] = value(values, key);
      normalized.country = normalized.country.toUpperCase();
      if (normalized.country && !/^[A-Z]{2}$/.test(normalized.country)) throw new Error('Country must be a two-letter code, such as IN or GB.');
      if (normalized.source.length > 120) throw new Error('Acquisition source must contain no more than 120 characters.');
      if (normalized.kyc_status && !kycStates.includes(normalized.kyc_status)) throw new Error('Choose a valid verification status.');
      if (normalized.client_type && !['individual', 'corporate'].includes(normalized.client_type)) throw new Error('Choose a valid client type.');
      if (normalized.tag_id && normalized.tag_id !== params.get('tag_id') && !tags.data?.data.some(tag => tag.id === normalized.tag_id)) throw new Error('Choose a tag from the loaded workspace list.');
      if (normalized.assigned_staff_id && normalized.assigned_staff_id !== params.get('assigned_staff_id') && !members.some(member => member.user_id === normalized.assigned_staff_id)) throw new Error('Choose a team member from the loaded workspace list.');
      if (normalized.registered_from) normalized.registered_from = dateBoundary(normalized.registered_from, false);
      if (normalized.registered_to) normalized.registered_to = dateBoundary(normalized.registered_to, true);
      if (normalized.registered_from && normalized.registered_to && normalized.registered_from > normalized.registered_to) throw new Error('Registration end date must be on or after the start date.');
      for (const key of clientFilterKeys) { if (normalized[key]) next.set(key, normalized[key]); else next.delete(key); }
      next.set('offset', '0');
      update(next);
      setFailure('');
    } catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Unable to apply these filters.'); }
  }
  function clear() {
    const next = new URLSearchParams(params);
    clientFilterKeys.forEach(key => next.delete(key));
    next.set('offset', '0');
    setValues(Object.fromEntries(clientFilterKeys.map(key => [key, ''])));
    setStaffSearch(''); setFailure(''); update(next);
  }
  return <section className="panel client-filters"><details open={active > 0}><summary className="client-filter-summary"><SlidersHorizontal size={17} aria-hidden="true" /><strong>Advanced client filters</strong><span>{active ? `${active} applied` : 'Country, verification, tags, ownership and registration dates'}</span></summary><form onSubmit={apply}><div className="panel-body"><div className="form-grid">{fields.map(field => <Field key={field.key} field={{ ...field, key: `client_filter_${field.key}` }} value={field.key === 'staff_search' ? staffSearch : values[field.key]} setValue={next => setField(field.key, next)} />)}<div className="field"><label htmlFor="client-filter-registered-from">Registration from</label><input id="client-filter-registered-from" type="date" value={value(values, 'registered_from')} onChange={event => setField('registered_from', event.target.value)} /><p className="field-help">Start of this day in your local timezone.</p></div><div className="field"><label htmlFor="client-filter-registered-to">Registration through</label><input id="client-filter-registered-to" type="date" min={value(values, 'registered_from')} value={value(values, 'registered_to')} onChange={event => setField('registered_to', event.target.value)} /><p className="field-help">Includes the entire selected day.</p></div></div>{tags.error && <Notice tone="error">Unable to load workspace tags: {tags.error.message}</Notice>}{staff.error && <Notice tone="error">Unable to load team members: {staff.error.message}</Notice>}{failure && <Notice tone="error">{failure}</Notice>}<div className="client-operation-actions"><button type="submit" className="button primary">Apply filters</button><button type="button" className="button secondary" onClick={clear}>Clear filters</button></div></div></form></details></section>;
}
