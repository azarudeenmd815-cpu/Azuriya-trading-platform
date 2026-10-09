import { Check, Palette } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { BrandConfig, Row } from '../../shared/types';
import { mutate, useApi } from '../api';
import { Field, value, type FormField, type Values } from '../components/FormDialog';
import { ErrorState, Loading, Notice, PageHeading, SubmitButton } from '../components/ui';
import { object, str } from '../values';

const sections: { title: string; description: string; fields: FormField[] }[] = [
  { title: 'Business identity', description: 'Display names and identity assets inherited by your product portal.', fields: [{ key: 'business_name', label: 'Business name', required: true }, { key: 'product_display_name', label: 'Product display name' }, { key: 'logo_url', label: 'Logo URL', type: 'url' }, { key: 'favicon_url', label: 'Favicon URL', type: 'url' }, { key: 'dark_logo_url', label: 'Dark surface logo URL', type: 'url' }, { key: 'light_logo_url', label: 'Light surface logo URL', type: 'url' }] },
  { title: 'Color & typography', description: 'Theme tokens for white label rendering.', fields: [{ key: 'primary_color', label: 'Primary color', required: true, placeholder: '#39bfa8', help: 'Six-digit hexadecimal color.' }, { key: 'secondary_color', label: 'Secondary color' }, { key: 'accent_color', label: 'Accent color' }, { key: 'background_color', label: 'Background color' }, { key: 'typography', label: 'Font family', full: true, help: 'A system font or available font family name.' }] },
  { title: 'Support & legal', description: 'Business-owned support and compliance information.', fields: [{ key: 'support_email', label: 'Support email', type: 'email' }, { key: 'support_url', label: 'Support URL', type: 'url' }, { key: 'terms_url', label: 'Terms URL', type: 'url' }, { key: 'privacy_url', label: 'Privacy URL', type: 'url' }, { key: 'custom_footer', label: 'Footer text', full: true }, { key: 'legal_notices', label: 'Legal notices', type: 'textarea', full: true }] },
  { title: 'Portal configuration', description: 'Persist structured configuration for portal navigation, modules and branded communications.', fields: [{ key: 'social_links', label: 'Social links', type: 'textarea', full: true, help: 'JSON object of names and HTTPS links.' }, { key: 'navigation_options', label: 'Navigation options', type: 'textarea', help: 'JSON array of navigation identifiers.' }, { key: 'enabled_modules', label: 'Enabled modules', type: 'textarea', help: 'JSON array of product module identifiers.' }, { key: 'login_branding', label: 'Login branding', type: 'textarea', help: 'JSON object of string configuration values.' }, { key: 'email_branding', label: 'Email branding', type: 'textarea', help: 'JSON object of string configuration values.' }] },
];
const structured = ['social_links', 'navigation_options', 'enabled_modules', 'login_branding', 'email_branding'];
function parseStrings(raw: string, array: boolean): Record<string, string> | string[] | undefined {
  if (!raw) return undefined;
  const parsed: unknown = JSON.parse(raw);
  if (array) {
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error('Navigation options and enabled modules must be JSON arrays of strings.');
    return parsed as string[];
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(item => typeof item !== 'string')) throw new Error('Social links and branding configuration must be JSON objects with string values.');
  return parsed as Record<string, string>;
}
export function Branding({ apiBase, canWrite, onSaved }: { apiBase: string; canWrite: boolean; onSaved: () => void }) {
  const result = useApi<{ data: Row }>(`${apiBase}/branding`);
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!result.data) return;
    const data = result.data.data;
    const config = Object.keys(object(data.config)).length ? object(data.config) : data;
    const next: Values = {};
    for (const section of sections) for (const field of section.fields) next[field.key] = structured.includes(field.key) ? config[field.key] ? JSON.stringify(config[field.key], null, 2) : '' : str(config[field.key], '');
    setValues(next);
  }, [result.data]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const input: BrandConfig = { business_name: value(values, 'business_name'), primary_color: value(values, 'primary_color') };
      const optional = ['product_display_name', 'logo_url', 'dark_logo_url', 'light_logo_url', 'favicon_url', 'secondary_color', 'accent_color', 'background_color', 'typography', 'support_email', 'support_url', 'terms_url', 'privacy_url', 'custom_footer', 'legal_notices'] as const;
      for (const key of optional) if (value(values, key) || !['secondary_color', 'accent_color', 'background_color'].includes(key)) input[key] = value(values, key);
      input.social_links = parseStrings(value(values, 'social_links'), false) as Record<string, string> | undefined;
      input.navigation_options = parseStrings(value(values, 'navigation_options'), true) as string[] | undefined;
      input.enabled_modules = parseStrings(value(values, 'enabled_modules'), true) as string[] | undefined;
      input.login_branding = parseStrings(value(values, 'login_branding'), false) as Record<string, string> | undefined;
      input.email_branding = parseStrings(value(values, 'email_branding'), false) as Record<string, string> | undefined;
      await mutate(`${apiBase}/branding`, 'PATCH', input);
      setMessage('Brand configuration saved and applied to the workspace.');
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save brand configuration.'); } finally { setBusy(false); }
  }
  return <><PageHeading title="Brand & appearance" description="Configure the business identity and theme inherited by your product instance." />{result.loading ? <Loading label="Loading brand configuration" /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : <div className="branding-layout"><form onSubmit={save}><fieldset disabled={!canWrite || busy} className="unframed-fieldset">{sections.map(section => <section className="panel brand-section" key={section.title}><div className="panel-heading"><div><h2>{section.title}</h2><p>{section.description}</p></div></div><div className="form-grid">{section.fields.map(field => <Field key={field.key} field={field} value={values[field.key]} setValue={next => setValues(previous => ({ ...previous, [field.key]: next }))} />)}</div></section>)}</fieldset>{error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}{canWrite && <div className="form-save-bar"><span><Check size={15} />Changes apply to this scoped brand.</span><SubmitButton busy={busy}>Save brand configuration</SubmitButton></div>}</form><aside className="brand-preview panel"><div className="panel-heading"><div><h2>Identity preview</h2><p>Unsaved form values</p></div><Palette size={19} /></div><div className="preview-surface"><span className="preview-symbol" style={{ color: /^#[a-f\d]{6}$/i.test(value(values, 'primary_color')) ? value(values, 'primary_color') : undefined }}><Palette size={25} /></span><strong>{value(values, 'business_name') || 'Business name'}</strong><span>{value(values, 'product_display_name') || 'Product display name'}</span><button type="button" tabIndex={-1} className="button primary" style={{ backgroundColor: /^#[a-f\d]{6}$/i.test(value(values, 'primary_color')) ? value(values, 'primary_color') : undefined }}>Primary action</button><p>{value(values, 'custom_footer') || 'Business footer'}</p></div><p className="preview-note">Actual rendering depends on each product surface. Navigation and module configuration persist here; product execution remains outside Phase 1.</p></aside></div>}</>;
}
