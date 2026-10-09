import { useDeferredValue, useRef, useState } from 'react';
import { Check, Clock3, History, Pin, Plus, UserRound } from 'lucide-react';
import type { Page, Row } from '../../shared/types';
import { request, useApi } from '../api';
import { useAuth } from '../auth';
import { FormDialog, value, type FormField, type Values } from '../components/FormDialog';
import { Badge, EmptyState, ErrorState, Loading, Modal, Notice } from '../components/ui';
import { useWorkspace } from '../shell/PortalShell';
import { date, rows, str, words } from '../values';

export interface ClientOperationsProps { api: string; client: Row; onChanged?: () => void }
const assignmentRoles = ['account_manager', 'compliance_reviewer', 'support_owner'] as const;
const priorities = ['low', 'normal', 'high', 'urgent'];
const taskStatuses = ['open', 'in_progress', 'completed', 'cancelled'];
const selectField = (key: string, label: string, choices: string[]): FormField => ({ key, label, type: 'select', required: true, options: choices.map(choice => ({ value: choice, label: words(choice) })) });
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : 'Unable to save this change. Try again.';
const activeTag = (tag: Row) => !tag.archived_at && tag.archived !== true;

function requiredText(values: Values, key: string, label: string, maximum: number): string {
  const text = value(values, key);
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > maximum) throw new Error(`${label} must contain no more than ${maximum.toLocaleString()} characters.`);
  return text;
}
function choice(values: Values, key: string, choices: string[], label: string): string {
  const selected = value(values, key);
  if (!choices.includes(selected)) throw new Error(`Choose a valid ${label.toLowerCase()}.`);
  return selected;
}

// Keep a failed request's key while its payload stays unchanged, so a retry cannot duplicate a write.
function useMutation() {
  const keys = useRef(new Map<string, string>());
  return async (path: string, method: string, body: unknown = {}) => {
    const payload = JSON.stringify(body);
    const signature = `${method}:${path}:${payload}`;
    const key = keys.current.get(signature) ?? crypto.randomUUID();
    keys.current.set(signature, key);
    const result = await request<{ data: unknown }>(path, { method, body: payload, headers: { 'Idempotency-Key': key } });
    keys.current.delete(signature);
    return result.data;
  };
}
function useDirectAction(onSaved: () => void) {
  const mutation = useMutation();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [message, setMessage] = useState('');
  async function run(path: string, method: string, body: unknown, success: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFailure(''); setMessage('');
    try { await mutation(path, method, body); setMessage(success); onSaved(); }
    catch (reason) { setFailure(errorMessage(reason)); }
    finally { pending.current = false; setBusy(false); }
  }
  function clear() { setFailure(''); setMessage(''); }
  return { busy, failure, message, run, clear };
}
function useStaffDirectory(api: string, enabled: boolean) {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const query = new URLSearchParams({ status: 'active', limit: '100', ...(deferred.trim() ? { search: deferred.trim().slice(0, 200) } : {}) });
  const result = useApi<Page>(enabled ? `${api.replace(/\/brokerage$/, '')}/staff?${query}` : null);
  const staff = Array.from(new Map((result.data?.data ?? []).filter(row => row.status === 'active' && row.user_id).map(row => [str(row.user_id), row])).values());
  const options = staff.map(member => ({ value: str(member.user_id), label: `${str(member.display_name, str(member.email, 'Team member'))}${member.email ? ` · ${str(member.email)}` : ''}` }));
  return { ...result, staff, options, setSearch };
}
function staffFields(options: { value: string; label: string }[], required = false): FormField[] {
  return [{ key: 'staff_search', label: 'Find an active team member', placeholder: 'Search name or work email', full: true, help: 'Showing up to 100 active memberships in this workspace. Search to narrow the list.' }, { key: 'owner_id', label: 'Team member', type: 'select', required, full: true, options, help: required ? 'Select an active team member.' : 'Leave blank to keep the task unassigned.' }];
}
function teamName(record: Row, staff: Row[], field = 'staff_id'): string {
  const member = staff.find(item => item.user_id === record[field]);
  return str(record.staff_name, str(record.owner_name, member ? str(member.display_name, str(member.email, 'Team member')) : record[field] ? 'Assigned team member' : 'Unassigned'));
}
function Pagination({ offset, count, total, limit, setOffset, label }: { offset: number; count: number; total: number; limit: number; setOffset: (offset: number) => void; label: string }) {
  return <div className="table-footer"><span>{count ? `${offset + 1}–${offset + count} of ${total}` : `No records on this page · ${total} total`}</span><div className="pagination" role="group" aria-label={label}><button type="button" className="button secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</button><button type="button" className="button secondary" disabled={offset + count >= total} onClick={() => setOffset(offset + limit)}>Next</button></div></div>;
}

export function ClientOperations(props: ClientOperationsProps) {
  const { can } = useWorkspace();
  return <div className="client-operations">{can('brokerage.clients.read') && <ClientTagsAssignments {...props} />}{can('brokerage.notes.read') && <ClientNotes {...props} />}{can('brokerage.tasks.read') && <ClientTasks {...props} />}</div>;
}

export function ClientTagsAssignments({ api, client, onChanged }: ClientOperationsProps) {
  const { can } = useWorkspace();
  const readable = can('brokerage.clients.read');
  const writable = can('brokerage.clients.write');
  const id = str(client.id, '');
  const record = useApi<{ data: Row }>(readable ? `${api}/clients/${id}` : null);
  const tags = useApi<{ data: Row[] }>(readable ? `${api}/tags` : null);
  const directory = useStaffDirectory(api, readable && can('staff.read'));
  const [addingTag, setAddingTag] = useState(false);
  const [assigningRole, setAssigningRole] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  function refresh() { record.reload(); onChanged?.(); }
  const action = useDirectAction(refresh);
  const profile = record.data?.data ?? client;
  const assignedTags = rows(profile.tags);
  const availableTags = (tags.data?.data ?? []).filter(tag => activeTag(tag) && !assignedTags.some(assigned => assigned.id === tag.id));
  const assignments = rows(profile.assignments);
  if (!readable) return null;
  return <div className="brokerage-related client-operations">
    {(message || action.message) && <Notice tone="success">{action.message || message}</Notice>}{action.failure && <Notice tone="error">{action.failure}</Notice>}
    {record.loading ? <Loading label="Loading client tags and staff assignments" /> : record.error ? <ErrorState error={record.error} retry={record.reload} /> : <>
      <section className="panel"><div className="panel-heading"><div><h2>Client tags</h2><p>Labels for segmentation and relationship management.</p></div>{writable && <button type="button" className="button secondary" disabled={tags.loading || Boolean(tags.error) || !availableTags.length || action.busy} onClick={() => setAddingTag(true)}><Plus size={16} aria-hidden="true" />Assign tag</button>}</div>
        {tags.error && <ErrorState error={tags.error} retry={tags.reload} />}
        <div className="panel-body">{!assignedTags.length ? <p className="field-help">No tags assigned.{!tags.loading && !tags.error && !availableTags.length && writable ? ' Create an active tag in Client tags before assigning it here.' : ''}</p> : <div className="brokerage-related">{assignedTags.map(tag => <article className="brokerage-related-row" key={str(tag.id)}><div><div><strong>{str(tag.name)}</strong>{!activeTag(tag) && <Badge value="archived" />}</div>{writable && <button type="button" className="button quiet" disabled={action.busy} aria-label={`Remove ${str(tag.name)} tag`} onClick={() => void action.run(`${api}/clients/${id}/tags/${str(tag.id)}`, 'DELETE', {}, 'Tag removed from this client.')}>Remove</button>}</div></article>)}</div>}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Staff assignments</h2><p>Ownership for account management, verification and support.</p></div><UserRound size={19} aria-hidden="true" /></div>
        {directory.error && <ErrorState error={directory.error} retry={directory.reload} />}
        <div className="panel-body brokerage-related">{assignmentRoles.map(role => { const assignment = assignments.find(item => item.role === role); return <article className="brokerage-related-row" key={role}><div><div><strong>{words(role)}</strong><p className="field-help">{assignment ? teamName(assignment, directory.staff) : 'Unassigned'}</p></div><div className="client-operation-actions">{writable && can('staff.read') && <button type="button" className="button secondary" disabled={action.busy} onClick={() => setAssigningRole(role)}>{assignment ? 'Change owner' : 'Assign owner'}</button>}{writable && assignment && <button type="button" className="button quiet" disabled={action.busy} aria-label={`Remove ${words(role).toLowerCase()} assignment`} onClick={() => void action.run(`${api}/clients/${id}/assignments`, 'POST', { role, staff_id: null }, `${words(role)} assignment removed.`)}>Remove</button>}</div></div></article>; })}{writable && !can('staff.read') && <p className="field-help">Staff directory access is required to choose a new owner.</p>}</div>
      </section>
    </>}
    {addingTag && <AssignTagDialog api={api} clientId={id} options={availableTags} close={() => setAddingTag(false)} saved={() => { setAddingTag(false); action.clear(); setMessage('Tag assigned to this client.'); refresh(); }} />}
    {assigningRole && <StaffAssignmentDialog key={assigningRole} api={api} clientId={id} role={assigningRole} close={() => setAssigningRole(null)} saved={() => { setAssigningRole(null); action.clear(); setMessage('Staff assignment saved.'); refresh(); }} />}
  </div>;
}
function AssignTagDialog({ api, clientId, options, close, saved }: { api: string; clientId: string; options: Row[]; close: () => void; saved: () => void }) {
  const mutation = useMutation();
  return <FormDialog title="Assign client tag" description="Choose an active tag from this workspace." fields={[{ key: 'tag_id', label: 'Tag', type: 'select', required: true, full: true, options: options.map(tag => ({ value: str(tag.id), label: str(tag.name) })) }]} submit={values => { const id = value(values, 'tag_id'); if (!options.some(tag => tag.id === id && activeTag(tag))) throw new Error('Choose an active tag.'); return mutation(`${api}/clients/${clientId}/tags/${id}`, 'POST'); }} onClose={close} onSaved={saved} label="Assign tag" />;
}
function StaffAssignmentDialog({ api, clientId, role, close, saved }: { api: string; clientId: string; role: string; close: () => void; saved: () => void }) {
  const { can } = useWorkspace();
  const directory = useStaffDirectory(api, can('staff.read'));
  const mutation = useMutation();
  return <FormDialog title={`Assign ${words(role).toLowerCase()}`} description={directory.error ? `Staff could not be loaded: ${directory.error.message}` : directory.loading ? 'Loading active team members…' : 'Choose the owner responsible for this client.'} fields={staffFields(directory.options, true)} onValuesChange={values => directory.setSearch(value(values, 'staff_search'))} submit={values => { const staffId = value(values, 'owner_id'); if (directory.loading || !directory.options.some(option => option.value === staffId)) throw new Error('Choose an active team member from the loaded results.'); return mutation(`${api}/clients/${clientId}/assignments`, 'POST', { role, staff_id: staffId }); }} onClose={close} onSaved={saved} label="Save assignment" />;
}

export function ClientNotes({ api, client, onChanged }: ClientOperationsProps) {
  const { can } = useWorkspace();
  const { session } = useAuth();
  const readable = can('brokerage.notes.read');
  const writable = can('brokerage.notes.write');
  const id = str(client.id, '');
  const notes = useApi<{ data: Row[] }>(readable ? `${api}/clients/${id}/notes` : null);
  const [editing, setEditing] = useState<Row | 'create' | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [history, setHistory] = useState(false);
  const [message, setMessage] = useState('');
  function refresh() { notes.reload(); onChanged?.(); }
  const action = useDirectAction(refresh);
  const canEdit = (note: Row) => writable && (note.author_id === session?.user.id || can('staff.write'));
  if (!readable) return null;
  return <section className="panel client-operations"><div className="panel-heading"><div><h2>Internal notes</h2><p>Staff notes stay within business administration.</p></div><div className="client-operation-actions"><button type="button" className="button secondary" onClick={() => setHistory(true)}><History size={16} aria-hidden="true" />Note history</button>{writable && <button type="button" className="button primary" onClick={() => setEditing('create')}><Plus size={16} aria-hidden="true" />Add note</button>}</div></div>
    {(message || action.message) && <Notice tone="success">{action.message || message}</Notice>}{action.failure && <Notice tone="error">{action.failure}</Notice>}
    {notes.loading ? <Loading label="Loading internal client notes" /> : notes.error ? <ErrorState error={notes.error} retry={notes.reload} /> : !notes.data?.data.length ? <EmptyState title="No internal notes" description="Record context, decisions and follow-up information for your team." /> : <div className="panel-body brokerage-related">{notes.data.data.map(note => <article className="brokerage-related-row" key={str(note.id)}><div><div><strong>{words(str(note.category, 'general'))}</strong>{note.pinned === true && <span className="client-note-pinned"><Pin size={14} aria-hidden="true" />Pinned</span>}</div><small>{date(note.created_at)}</small></div><p className="pre-wrap">{str(note.text, '')}</p><p className="field-help">{str(note.author_name, note.author_id === session?.user.id ? session.user.display_name : 'Team member')} · {note.visibility === 'private' ? 'Private to author' : 'Visible to staff'}{note.updated_at && note.updated_at !== note.created_at ? ` · Updated ${date(note.updated_at)}` : ''}</p>{canEdit(note) && <div className="client-operation-actions"><button type="button" className="button secondary" disabled={action.busy} onClick={() => setEditing(note)}>Edit note</button><button type="button" className="button quiet" disabled={action.busy} onClick={() => void action.run(`${api}/clients/${id}/notes/${str(note.id)}`, 'PATCH', { pinned: note.pinned !== true }, note.pinned === true ? 'Note unpinned.' : 'Note pinned.')}>{note.pinned === true ? 'Unpin' : 'Pin note'}</button><button type="button" className="button quiet" disabled={action.busy} onClick={() => setDeleting(note)}>Delete</button></div>}</article>)}</div>}
    {editing && <NoteDialog key={editing === 'create' ? 'create' : str(editing.id)} api={api} clientId={id} note={editing === 'create' ? undefined : editing} close={() => setEditing(null)} saved={() => { setEditing(null); action.clear(); setMessage(editing === 'create' ? 'Internal note added.' : 'Internal note updated.'); refresh(); }} />}
    {deleting && <DeleteNoteDialog api={api} clientId={id} note={deleting} close={() => setDeleting(null)} saved={() => { setDeleting(null); action.clear(); setMessage('Note deleted. Its revision history is retained.'); refresh(); }} />}
    {history && <NoteHistory api={api} clientId={id} close={() => setHistory(false)} />}
  </section>;
}
function NoteDialog({ api, clientId, note, close, saved }: { api: string; clientId: string; note?: Row; close: () => void; saved: () => void }) {
  const mutation = useMutation();
  const fields: FormField[] = [{ key: 'text', label: 'Note', type: 'textarea', required: true, full: true, help: 'Up to 10,000 characters.' }, { key: 'category', label: 'Category', required: true, help: 'Up to 60 characters.' }, { ...selectField('visibility', 'Visibility', ['staff', 'private']), options: [{ value: 'staff', label: 'Visible to staff' }, { value: 'private', label: 'Private to author' }] }, { key: 'pinned', label: 'Pin note', type: 'checkbox', help: 'Keep this note at the top of the client notes.' }];
  return <FormDialog title={note ? 'Edit internal note' : 'Add internal note'} description="Client portal users cannot see these notes." fields={fields} initial={{ text: str(note?.text, ''), category: str(note?.category, 'general'), visibility: str(note?.visibility, 'staff'), pinned: note?.pinned === true }} submit={values => mutation(`${api}/clients/${clientId}/notes${note ? `/${str(note.id)}` : ''}`, note ? 'PATCH' : 'POST', { text: requiredText(values, 'text', 'Note', 10000), category: requiredText(values, 'category', 'Category', 60), visibility: choice(values, 'visibility', ['staff', 'private'], 'Visibility'), pinned: values.pinned === true })} onClose={close} onSaved={saved} label={note ? 'Save note' : 'Add note'} />;
}
function DeleteNoteDialog({ api, clientId, note, close, saved }: { api: string; clientId: string; note: Row; close: () => void; saved: () => void }) {
  const mutation = useMutation();
  return <FormDialog title="Delete internal note" description={`Delete this ${str(note.category, 'general')} note: “${str(note.text, '').slice(0, 180)}${str(note.text, '').length > 180 ? '…' : ''}”. Its immutable history will remain available to authorized staff.`} fields={[]} submit={() => mutation(`${api}/clients/${clientId}/notes/${str(note.id)}`, 'DELETE')} onClose={close} onSaved={saved} label="Delete note" />;
}
function NoteHistory({ api, clientId, close }: { api: string; clientId: string; close: () => void }) {
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const result = useApi<Page>(`${api}/clients/${clientId}/notes/history?limit=${limit}&offset=${offset}`);
  return <Modal title="Internal note history" description="Preserved revisions and deletions, including notes no longer in the active list." close={close}><div className="modal-body">{result.loading ? <Loading label="Loading preserved note revisions" /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : !result.data?.data.length ? <EmptyState title="No note history" description="Saved notes and their changes will appear here." /> : <div className="brokerage-related">{result.data.data.map(revision => <article className="brokerage-related-row" key={str(revision.id)}><div><strong>{words(str(revision.category, 'general'))} · {revision.deleted === true ? 'Deleted' : 'Saved revision'}</strong><small>{date(revision.created_at)}</small></div><p className="pre-wrap">{str(revision.text, '')}</p><p className="field-help">{str(revision.editor_name, 'Team member')} · {revision.visibility === 'private' ? 'Private to author' : 'Visible to staff'}{revision.pinned === true ? ' · Pinned' : ''}</p></article>)}</div>}</div>{result.data && !result.loading && !result.error && result.data.pagination.total > limit && <Pagination offset={offset} count={result.data.data.length} total={result.data.pagination.total} limit={limit} setOffset={setOffset} label="Note history pages" />}<div className="modal-footer"><button type="button" className="button primary" onClick={close}>Close history</button></div></Modal>;
}

export function ClientTasks({ api, client, onChanged }: ClientOperationsProps) {
  const { can } = useWorkspace();
  const readable = can('brokerage.tasks.read');
  const writable = can('brokerage.tasks.write');
  const id = str(client.id, '');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Row | 'create' | null>(null);
  const [message, setMessage] = useState('');
  const limit = 25;
  const query = new URLSearchParams({ client_id: id, limit: String(limit), offset: String(offset), ...(status ? { status } : {}) });
  const tasks = useApi<Page>(readable ? `${api}/tasks?${query}` : null);
  const directory = useStaffDirectory(api, readable && can('staff.read'));
  function refresh() { tasks.reload(); onChanged?.(); }
  const action = useDirectAction(refresh);
  if (!readable) return null;
  return <section className="panel client-operations"><div className="panel-heading"><div><h2>Client tasks</h2><p>Follow-up work and due dates for this client.</p></div>{writable && <button type="button" className="button primary" onClick={() => setEditing('create')}><Plus size={16} aria-hidden="true" />Create task</button>}</div>
    {(message || action.message) && <Notice tone="success">{action.message || message}</Notice>}{action.failure && <Notice tone="error">{action.failure}</Notice>}
    <div className="panel-body"><div className="field"><label htmlFor={`client-task-status-${id}`}>Task status</label><select id={`client-task-status-${id}`} value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}><option value="">All statuses</option>{taskStatuses.map(option => <option key={option} value={option}>{words(option)}</option>)}</select></div></div>
    {tasks.loading ? <Loading label="Loading tasks for this client" /> : tasks.error ? <ErrorState error={tasks.error} retry={tasks.reload} /> : !tasks.data?.data.length ? <EmptyState title={status ? 'No tasks with this status' : 'No client tasks'} description={status ? 'Choose another status to review the client’s other tasks.' : 'Create a task to track the next step and its owner.'} /> : <div className="panel-body brokerage-related">{tasks.data.data.map(task => { const due = typeof task.due_at === 'string' ? new Date(task.due_at) : null; const overdue = Boolean(due && Number.isFinite(due.getTime()) && due.getTime() < Date.now() && !['completed', 'cancelled'].includes(str(task.status))); return <article className="brokerage-related-row" key={str(task.id)}><div><strong>{str(task.title)}</strong><Badge value={str(task.status)} /></div><dl className="detail-grid"><div><dt>Owner</dt><dd>{teamName(task, directory.staff, 'owner_id')}</dd></div><div><dt>Priority</dt><dd>{words(str(task.priority, 'normal'))}</dd></div><div><dt>Due date</dt><dd>{task.due_at ? date(task.due_at) : 'No due date'}{overdue && <span className="client-task-overdue"><Clock3 size={14} aria-hidden="true" />Overdue</span>}</dd></div><div><dt>Created</dt><dd>{date(task.created_at)}</dd></div></dl>{task.notes && <p className="pre-wrap">{str(task.notes)}</p>}{writable && <div className="client-operation-actions"><button type="button" className="button secondary" disabled={action.busy} onClick={() => setEditing(task)}>Edit task</button>{!['completed', 'cancelled'].includes(str(task.status)) && <button type="button" className="button quiet" disabled={action.busy} onClick={() => void action.run(`${api}/tasks/${str(task.id)}`, 'PATCH', { status: 'completed' }, 'Task marked complete.')}><Check size={16} aria-hidden="true" />Mark complete</button>}</div>}</article>; })}</div>}
    {tasks.data && !tasks.loading && !tasks.error && (tasks.data.pagination.total > limit || offset > 0) && <Pagination offset={offset} count={tasks.data.data.length} total={tasks.data.pagination.total} limit={limit} setOffset={setOffset} label="Client task pages" />}
    {editing && <TaskDialog key={editing === 'create' ? 'create' : str(editing.id)} api={api} clientId={id} task={editing === 'create' ? undefined : editing} close={() => setEditing(null)} saved={() => { setEditing(null); action.clear(); setMessage(editing === 'create' ? 'Client task created.' : 'Client task updated.'); if (editing === 'create') { setStatus(''); setOffset(0); } refresh(); }} />}
  </section>;
}
function localDateInput(input: Row[string] | undefined): string {
  if (typeof input !== 'string') return '';
  const dateValue = new Date(input);
  return Number.isFinite(dateValue.getTime()) ? new Date(dateValue.getTime() - dateValue.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
}
function TaskDialog({ api, clientId, task, close, saved }: { api: string; clientId: string; task?: Row; close: () => void; saved: () => void }) {
  const { can } = useWorkspace();
  const directory = useStaffDirectory(api, can('staff.read'));
  const mutation = useMutation();
  const owner = str(task?.owner_id, '');
  const ownerOptions = owner && !directory.options.some(option => option.value === owner) ? [{ value: owner, label: str(task?.owner_name, 'Current assigned team member') }, ...directory.options] : directory.options;
  const fields: FormField[] = [{ key: 'title', label: 'Task', required: true, full: true, help: 'Up to 200 characters.' }, { key: 'notes', label: 'Follow-up details', type: 'textarea', full: true, help: 'Up to 5,000 characters.' }, selectField('priority', 'Priority', priorities), { key: 'due_at', label: 'Due date and time', type: 'datetime-local', help: 'Uses your local timezone. Leave blank for no due date.' }, ...(can('staff.read') ? staffFields(ownerOptions) : []), ...(task ? [selectField('status', 'Status', taskStatuses)] : [])];
  return <FormDialog title={task ? 'Edit client task' : 'Create client task'} description={directory.error ? `Staff could not be loaded: ${directory.error.message}` : directory.loading && can('staff.read') ? 'Loading active team members…' : 'This task is linked to the current client.'} fields={fields} initial={{ title: str(task?.title, ''), notes: str(task?.notes, ''), priority: str(task?.priority, 'normal'), status: str(task?.status, 'open'), due_at: localDateInput(task?.due_at), owner_id: owner }} onValuesChange={values => directory.setSearch(value(values, 'staff_search'))} submit={values => {
    const notes = value(values, 'notes');
    if (notes.length > 5000) throw new Error('Follow-up details must contain no more than 5,000 characters.');
    const dueValue = value(values, 'due_at');
    const due = dueValue ? new Date(dueValue) : null;
    if (due && !Number.isFinite(due.getTime())) throw new Error('Choose a valid due date and time.');
    const selectedOwner = can('staff.read') ? value(values, 'owner_id') : owner;
    if (selectedOwner && selectedOwner !== owner && (directory.loading || !directory.options.some(option => option.value === selectedOwner))) throw new Error('Choose an active team member from the loaded results.');
    const body = { title: requiredText(values, 'title', 'Task', 200), notes, priority: choice(values, 'priority', priorities, 'Priority'), due_at: due ? due.toISOString() : null, ...(!task || selectedOwner !== owner ? { owner_id: selectedOwner || null } : {}), ...(task ? { status: choice(values, 'status', taskStatuses, 'Status') } : { client_id: clientId }) };
    return mutation(`${api}/tasks${task ? `/${str(task.id)}` : ''}`, task ? 'PATCH' : 'POST', body);
  }} onClose={close} onSaved={saved} label={task ? 'Save task' : 'Create task'} />;
}
