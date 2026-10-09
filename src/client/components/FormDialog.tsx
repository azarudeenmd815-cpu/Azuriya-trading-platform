import { useState, type FormEvent } from 'react';
import { Modal, Notice, SubmitButton } from './ui';

export type Values = Record<string, string | boolean | string[]>;
export interface FormField {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'url' | 'password' | 'textarea' | 'select' | 'checkbox' | 'multiselect' | 'datetime-local';
  required?: boolean;
  placeholder?: string;
  minLength?: number;
  help?: string;
  options?: { value: string; label: string }[];
  full?: boolean;
  resetFields?: string[];
}
export function FormDialog({ title, description, fields, initial = {}, submit, onClose, onSaved, label = 'Save changes', onValuesChange }: {
  title: string;
  description?: string;
  fields: FormField[];
  initial?: Values;
  submit: (values: Values) => Promise<unknown>;
  onClose: () => void;
  onSaved: (result: unknown) => void;
  label?: string;
  onValuesChange?: (values: Values) => void;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function setField(field: FormField, nextValue: Values[string]) {
    const next = { ...values, [field.key]: nextValue };
    for (const key of field.resetFields ?? []) next[key] = '';
    setValues(next);
    onValuesChange?.(next);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { const result = await submit(values); onSaved(result); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this record.'); } finally { setBusy(false); }
  }
  return <Modal title={title} description={description} close={onClose}><form onSubmit={save}><div className="modal-body"><div className="form-grid">{fields.map(field => <Field key={field.key} field={field} value={values[field.key]} setValue={next => setField(field, next)} />)}</div>{error && <Notice tone="error">{error}</Notice>}</div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><SubmitButton busy={busy}>{label}</SubmitButton></div></form></Modal>;
}
export function Field({ field, value, setValue }: { field: FormField; value: Values[string] | undefined; setValue: (value: Values[string]) => void }) {
  const id = `field-${field.key}`;
  const stringValue = typeof value === 'string' ? value : '';
  const selected = Array.isArray(value) ? value : [];
  return <div className={`field ${field.full ? 'full' : ''}`}><label htmlFor={id}>{field.label}{field.required && <span className="required-mark"> *</span>}</label>{field.type === 'select' ? <select id={id} value={stringValue} required={field.required} onChange={event => setValue(event.target.value)}><option value="">Select an option</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'multiselect' ? <div className="checkbox-grid" role="group" aria-label={field.label}>{field.options?.map(option => <label className="checkbox-row" key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={event => setValue(event.target.checked ? [...selected, option.value] : selected.filter(item => item !== option.value))} /><span>{option.label}</span></label>)}</div> : field.type === 'checkbox' ? <label className="checkbox-row"><input id={id} type="checkbox" checked={value === true} onChange={event => setValue(event.target.checked)} /><span>{field.help ?? 'Enabled'}</span></label> : field.type === 'textarea' ? <textarea id={id} value={stringValue} required={field.required} placeholder={field.placeholder} rows={4} onChange={event => setValue(event.target.value)} /> : <input id={id} type={field.type ?? 'text'} value={stringValue} required={field.required} minLength={field.minLength} placeholder={field.placeholder} autoComplete={field.type === 'password' ? 'new-password' : undefined} onChange={event => setValue(event.target.value)} />}{field.help && field.type !== 'checkbox' && <p className="field-help">{field.help}</p>}</div>;
}
export function value(values: Values, key: string, fallback = ''): string {
  const result = values[key];
  return typeof result === 'string' ? result.trim() : fallback;
}
export function selected(values: Values, key: string): string[] {
  const result = values[key];
  return Array.isArray(result) ? result : [];
}
